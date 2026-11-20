from fastapi import APIRouter

from app.api.routes import auth, campaigns, groups, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(campaigns.router)
api_router.include_router(groups.router)
