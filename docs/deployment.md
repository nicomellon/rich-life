# Deployment

Rich Life runs in production as four containers, described by `docker-compose.prod.yml`:

| Service | Image | What it does |
|---|---|---|
| `db` | `postgres:18-alpine` | The database, with its data in the `db-data` volume. Not reachable from outside the compose network. |
| `redis` | `redis:8-alpine` | Holds the magic-link tokens and rate-limit counts, which only need to last minutes, so it keeps nothing on disk. Not reachable from outside the compose network. |
| `backend` | `backend/Dockerfile` | The API. On every start it applies the migrations (`alembic upgrade head`), then runs uvicorn on port 8000. |
| `web` | `frontend/Dockerfile` | Caddy, serving the web app's static build and proxying `/api` to the backend, on ports 80 and 443. |

The browser only ever talks to `web`, so the web app and the API share one origin and CORS never comes into play. Caddy gets and renews an HTTPS certificate from Let's Encrypt for the domain on its own.

This guide deploys to a single server (a VPS) with Docker. [Other platforms](#other-platforms) covers Fly.io, Render and the like.

## Choose the domain first

Passkeys need HTTPS, and each passkey is bound to the domain the app is served from (the WebAuthn relying party ID). **Changing the domain later invalidates every registered passkey**, and users would have to register new accounts. Pick the domain you intend to keep, e.g. `app.example.com`, before anyone signs up.

`DOMAIN` sets the relying party ID, the origin the backend expects in every passkey ceremony (`https://<DOMAIN>`) and the certificate Caddy requests, so they always match.

## Deploy to a server

You need:

- A Linux server with [Docker Engine](https://docs.docker.com/engine/install/) 27.0 or later and the Compose plugin, and at least 1 GB of memory for the builds. `docker-compose.prod.yml` turns on IPv6 for its network, which needs Docker 27.0 or later, so that Caddy sees the real address of visitors who connect over IPv6. On an older Docker those visitors would all seem to come from the network's gateway and share one budget of the per-IP rate limits for sign-in links. If you can't upgrade, don't publish an `AAAA` record for the domain.
- A DNS `A` (and, if the server has IPv6, `AAAA`) record pointing your domain at the server.
- Ports 80 and 443 open to the internet. Let's Encrypt checks the domain over port 80 before it issues the certificate.

Then, on the server:

```sh
git clone https://github.com/nicomellon/rich-life.git
cd rich-life
cp .env.production.example .env.production
```

Edit `.env.production`: set `DOMAIN`, generate `POSTGRES_PASSWORD` and `JWT_SECRET` with `openssl rand -hex 32` each, and set `EMAIL_API_KEY` and `EMAIL_FROM` for sending sign-in links through [Resend](https://resend.com). Use hex (or other URL-safe) passwords, since the password goes into the backend's database URL. Keep the file private, e.g. `chmod 600 .env.production`.

Point Compose at the production file and settings. Every `docker compose` command in this section needs these two variables, so set them in each new shell on the server (or add them to its shell profile, with the full path to the checkout):

```sh
export COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILES=.env.production
```

Build and start the stack:

```sh
APP_VERSION=$(git rev-parse --short HEAD) docker compose up -d --build
```

Open `https://<DOMAIN>` and register. `docker compose logs -f` follows the logs; the first start shows the migrations and Caddy obtaining the certificate.

### Update

```sh
git pull
APP_VERSION=$(git rev-parse --short HEAD) docker compose up -d --build
```

The backend applies any new migrations when it starts, before it serves requests. `https://<DOMAIN>/api/...` is the API; the backend's `/health` isn't exposed through Caddy, but `docker compose ps` shows whether its health check passes.

### Back up the database

```sh
docker compose exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > rich-life-$(date +%F).sql
```

To restore a dump, replace the database with an empty one and load the dump into it. Stop the backend first: it applies the migrations when it starts, so its tables would clash with the dump's.

```sh
docker compose stop backend web
docker compose exec db \
  sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < rich-life-2026-09-26.sql
docker compose start backend web
```

Copy dumps off the server: the volumes live on its disk.

## Settings

`docker-compose.prod.yml` reads these from `.env.production` (or the environment) and derives the backend's settings from them. The backend's own variables are listed in [backend/README.md](../backend/README.md#configuration).

| Variable | Required | Default | |
|---|---|---|---|
| `DOMAIN` | yes | | The domain, without scheme or port. Sets the passkey relying party ID, the expected origin and Caddy's site address. |
| `POSTGRES_PASSWORD` | yes | | Database password. |
| `JWT_SECRET` | yes | | Signs access tokens; at least 32 characters. |
| `EMAIL_API_KEY` | yes | | [Resend](https://resend.com) API key, for emailing sign-in links. The backend doesn't start without it. |
| `EMAIL_FROM` | yes | | The sign-in emails' sender, e.g. `Rich Life <sign-in@app.example.com>`, on a domain verified in Resend. |
| `POSTGRES_USER` | no | `richlife` | Database user. |
| `POSTGRES_DB` | no | `richlife` | Database name. |
| `WEBAUTHN_RP_NAME` | no | `Rich Life` | Name shown in the browser's passkey prompts. |
| `EMAIL_DELIVERY` | no | `resend` | `log` writes sign-in links to the backend's log instead of emailing them; only for a local trial. |
| `APP_VERSION` | no | `dev` | Build label shown in the backend's `/health`, e.g. a commit SHA. |
| `SITE_ADDRESS` | no | `DOMAIN` | What Caddy serves. Override it only for a local trial (`http://localhost`) or behind a TLS-terminating platform (`:80`). |
| `PUBLIC_ORIGIN` | no | `https://<DOMAIN>` | The origin the browser sees. Override it only together with `SITE_ADDRESS`. |
| `HTTP_PORT`, `HTTPS_PORT` | no | `80`, `443` | Host ports. Caddy needs the defaults to get a certificate. |

The web image reads four variables of its own, documented in `frontend/Caddyfile`: `SITE_ADDRESS`, `API_UPSTREAM` (the backend's address, `backend:8000` by default), and `TRUSTED_PROXIES` and `CLIENT_IP_HEADER`, which tell Caddy how to find the client's IP behind another proxy (see [Other platforms](#other-platforms)). On a server of its own, as here, leave the last two unset: Caddy then takes the client's IP from the connection.

## Try it locally

`make prod-smoke` builds both images, starts the stack over plain HTTP on http://localhost:8080, checks that the web app and the API answer through Caddy, and removes the stack again. CI runs it on every pull request.

To keep the stack running and use it in a browser (passkeys work on `localhost` without HTTPS):

```sh
DOMAIN=localhost SITE_ADDRESS=http://localhost PUBLIC_ORIGIN=http://localhost:8080 \
  HTTP_PORT=8080 HTTPS_PORT=8443 POSTGRES_PASSWORD=local JWT_SECRET=$(openssl rand -hex 32) \
  EMAIL_DELIVERY=log docker compose -f docker-compose.prod.yml -p rich-life-local up -d --build
```

Remove it with `docker compose -f docker-compose.prod.yml -p rich-life-local down --volumes`, passing the same variables.

## Other platforms

On a platform that runs containers and terminates TLS itself, such as Fly.io or Render, deploy the two images as separate services instead of using the compose file:

- **Database:** use the platform's managed Postgres, and give the backend its connection string as `DATABASE_URL` in the `postgresql+psycopg://` form.
- **Redis:** use the platform's managed Redis, or run `redis:8-alpine` as a private service, and give the backend its URL as `REDIS_URL`.
- **Backend** (`backend/Dockerfile`, port 8000, private): set `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `EMAIL_DELIVERY=resend` with `EMAIL_API_KEY` and `EMAIL_FROM`, `WEBAUTHN_RP_ID` (the domain), `WEBAUTHN_ORIGIN` (`https://<domain>`) and `CORS_ORIGINS` (the same origin). Run a single instance, since each start runs the migrations. The API listens on `0.0.0.0` (IPv4) by default; set `HOST=::` to listen on IPv6 only where the private network is IPv6, as Fly.io's `.internal` network is.
- **Web** (`frontend/Dockerfile`, public): set `SITE_ADDRESS` to `:<port>`, the port the platform routes traffic to, so Caddy serves plain HTTP and leaves certificates to the platform, and `API_UPSTREAM` to the backend's private address, e.g. `rich-life-backend.internal:8000` on Fly.io.
  - Also tell Caddy where the platform's proxy puts the client's IP. The backend limits sign-in link requests per client IP, so without this every request seems to come from the platform's proxy, and 20 requests in 15 minutes lock everyone out. Set `TRUSTED_PROXIES` to the addresses the platform's proxy connects from, and `CLIENT_IP_HEADER` to the header it sets:
    - **Fly.io:** `TRUSTED_PROXIES=private_ranges` and `CLIENT_IP_HEADER=Fly-Client-IP`.
    - **Render** and other platforms that append the client's IP to `X-Forwarded-For`: `TRUSTED_PROXIES=private_ranges`, leaving `CLIENT_IP_HEADER` at its default, `X-Forwarded-For`.

    Check the platform's documentation for the ranges its proxy uses. Caddy only believes the header from those addresses, and reads `X-Forwarded-For` from the right, so a client can't choose its own IP by sending the header itself.

Attach the domain you chose to the web service. The same rule applies: passkeys are bound to that domain.
