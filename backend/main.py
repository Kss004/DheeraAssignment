"""FastAPI entry point: serves a WebSocket that turns JPEG frames into hand detections."""
from __future__ import annotations

import json
import logging
import struct
import time
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from detector import HandDetector
from tracker import CentroidTracker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("hand-detection")

state: dict[str, object] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    models = Path(__file__).parent / "models"
    if not (models / "gesture_recognizer.task").exists():
        raise RuntimeError(
            "Models missing. Run `uv run python download_models.py` before starting."
        )
    log.info("loading detector")
    state["detector"] = HandDetector(num_hands=2)
    log.info("detector ready")
    yield
    det = state.get("detector")
    if det is not None:
        det.close()  # type: ignore[attr-defined]


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


def _decode_frame(payload: bytes) -> tuple[int, np.ndarray] | None:
    """Payload format: 4-byte big-endian frame_id + JPEG bytes."""
    if len(payload) < 5:
        return None
    frame_id = struct.unpack(">I", payload[:4])[0]
    buf = np.frombuffer(payload[4:], dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        return None
    return frame_id, img


@app.websocket("/ws/detect")
async def detect_ws(ws: WebSocket) -> None:
    await ws.accept()
    detector: HandDetector = state["detector"]  # type: ignore[assignment]
    tracker = CentroidTracker(max_missing=12, max_distance=0.2)
    log.info("ws client connected")
    try:
        while True:
            payload = await ws.receive_bytes()
            decoded = _decode_frame(payload)
            if decoded is None:
                await ws.send_text(json.dumps({"error": "invalid frame"}))
                continue
            frame_id, frame = decoded
            t0 = time.perf_counter()
            raw_hands = [h.to_dict() for h in detector.detect(frame)]
            hands = tracker.update(raw_hands)
            inference_ms = (time.perf_counter() - t0) * 1000.0
            await ws.send_text(
                json.dumps(
                    {
                        "frame_id": frame_id,
                        "inference_ms": round(inference_ms, 2),
                        "hands": hands,
                    }
                )
            )
    except WebSocketDisconnect:
        log.info("ws client disconnected")
    except Exception as exc:  # noqa: BLE001
        log.exception("ws error: %s", exc)
        try:
            await ws.close(code=1011)
        except Exception:
            pass
