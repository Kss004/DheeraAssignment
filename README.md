# Hand Detection — Real-Time Webcam

A small full-stack prototype that detects hands in your webcam feed and overlays
landmarks, bounding boxes, gesture labels, and stable per-hand IDs in the browser.

- **Backend**: FastAPI + MediaPipe Tasks (Python) — runs the CV model.
- **Frontend**: Vanilla JS + Vite — captures video, streams JPEG frames over a
  WebSocket, draws results on a canvas overlay.

## Features

- Multi-hand detection (up to 2 hands) with **stable IDs** across frames
  (centroid tracker; survives brief occlusions).
- **Gesture recognition**: thumbs up, thumbs down, victory, pointing up, open
  palm, closed fist, "ILoveYou".
- **Visualization toggle**: skeleton landmarks / bounding box / both /
  heatmap (per-landmark radial blobs).
- **Recording**: capture the canvas (overlay baked in) and download as `.webm`.
- **Live HUD**: FPS, server inference time, hand count, per-hand gesture
  list.
- Start / stop controls; clean status indicator.

## Requirements

- [`uv`](https://docs.astral.sh/uv/) (it bootstraps Python automatically — no
  separate Python install needed)
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **Node.js 18+** and `npm`
- A webcam and a recent Chromium / Firefox / Safari build

## Run

Two terminals.

### 1. Backend

```bash
cd backend
uv sync                                  # creates .venv + installs deps
uv run python download_models.py         # ~12 MB; one-time
uv run uvicorn main:app --reload --port 8000
```

You should see `detector ready` in the logs and `GET /healthz` returning
`{"status":"ok"}`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>, click **Start**, allow camera access, wave a
hand at the camera. Try a thumbs-up — the gesture label should appear over
the bounding box.

## How it works

```
Browser                                Backend
─────────                              ─────────
getUserMedia → <video>                 FastAPI (uvicorn)
   │                                       │
   ↓ JPEG frame (480 px wide, q=0.6)        │
   ├── WS binary ─────────────────────►  /ws/detect
   │                                       │  cv2.imdecode
   │                                       │  MediaPipe GestureRecognizer
   │                                       │  CentroidTracker (stable IDs)
   │ ◄────────── JSON detections ─────────┤
   ↓
Canvas: video frame + landmarks/bbox/gesture
   │
   ↓ MediaRecorder (canvas.captureStream)
   .webm download
```

The client uses a **request-response throttle** (only sends the next frame
after receiving the previous result). This keeps end-to-end latency bounded
even on slow machines, at the cost of FPS scaling with inference time.

The backend uses MediaPipe's **`GestureRecognizer`** task (rather than
`HandLandmarker`) because it returns landmarks, handedness, and gesture
categories in a single forward pass.

## AI tools used

- **Claude Code (Opus 4.7)** — used to scaffold the project end-to-end:
  - chose the architecture (Python backend vs browser-only) by walking
    through trade-offs with me;
  - generated the FastAPI + MediaPipe + WebSocket skeleton, the centroid
    tracker, and the canvas overlay drawing code;
  - wrote the build/run instructions and this README.
- **How I validated the AI output** — I ran the smoke tests end-to-end
  (`/healthz`, WebSocket handshake, live detections in browser devtools) and
  read each generated file before committing. Two corrections worth noting:
  - Switched the package manager from `pip` to `uv` per project preference.
  - Consolidated the original split `controls.js` into `main.js` because the
    state-sharing overhead wasn't worth a separate file at this scale.

## Challenges + trade-offs

- **Frame transport** — picked binary JPEG over WebSocket (4-byte frame ID
  - JPEG bytes) over base64 (avoids the ~33 % bloat) and over WebRTC (way
    too much setup for an MVP). Encoding is done client-side at 480 px wide
    with quality 0.6.
- **Stable hand IDs** — MediaPipe's per-frame ordering isn't a track ID, so
  I rolled a small centroid tracker that uses the average of the wrist
  (landmark 0) and the middle-finger MCP (landmark 9) as a palm anchor.
  Greedy nearest-neighbor matching with a 0.2-unit gate (normalized image
  coords); tracks age out after 12 missed frames.
- **Latency vs throughput** — the request-response throttle is the simplest
  way to avoid a backlog if the camera pushes faster than inference can run.
  Typical latency: ~30–50 ms of MediaPipe inference on Apple Silicon, plus
  the JPEG round trip.
- **Single client per backend** — for an MVP, one detector instance is
  shared across the WebSocket. For multi-tenant we'd want a per-connection
  pool.

## Project layout

```
DheeraAssign/
├── backend/
│   ├── main.py              # FastAPI app + /ws/detect
│   ├── detector.py          # MediaPipe wrapper
│   ├── tracker.py           # Centroid tracker for stable IDs
│   ├── download_models.py   # one-shot model fetch
│   └── pyproject.toml       # uv-managed deps
├── frontend/
│   ├── index.html
│   ├── src/
│   │   ├── main.js          # camera, WS, render loop, controls
│   │   ├── ws.js            # WebSocket wrapper
│   │   ├── overlay.js       # canvas drawing (incl. heatmap)
│   │   ├── recorder.js      # MediaRecorder + download
│   │   ├── fps.js           # rolling FPS counter
│   │   └── style.css
│   ├── package.json
│   └── vite.config.js       # /ws proxy → :8000
├── docs/                    # screenshots / demo video
└── README.md
```

## Demo

Screenshots and Video Recordings from UI are in `docs/`.
