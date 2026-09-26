# Production image for the web app. Build from this directory:  docker build -t rich-life-web .
# Caddy serves the static build and proxies /api to the backend, so the browser only
# ever talks to one origin. See Caddyfile for its settings.

FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first, so this layer is cached until the lock file changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM caddy:2-alpine

# Run as an unprivileged user; the caddy binary keeps cap_net_bind_service, so it can
# still listen on ports 80 and 443. It owns /data and /config, which the volumes that
# hold its certificates copy when they're first created.
RUN addgroup -S caddy && adduser -S -G caddy caddy && chown -R caddy:caddy /data /config

# The config and the build stay root-owned, so the server can't change them.
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
USER caddy

EXPOSE 80 443 443/udp
