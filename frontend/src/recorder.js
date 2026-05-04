// MediaRecorder wrapper — records canvas overlay to .webm and triggers download.
export class CanvasRecorder {
  constructor(canvas, fps = 30) {
    this.canvas = canvas;
    this.fps = fps;
    this.recorder = null;
    this.chunks = [];
  }

  static supportedMime() {
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
        return m;
      }
    }
    return "";
  }

  start() {
    const mime = CanvasRecorder.supportedMime();
    const stream = this.canvas.captureStream(this.fps);
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(1000);
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.recorder) return resolve(null);
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: "video/webm" });
        this.chunks = [];
        this.recorder = null;
        resolve(blob);
      };
      this.recorder.stop();
    });
  }

  static download(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `hand-detection-${ts}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
