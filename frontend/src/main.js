import { DetectionSocket } from "./ws.js";
import { drawHands } from "./overlay.js";
import { CanvasRecorder } from "./recorder.js";
import { FpsCounter } from "./fps.js";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const statusEl = document.getElementById("status");
const fpsEl = document.getElementById("fps");
const inferenceEl = document.getElementById("inference");
const handCountEl = document.getElementById("hand-count");
const handListEl = document.getElementById("hand-list");

const startBtn = document.getElementById("btn-start");
const stopBtn = document.getElementById("btn-stop");
const recordBtn = document.getElementById("btn-record");
const stopRecordBtn = document.getElementById("btn-stop-record");
const recordInfo = document.getElementById("record-info");
const toggleBtns = document.querySelectorAll(".btn--toggle");

const WS_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/detect`;
document.getElementById("backend-url").textContent = WS_URL;

const fps = new FpsCounter(30);
const recorder = new CanvasRecorder(canvas, 30);

let state = {
  running: false,
  socket: null,
  stream: null,
  hands: [],
  pendingFrameId: null,
  nextFrameId: 1,
  awaitingResponse: false,
  mode: "both",
  inferenceMs: 0,
};

function setStatus(label, kind) {
  statusEl.textContent = label;
  statusEl.className = `status status--${kind}`;
}

function setRunning(running) {
  state.running = running;
  startBtn.disabled = running;
  stopBtn.disabled = !running;
  recordBtn.disabled = !running;
}

async function getCamera() {
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    audio: false,
  });
}

async function start() {
  try {
    setStatus("connecting", "connecting");
    state.stream = await getCamera();
    video.srcObject = state.stream;
    await video.play();

    // Match canvas size to actual track resolution for crisp drawing.
    const settings = state.stream.getVideoTracks()[0].getSettings();
    canvas.width = settings.width || 640;
    canvas.height = settings.height || 480;

    state.socket = new DetectionSocket(WS_URL, {
      onMessage: handleDetections,
      onClose: () => {
        if (state.running) {
          setStatus("disconnected", "error");
          stop();
        }
      },
      onError: () => setStatus("error", "error"),
    });
    await state.socket.connect();

    setRunning(true);
    setStatus("running", "running");
    state.awaitingResponse = false;
    state.nextFrameId = 1;
    requestAnimationFrame(renderLoop);
  } catch (err) {
    console.error(err);
    setStatus(err.message ?? "error", "error");
    stop();
  }
}

function stop() {
  setRunning(false);
  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }
  if (state.stream) {
    for (const track of state.stream.getTracks()) track.stop();
    state.stream = null;
  }
  video.srcObject = null;
  state.hands = [];
  renderHandList();
  setStatus("idle", "idle");
}

function handleDetections(msg) {
  if (msg.error) {
    console.warn("detection error", msg.error);
    state.awaitingResponse = false;
    return;
  }
  state.hands = msg.hands ?? [];
  state.inferenceMs = msg.inference_ms ?? 0;
  state.awaitingResponse = false;
  renderHandList();
}

function renderHandList() {
  handCountEl.textContent = String(state.hands.length);
  if (state.hands.length === 0) {
    handListEl.innerHTML = '<li class="muted">No hands detected.</li>';
    return;
  }
  handListEl.innerHTML = "";
  for (const hand of state.hands) {
    const li = document.createElement("li");
    const left = document.createElement("span");
    left.innerHTML = `<span class="id-tag">#${hand.id}</span> ${hand.handedness}`;
    const right = document.createElement("span");
    right.className = "gesture";
    right.textContent = hand.gesture
      ? `${hand.gesture} (${(hand.gesture_score * 100).toFixed(0)}%)`
      : "—";
    li.appendChild(left);
    li.appendChild(right);
    handListEl.appendChild(li);
  }
}

function drawFrame() {
  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  if (state.hands.length > 0) {
    drawHands(ctx, state.hands, state.mode);
  }
}

async function maybeSendFrame() {
  if (!state.running || !state.socket?.isOpen() || state.awaitingResponse) return;
  if (video.readyState < 2) return;

  // Encode at lower res to keep latency down.
  const offscreen = document.createElement("canvas");
  offscreen.width = 480;
  offscreen.height = Math.round(480 * (canvas.height / canvas.width));
  const octx = offscreen.getContext("2d");
  octx.drawImage(video, 0, 0, offscreen.width, offscreen.height);

  const blob = await new Promise((res) => offscreen.toBlob(res, "image/jpeg", 0.6));
  if (!blob) return;

  const frameId = state.nextFrameId++;
  state.awaitingResponse = true;
  await state.socket.sendFrame(frameId, blob);
}

function renderLoop() {
  if (!state.running) return;
  fps.tick();
  fpsEl.textContent = fps.fps().toFixed(1);
  inferenceEl.textContent = `${state.inferenceMs.toFixed(0)} ms`;
  drawFrame();
  maybeSendFrame();
  requestAnimationFrame(renderLoop);
}

// Controls wiring
startBtn.addEventListener("click", start);
stopBtn.addEventListener("click", stop);

toggleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    toggleBtns.forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.mode = btn.dataset.mode;
  });
});

recordBtn.addEventListener("click", () => {
  if (!state.running) return;
  recorder.start();
  recordBtn.disabled = true;
  stopRecordBtn.disabled = false;
  recordInfo.innerHTML = '<span class="recording-dot"></span>Recording…';
});

stopRecordBtn.addEventListener("click", async () => {
  stopRecordBtn.disabled = true;
  recordBtn.disabled = !state.running;
  recordInfo.textContent = "Saving…";
  const blob = await recorder.stop();
  if (blob) {
    CanvasRecorder.download(blob);
    recordInfo.textContent = `Saved ${(blob.size / 1024 / 1024).toFixed(2)} MB.`;
  } else {
    recordInfo.textContent = "Records the canvas overlay to .webm.";
  }
});

window.addEventListener("beforeunload", stop);

setStatus("idle", "idle");
