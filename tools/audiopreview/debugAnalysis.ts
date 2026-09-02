/**
 * Analyser/recorder helpers exposed on window.__audioDebug for the listening
 * check page. Not part of the AudioContract — debug-only tooling.
 */

export interface SampleResult {
  rms: number;
  peakFreq: number | null;
}

export interface AnalyseResult {
  peakFreq: number | null;
  peakAmplitude: number;
  harmonicDbs: number[];
  noiseFloorDb: number;
  pulseCV: number;
  /** max dB in the whole spectrum (the "peak band") */
  peakBandDb: number;
  /** max dB at/above 3kHz */
  highBandDb: number;
  /** peakBandDb - highBandDb; should be >= 25 at full throttle */
  highBandMarginDb: number;
}

export interface RecordResult {
  sampleRate: number;
  length: number;
  peak: number;
  envelope: number[];
}

function harmonicDb(
  freqData: Float32Array,
  sampleRate: number,
  fftSize: number,
  hz: number,
): number {
  const bin = Math.round((hz / sampleRate) * fftSize);
  let max = -Infinity;
  for (let i = Math.max(0, bin - 2); i <= Math.min(freqData.length - 1, bin + 2); i++) {
    max = Math.max(max, freqData[i]);
  }
  return max;
}

function isNearHarmonic(bin: number, baseBin: number, harmonics: number): boolean {
  for (let n = 1; n <= harmonics; n++) {
    if (Math.abs(bin - baseBin * n) <= 3) return true;
  }
  return false;
}

function noiseFloorDb(freqData: Float32Array, baseBin: number): number {
  const samples: number[] = [];
  for (let i = 4; i < freqData.length; i++) {
    if (!isNearHarmonic(i, baseBin, 8) && Number.isFinite(freqData[i])) samples.push(freqData[i]);
  }
  samples.sort((a, b) => a - b);
  return samples.length ? samples[Math.floor(samples.length / 2)] : -Infinity;
}

function pulseCoefficientOfVariation(timeData: Float32Array, chunks = 32): number {
  const size = Math.max(1, Math.floor(timeData.length / chunks));
  const rmsValues: number[] = [];
  for (let c = 0; c < chunks; c++) {
    let sum = 0;
    let n = 0;
    for (let i = c * size; i < (c + 1) * size && i < timeData.length; i++, n++) {
      sum += timeData[i] * timeData[i];
    }
    rmsValues.push(n ? Math.sqrt(sum / n) : 0);
  }
  const mean = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  if (mean <= 1e-9) return 0;
  const variance = rmsValues.reduce((a, b) => a + (b - mean) ** 2, 0) / rmsValues.length;
  return Math.sqrt(variance) / mean;
}

/** Builds the window.__audioDebug analyser/recorder API bound to `getAnalyser`. */
export function buildAnalysisApi(getAnalyser: () => AnalyserNode | null) {
  return {
    getAnalyser,
    sample(): SampleResult | null {
      const analyser = getAnalyser();
      if (!analyser) return null;
      const timeData = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(timeData);
      let sumSquares = 0;
      for (let i = 0; i < timeData.length; i++) sumSquares += timeData[i] * timeData[i];
      const rms = Math.sqrt(sumSquares / timeData.length);

      const freqData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(freqData);
      let maxDb = -Infinity;
      let maxIdx = -1;
      for (let i = 1; i < freqData.length; i++) {
        if (freqData[i] > maxDb) {
          maxDb = freqData[i];
          maxIdx = i;
        }
      }
      const sampleRate = (analyser.context as AudioContext).sampleRate;
      const peakFreq = maxIdx >= 0 ? (maxIdx * sampleRate) / analyser.fftSize : null;
      return { rms, peakFreq };
    },
    /** Harmonic comb + noise-floor + pulse-modulation check around an expected firing frequency. */
    analyze(baseFreqHz: number): AnalyseResult | null {
      const analyser = getAnalyser();
      if (!analyser) return null;
      const sampleRate = (analyser.context as AudioContext).sampleRate;
      const freqData = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(freqData);
      const timeData = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(timeData);

      const harmonicDbs = [1, 2, 3, 4, 5].map((n) =>
        harmonicDb(freqData, sampleRate, analyser.fftSize, baseFreqHz * n),
      );
      const baseBin = Math.round((baseFreqHz / sampleRate) * analyser.fftSize);
      let peakAmplitude = 0;
      for (let i = 0; i < timeData.length; i++)
        peakAmplitude = Math.max(peakAmplitude, Math.abs(timeData[i]));

      let maxDb = -Infinity;
      let maxIdx = -1;
      let highBandDb = -Infinity;
      const highBandBin = Math.ceil((3000 / sampleRate) * analyser.fftSize);
      for (let i = 1; i < freqData.length; i++) {
        if (freqData[i] > maxDb) {
          maxDb = freqData[i];
          maxIdx = i;
        }
        if (i >= highBandBin) highBandDb = Math.max(highBandDb, freqData[i]);
      }
      return {
        peakFreq: maxIdx >= 0 ? (maxIdx * sampleRate) / analyser.fftSize : null,
        peakAmplitude,
        harmonicDbs,
        noiseFloorDb: noiseFloorDb(freqData, baseBin),
        pulseCV: pulseCoefficientOfVariation(timeData),
        peakBandDb: maxDb,
        highBandDb,
        highBandMarginDb: maxDb - highBandDb,
      };
    },
    /** Tap the live master bus for `seconds` via a ScriptProcessor and summarise it. */
    async record(seconds = 2, windows = 4000): Promise<RecordResult | null> {
      const analyser = getAnalyser();
      if (!analyser) return null;
      const ctx = analyser.context as AudioContext;
      // ScriptProcessorNode is deprecated but is the simplest way to get raw
      // PCM off the live graph without a MediaStream/MediaRecorder round trip.
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      analyser.connect(sp);
      sp.connect(mute).connect(ctx.destination);
      const target = Math.ceil(seconds * ctx.sampleRate);
      const chunks: Float32Array[] = [];
      let total = 0;
      await new Promise<void>((resolve) => {
        sp.onaudioprocess = (e) => {
          chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
          total += e.inputBuffer.length;
          if (total >= target) {
            analyser.disconnect(sp);
            sp.disconnect();
            resolve();
          }
        };
      });
      const buf = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) {
        buf.set(c, offset);
        offset += c.length;
      }
      let peak = 0;
      for (let i = 0; i < target; i++) peak = Math.max(peak, Math.abs(buf[i]));
      const winSize = Math.max(1, Math.floor(target / windows));
      const envelope: number[] = [];
      for (let w = 0; w * winSize < target; w++) {
        let sum = 0;
        let n = 0;
        for (let i = w * winSize; i < (w + 1) * winSize && i < target; i++, n++)
          sum += buf[i] * buf[i];
        envelope.push(n ? Math.sqrt(sum / n) : 0);
      }
      return { sampleRate: ctx.sampleRate, length: target, peak, envelope };
    },
  };
}
