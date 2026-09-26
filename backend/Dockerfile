# Production image for the API. Build from this directory:  docker build -t rich-life-backend .
# On start it applies the database migrations, then serves the API on port 8000.

FROM ghcr.io/astral-sh/uv:0.12-python3.12-trixie-slim AS build

# Compile bytecode for faster starts, use the image's Python, and leave no uv cache in
# the layer.
ENV UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never UV_NO_CACHE=1
WORKDIR /app

# Dependencies first, so this layer is cached until the lock file changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev

COPY alembic.ini docker-entrypoint.sh ./
COPY app ./app
COPY migrations ./migrations


FROM python:3.12-slim-trixie

ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
WORKDIR /app

RUN useradd --system --no-create-home --uid 10001 app
# Root-owned, so the API user can read and run the code and the venv but not change
# them.
COPY --from=build /app /app
USER app

# Set by the build or deploy pipeline, e.g. to a git tag or commit SHA; shown in /health.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

EXPOSE 8000
# HOST=:: (see docker-entrypoint.sh) listens on IPv6 only, so check over IPv6 then.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
    CMD ["sh", "-c", "if [ \"${HOST:-}\" = '::' ]; then address='[::1]'; else address=127.0.0.1; fi; python -c \"import urllib.request; urllib.request.urlopen('http://$address:8000/health', timeout=2)\""]

ENTRYPOINT ["./docker-entrypoint.sh"]
