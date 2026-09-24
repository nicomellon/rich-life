from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.schemas.health import Health


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title="Rich Life API", version=settings.app_version)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["health"])
    def health() -> Health:
        return Health(version=settings.app_version)

    app.include_router(api_router)
    return app


app = create_app()
