#!/bin/sh
# Builds and starts the production stack (docker-compose.prod.yml) over plain HTTP on
# localhost, checks that the web app and the API answer through Caddy, then removes
# the stack and its volumes. Run it with `make prod-smoke`.
set -eu

port="${HTTP_PORT:-8080}"
base_url="http://localhost:${port}"
compose="docker compose -f docker-compose.prod.yml -p rich-life-smoke"

export DOMAIN=localhost
export SITE_ADDRESS=http://localhost
export PUBLIC_ORIGIN="$base_url"
export HTTP_PORT="$port"
export HTTPS_PORT="${HTTPS_PORT:-8443}"
export POSTGRES_PASSWORD=smoke-test-password
export JWT_SECRET=smoke-test-secret-that-is-at-least-32-characters

cleanup() {
    $compose down --volumes
}
trap cleanup EXIT

# --wait returns once every service is running and the backend's health check passes,
# which means its migrations have run.
if ! $compose up --build --detach --wait; then
    echo "The stack didn't become healthy. Logs:"
    $compose logs --tail 50
    exit 1
fi

failures=0

# check <description> <expected status> <expected text in the response> <curl arguments...>
# An empty expected text checks the status only.
check() {
    description="$1"
    expected_status="$2"
    expected_text="$3"
    shift 3
    response_body_file="$(mktemp)"
    # A connection that fails outright reports status 000 instead of stopping the
    # script, so the failure and the logs are still printed.
    status="$(curl --silent --retry 5 --retry-connrefused --retry-delay 1 \
        --output "$response_body_file" --write-out '%{http_code}' "$@" || true)"
    if [ "$status" = "$expected_status" ] &&
        { [ -z "$expected_text" ] || grep -q "$expected_text" "$response_body_file"; }; then
        echo "ok    $description"
    else
        echo "FAIL  $description: got $status: $(head -c 200 "$response_body_file")"
        failures=$((failures + 1))
    fi
    rm -f "$response_body_file"
}

check "the web app is served at /" 200 '<div id="root">' "$base_url/"
check "client-side routes load the web app" 200 '<div id="root">' "$base_url/plan"
check "a sign-in challenge is issued, so migrations ran" 200 '"challenge"' \
    --request POST "$base_url/api/v1/auth/login-challenge"
check "the API rejects requests without a token" 401 '"detail"' "$base_url/api/v1/months"

# The script tag in index.html names the current build's JavaScript bundle.
bundle_path="$(curl --silent "$base_url/" | grep -o '/assets/[^"]*\.js' | head -n 1)"
check "built assets are cached for good" 200 'immutable' --include "$base_url$bundle_path"
check "a missing asset is a 404, not the web app" 404 '' "$base_url/assets/missing.js"

if [ "$failures" -gt 0 ]; then
    echo "$failures check(s) failed. Logs:"
    $compose logs --tail 50
    exit 1
fi
