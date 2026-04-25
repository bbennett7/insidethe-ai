import asyncio
import logging
import os
from contextlib import asynccontextmanager

import orjson
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.datastructures import Headers

from model import GPT2Runner
from streamer import encode_frame, stream_to_websocket

log = logging.getLogger(__name__)

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
IS_DEV = os.environ.get("ENV", "development") == "development"
MAX_INPUT_CHARS = 500

HANDSHAKE_FRAME = {
    "type": "hello",
    "protocol_version": 1,
    "model": "gpt2",
    "num_layers": GPT2Runner.NUM_LAYERS,
    "components_per_layer": ["ln1", "attn", "attn_write", "ln2", "mlp", "mlp_write"],
}


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


@app.get("/health")
async def health() -> JSONResponse:
    runner = getattr(app.state, "runner", None)
    if runner is None:
        return JSONResponse({"status": "loading"}, status_code=503)
    return JSONResponse({"status": "ok"})


@app.get("/model-info")
async def model_info() -> dict:
    return {
        "model": "gpt2",
        "num_layers": GPT2Runner.NUM_LAYERS,
        "num_heads": GPT2Runner.NUM_HEADS,
        "d_model": GPT2Runner.D_MODEL,
        "vocab_size": 50257,
    }


class RunRequest(BaseModel):
    text: str


@app.post("/run")
async def run_inference(body: RunRequest) -> dict:
    runner: GPT2Runner = app.state.runner
    result = None
    async for frame in runner.run(body.text):
        if frame.get("type") == "output":
            result = frame["data"]
    return {"output": result}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    # CORSMiddleware does not apply to WebSocket scopes — check Origin manually.
    headers = Headers(scope=ws.scope)
    origin = headers.get("origin", "")
    if origin and origin not in ALLOWED_ORIGINS:
        await ws.close(code=1008)
        return

    await ws.accept()
    await ws.send_text(encode_frame(HANDSHAKE_FRAME))

    runner: GPT2Runner = ws.app.state.runner
    current_task: asyncio.Task | None = None

    try:
        while True:
            raw = await ws.receive_text()

            try:
                message = orjson.loads(raw)
            except orjson.JSONDecodeError:
                await ws.send_text(encode_frame({"type": "error", "detail": "invalid JSON"}))
                continue

            msg_type = message.get("type")
            text = message.get("text", "")

            if not isinstance(msg_type, str) or not isinstance(text, str):
                await ws.send_text(encode_frame({"type": "error", "detail": "malformed message"}))
                continue

            if len(text) > MAX_INPUT_CHARS:
                await ws.send_text(encode_frame({"type": "error", "detail": "input too long"}))
                continue

            if msg_type == "run":
                if current_task and not current_task.done():
                    current_task.cancel()
                    try:
                        await current_task
                    except (asyncio.CancelledError, Exception):
                        pass
                current_task = asyncio.create_task(
                    stream_to_websocket(ws, runner, text)
                )

    except WebSocketDisconnect:
        if current_task and not current_task.done():
            current_task.cancel()
