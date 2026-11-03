// Loop-Station: AudioWorklet that hands the microphone signal to the page in blocks of 1024 samples,
// each with the context frame of its first sample – so recordings line up exactly with the loop.
class LoopRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(1024);
    this.n = 0;
    this.start = 0;
  }
  flush() {
    if (!this.n) return;
    const data = this.buf.slice(0, this.n);
    this.port.postMessage({ frame: this.start, data }, [data.buffer]);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) { this.flush(); return true; }
    // A gap (no input for a while) starts a new block, so frame numbers stay exact
    if (this.n && currentFrame !== this.start + this.n) this.flush();
    if (!this.n) this.start = currentFrame;
    let i = 0;
    while (i < ch.length) {
      const k = Math.min(ch.length - i, this.buf.length - this.n);
      this.buf.set(ch.subarray(i, i + k), this.n);
      this.n += k; i += k;
      if (this.n === this.buf.length) { const next = this.start + this.n; this.flush(); this.start = next; }
    }
    return true;
  }
}
registerProcessor('loop-recorder', LoopRecorder);
