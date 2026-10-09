// One Euro Filter (Casiez et al., CHI 2012): adaptive low-pass filter for
// pointer input — strong smoothing at low speed, weak smoothing at high speed.

const TWO_PI = Math.PI * 2;

function alphaFor(cutoff: number, dt: number) {
  const tau = 1 / (TWO_PI * Math.max(cutoff, 1e-6));
  return 1 / (1 + tau / dt);
}

class LowPass {
  private y = 0;
  private s = 0;
  private initialized = false;

  filter(value: number, alpha: number) {
    this.s = this.initialized ? alpha * value + (1 - alpha) * this.s : value;
    this.y = value;
    this.initialized = true;
    return this.s;
  }

  get lastValue() {
    return this.y;
  }

  get hasValue() {
    return this.initialized;
  }

  reset() {
    this.initialized = false;
    this.s = 0;
    this.y = 0;
  }
}

export class OneEuroFilter {
  private xFilter = new LowPass();
  private dxFilter = new LowPass();
  private lastTime: number | null = null;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(value: number, timestampSec: number) {
    let dt = 1 / 60;
    if (this.lastTime !== null) {
      const delta = timestampSec - this.lastTime;
      if (delta > 1e-5) dt = Math.min(delta, 0.1);
    }
    this.lastTime = timestampSec;

    const dValue = this.xFilter.hasValue ? (value - this.xFilter.lastValue) / dt : 0;
    const edValue = this.dxFilter.filter(dValue, alphaFor(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    return this.xFilter.filter(value, alphaFor(cutoff, dt));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class OneEuroFilter2D {
  private x: OneEuroFilter;
  private y: OneEuroFilter;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.x = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.y = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(x: number, y: number, timestampSec: number) {
    return {
      x: this.x.filter(x, timestampSec),
      y: this.y.filter(y, timestampSec),
    };
  }

  reset() {
    this.x.reset();
    this.y.reset();
  }
}
