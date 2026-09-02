// Sample-accurate exhaust pulse-train generator, run on the audio rendering
// thread. Each firing event is a short asymmetric pressure pulse (fast
// linear attack, exponential decay) retriggered at the firing frequency,
// following a repeating per-engine cylinder-order pattern with per-pulse
// timing/amplitude jitter. Loaded via audioWorklet.addModule() from a Blob
// URL built from this file's raw source — see ../engine/ExhaustWorklet.ts.
//
// Not a TypeScript file on purpose: it is imported with `?raw` and shipped
// to the browser verbatim, so it must already be plain, dependency-free JS.
class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'firingFreq',
        defaultValue: 30,
        minValue: 0.1,
        maxValue: 2000,
        automationRate: 'a-rate',
      },
      {
        name: 'jitterAmount',
        defaultValue: 0.03,
        minValue: 0,
        maxValue: 0.2,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor(options) {
    super(options);
    const opts = (options && options.processorOptions) || {};
    this.pattern = opts.pattern && opts.pattern.length ? opts.pattern : [{ mult: 1, amp: 1 }];
    this.attackS = Math.max(0.0002, (opts.attackMs ?? 1) / 1000);
    this.decayS = Math.max(0.001, (opts.decayMs ?? 6) / 1000);
    this.patternIndex = 0;
    this.timeToNext = 0;
    this.sinceStart = 1;
    this.peak = 0;
  }

  triggerPulse(freq, jitter) {
    const entry = this.pattern[this.patternIndex % this.pattern.length];
    this.patternIndex++;
    const timeJitter = 1 + (Math.random() * 2 - 1) * jitter;
    const ampJitter = 1 + (Math.random() * 2 - 1) * jitter * 1.4;
    const period = freq > 0 ? 1 / freq : 1;
    this.timeToNext += period * entry.mult * timeJitter;
    this.peak = Math.max(0.05, entry.amp * ampJitter);
    this.sinceStart = 0;
  }

  envelope() {
    if (this.sinceStart < this.attackS) return this.peak * (this.sinceStart / this.attackS);
    const decayT = this.sinceStart - this.attackS;
    return this.peak * Math.exp(-decayT / this.decayS);
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const freqArr = parameters.firingFreq;
    const jitter = parameters.jitterAmount[0];
    const dt = 1 / sampleRate;

    for (let i = 0; i < out.length; i++) {
      const freq = freqArr.length > 1 ? freqArr[i] : freqArr[0];
      this.timeToNext -= dt;
      if (this.timeToNext <= 0) this.triggerPulse(freq, jitter);
      out[i] = this.envelope();
      this.sinceStart += dt;
    }
    return true;
  }
}

registerProcessor('engine-processor', EngineProcessor);
