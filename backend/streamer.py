import asyncio
import logging

import orjson
from fastapi import WebSocket

from model import GPT2Runner

log = logging.getLogger(__name__)


def encode_frame(frame: dict) -> str:
    return orjson.dumps(frame, option=orjson.OPT_SERIALIZE_NUMPY).decode()


async def stream_to_websocket(ws: WebSocket, runner: GPT2Runner, text: str) -> None:
    """Serialize and stream all model frames for the given text over the WebSocket."""
    try:
        async for frame in runner.run(text):
            try:
                await ws.send_text(encode_frame(frame))
            except TypeError as exc:
                log.error("Unencodable frame (type=%r): %s", frame.get("type"), exc)
                error_payload = {
                    "type": "error",
                    "message": "Activation data could not be serialized.",
                }
                await ws.send_text(encode_frame(error_payload))
                return
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("Inference error")
        try:
            await ws.send_text(encode_frame({"type": "error", "message": "Inference failed."}))
        except Exception:
            pass
