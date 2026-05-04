// Tiny WebSocket wrapper with binary support and onmessage callback.
export class DetectionSocket {
  constructor(url, { onMessage, onOpen, onClose, onError } = {}) {
    this.url = url;
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
    this.ws = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      ws.onopen = () => {
        this.onOpen?.();
        resolve();
      };
      ws.onmessage = (e) => {
        try {
          this.onMessage?.(JSON.parse(e.data));
        } catch (err) {
          console.error("ws parse error", err);
        }
      };
      ws.onclose = (e) => {
        this.onClose?.(e);
      };
      ws.onerror = (e) => {
        this.onError?.(e);
        reject(e);
      };
    });
  }

  isOpen() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  sendFrame(frameId, jpegBlob) {
    if (!this.isOpen()) return;
    // Prepend 4-byte big-endian frame_id, then JPEG bytes.
    return jpegBlob.arrayBuffer().then((buf) => {
      const out = new Uint8Array(4 + buf.byteLength);
      new DataView(out.buffer).setUint32(0, frameId, false);
      out.set(new Uint8Array(buf), 4);
      this.ws.send(out);
    });
  }

  close() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
