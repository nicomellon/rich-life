#!/bin/sh
# Starts the API in the production image: apply the migrations, then replace this shell
# with uvicorn so it receives the container's stop signals.
set -eu

alembic upgrade head

# Only the web server in front of the API can reach it, so trust its X-Forwarded-*
# headers for the client's address and scheme. HOST=:: listens on IPv6 only, for
# private networks such as Fly.io's that have no IPv4.
exec uvicorn app.main:app --host "${HOST:-0.0.0.0}" --port 8000 \
    --proxy-headers --forwarded-allow-ips '*' "$@"
