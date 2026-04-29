import asyncio
import os

import orjson
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from starlette.datastructures import Headers

from experiences.processing.runner import GPT2Runner
from experiences.processing.streamer import encode_frame, stream_to_websocket

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

MAX_INPUT_CHARS = 500

HANDSHAKE_FRAME = {
    "type": "hello",
    "protocol_version": 1,
    "model": "gpt2",
    "num_layers": GPT2Runner.NUM_LAYERS,
    "components_per_layer": ["ln1", "attn", "attn_write", "ln2", "mlp", "mlp_write"],
}

router = APIRouter()


@router.get("/model-info")
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


@router.post("/run")
async def run_inference(body: RunRequest, request: Request) -> dict:
    runner: GPT2Runner = request.app.state.runner
    result = None
    async for frame in runner.run(body.text):
        if frame.get("type") == "output":
            result = frame["data"]
    return {"output": result}


@router.websocket("/ws")
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
                current_task = asyncio.create_task(stream_to_websocket(ws, runner, text))

    except WebSocketDisconnect:
        if current_task and not current_task.done():
            current_task.cancel()
