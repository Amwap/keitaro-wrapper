from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.config import get_settings
from app.db import init_db
from app.keitaro import KeitaroError
from app.services.campaigns import ServiceError


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        docs_url=f"{settings.api_prefix}/docs",
        openapi_url=f"{settings.api_prefix}/openapi.json",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.api_prefix)
    app.add_exception_handler(ServiceError, _service_error)
    app.add_exception_handler(KeitaroError, _keitaro_error)
    return app


async def _service_error(_request: Request, exc: ServiceError) -> JSONResponse:
    body: dict[str, object] = {"detail": exc.message}
    if exc.fields:
        body["fields"] = exc.fields
    return JSONResponse(body, status_code=exc.status)


async def _keitaro_error(_request: Request, exc: KeitaroError) -> JSONResponse:
    """Upstream failures are 502; a missing object in Keitaro is a plain 404,
    field validation errors are 422 with the messages by field."""
    body: dict[str, object] = {"detail": f"Keitaro: {exc.message}"}
    if exc.fields:
        # The alias is made from the name, so its errors belong to the name field
        body["fields"] = {("name" if k == "alias" else k): v for k, v in exc.fields.items()}
        return JSONResponse(body, status_code=422)
    return JSONResponse(body, status_code=404 if exc.status == 404 else 502)


app = create_app()
