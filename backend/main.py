import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from experiences.processing.runner import GPT2Runner
from routers import processing as processing_router

log = logging.getLogger(__name__)

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
IS_DEV = os.environ.get("ENV", "development") == "development"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    log.info("Loading GPT-2 model…")
    app.state.runner = await asyncio.to_thread(GPT2Runner)
    log.info("Model ready.")
    yield
    del app.state.runner


app = FastAPI(
    title="insidethe.ai backend",
    lifespan=lifespan,
    docs_url="/docs" if IS_DEV else None,
    redoc_url="/redoc" if IS_DEV else None,
    openapi_url="/openapi.json" if IS_DEV else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(processing_router.router)


@app.get("/health")
async def health() -> JSONResponse:
    runner = getattr(app.state, "runner", None)
    if runner is None:
        return JSONResponse({"status": "loading"}, status_code=503)
    return JSONResponse({"status": "ok"})
