// Rolling FPS counter — averages last N frame timestamps.
export class FpsCounter {
  constructor(window = 30) {
    this.window = window;
    this.times = [];
  }

  tick(now = performance.now()) {
    this.times.push(now);
    if (this.times.length > this.window) {
      this.times.shift();
    }
  }

  fps() {
    if (this.times.length < 2) return 0;
    const span = this.times[this.times.length - 1] - this.times[0];
    if (span <= 0) return 0;
    return ((this.times.length - 1) * 1000) / span;
  }
}
