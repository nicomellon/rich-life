from fastapi import APIRouter

from app.api.v1.routers import auth, entries, months, spending_plan

# Feature routers from app.api.v1.routers are included here as they are added.
api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(spending_plan.router)
api_router.include_router(months.router)
api_router.include_router(entries.router)
