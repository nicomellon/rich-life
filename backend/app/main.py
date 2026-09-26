from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.errors import (
    ApiError,
    handle_api_error,
    handle_http_exception,
    handle_unexpected_error,
    handle_validation_error,
)
from app.api.v1 import api_router
from app.core.config import get_settings
from app.schemas.health import Health


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Rich Life API",
        version=settings.app_version,
        # Every error responds with an ErrorResponse body.
        exception_handlers={
            ApiError: handle_api_error,
            StarletteHTTPException: handle_http_exception,
            RequestValidationError: handle_validation_error,
            Exception: handle_unexpected_error,
        },
    )
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
