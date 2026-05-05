# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Backend (Python, `uv`-managed; Python 3.10–3.12 only — MediaPipe wheel constraint):

```bash
cd backend
uv sync                                  # install deps into .venv
uv run python download_models.py         # one-time, ~12 MB; required before first run
uv run uvicorn main:app --reload --port 8000
```

Frontend (Vite + vanilla JS):

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /ws + /healthz to :8000
npm run build        # production bundle to dist/
```

Smoke-test backend without launching uvicorn (no test suite exists; use FastAPI TestClient ad-hoc):

```bash
cd backend
uv run --with httpx python -c "
from fastapi.testclient import TestClient; from main import app
print(TestClient(app).get('/healthz').json())
"
```

## Architecture

Two-process app. Browser captures video; backend runs the CV model; results render on a canvas overlay client-side.

**Frame path (per frame):**

1. `frontend/src/main.js` `maybeSendFrame()` draws video onto a 480 px-wide offscreen canvas, encodes JPEG quality 0.6.
2. `frontend/src/ws.js` `sendFrame()` prepends a 4-byte big-endian `frame_id` and sends as a binary WebSocket message to `/ws/detect`.
3. `backend/main.py` `_decode_frame()` unpacks `frame_id` + JPEG, `cv2.imdecode` → BGR `np.ndarray`.
4. `backend/detector.py` `HandDetector.detect()` runs MediaPipe `GestureRecognizer` (IMAGE mode) — one forward pass returns landmarks, handedness, AND gesture category. (Chosen over `HandLandmarker` for this reason.)
5. `backend/tracker.py` `CentroidTracker.update()` assigns stable per-hand IDs by greedy nearest-neighbor on the palm anchor `avg(lm[0], lm[9])` (wrist + middle-finger MCP) in normalized coords, with a 0.2 gate. Tracks age out after 12 missed frames.
6. Backend sends JSON `{frame_id, inference_ms, hands: [{id, landmarks, bbox, handedness, gesture, ...}]}` back over the same WS.
7. Frontend stores `state.hands`; `renderLoop` redraws video + overlays each `requestAnimationFrame`.

**Key invariant — request/response throttle:** `state.awaitingResponse` blocks `maybeSendFrame()` until the previous detection arrives. Bounds end-to-end latency on slow machines at the cost of FPS scaling with inference time. Don't replace with a frame queue without first considering backpressure.

**Viz modes** (`frontend/src/overlay.js`, switched by `state.mode` in `main.js`):
- `landmarks` — 21 keypoints + skeleton lines from `HAND_CONNECTIONS`
- `bbox` — dashed rectangle from min/max landmark coords + 2 % pad
- `both` — default; landmarks + bbox
- `heatmap` — radial-gradient blobs per landmark, additive blend (`globalCompositeOperation = "lighter"`), hue from `z` depth

Label pill (`#id · handedness · gesture`) drawn in every mode.

**Recording** (`frontend/src/recorder.js`): `MediaRecorder` on `canvas.captureStream()` — overlay is baked into the recording because the canvas already has the video drawn underneath.

## Conventions / quirks

- **Models must be downloaded before backend start** — `lifespan` raises if `backend/models/gesture_recognizer.task` is missing. Re-run `download_models.py` if it disappears.
- **`numpy<2.0` is pinned** in `backend/pyproject.toml` because MediaPipe 0.10.x is not numpy-2 compatible. Don't bump.
- **Single shared detector instance** across all WS connections (`state["detector"]` set in `lifespan`). Fine for MVP / single client. For multi-tenant, allocate per-connection.
- **Vite proxy lives in `frontend/vite.config.js`** — both the WebSocket (`/ws`) and `/healthz` are proxied to `:8000`. Same-origin URL construction in `main.js` (`location.host`) is what makes this transparent.
- **Coordinates are normalized [0, 1]** end-to-end. The frontend multiplies by `canvas.width/height` only at draw time, so changing the camera resolution does not require re-tuning the tracker gate or pinch-ratio constants.
- **Gesture labels** come from MediaPipe's built-in `GestureRecognizer` categories: `Thumb_Up`, `Thumb_Down`, `Victory`, `Pointing_Up`, `Open_Palm`, `Closed_Fist`, `ILoveYou`, `None`. The detector filters out `"None"` to a Python `None`.

## Out-of-scope warnings

- No tests exist. Verifying changes = run both servers + manual browser check.
- No CI / linting configured.
- No deployment target (no Vercel/Docker/etc.) — local dev only.
