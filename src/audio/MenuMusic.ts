import { clamp, noiseBuffer, ramp } from './AudioCore';

const BPM = 84;
const SEC_PER_BEAT = 60 / BPM;
const BEATS_PER_BAR = 4;
const BARS_PER_CHORD = 4;
const LOOKAHEAD_S = 0.15;
const SCHEDULER_MS = 50;
const FADE_S = 1.5;

// semitone offsets from A4, voiced in the 4th/5th octave: [root, 3rd, 5th, 7th]
const FMAJ7 = [-4, 0, 3, 7];
const AM7 = [0, 3, 7, 10];
const DM7 = [-7, -4, 0, 3];
const GM7 = [-2, -1, 5, 8];
const CHORDS = [FMAJ7, AM7, DM7, GM7];
const BASS = [-16, -12, -19, -14];

const noteFreq = (semitones: number): number => 440 * Math.pow(2, semitones / 12);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generative lounge-ambient menu music: pad, e-piano arpeggio, brushed hi-hat, soft bass. */
export class MenuMusic {
  private out: GainNode;
  private padGain: GainNode;
  private padFilter: BiquadFilterNode;
  private padOscs: OscillatorNode[] = [];
  private lfo: OscillatorNode;
  private hatBuffer: AudioBuffer;
  private rand = mulberry32(1337);

  private on = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextNoteTime = 0;
  private beatIndex = 0;
  private lastChordBlock = -1;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);

    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0.18;
    this.padFilter.connect(this.padGain).connect(this.out);
    this.padOscs = FMAJ7.slice(0, 3).map((semi, i) => this.buildPadOsc(semi, i));

    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 260;
    this.lfo.connect(lfoDepth).connect(this.padFilter.frequency);
    this.lfo.start();

    this.hatBuffer = noiseBuffer(ctx, 0.05, 'white');
  }

  private buildPadOsc(semitones: number, i: number): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = noteFreq(semitones - 12);
    osc.detune.value = (i - 1) * 5;
    osc.connect(this.padFilter);
    osc.start();
    return osc;
  }

  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (on) this.start();
    else this.stop();
  }

  private start(): void {
    ramp(this.out.gain, 1, this.ctx, FADE_S / 3);
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.beatIndex = 0;
    this.lastChordBlock = -1;
    if (this.timer === null) {
      this.timer = setInterval(() => this.scheduler(), SCHEDULER_MS);
    }
  }

  private stop(): void {
    ramp(this.out.gain, 0, this.ctx, FADE_S / 3);
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduler(): void {
    const horizon = this.ctx.currentTime + LOOKAHEAD_S;
    while (this.nextNoteTime < horizon) {
      this.scheduleBeat(this.nextNoteTime, this.beatIndex);
      this.nextNoteTime += SEC_PER_BEAT;
      this.beatIndex++;
    }
  }

  private scheduleBeat(time: number, beatIndex: number): void {
    const bar = Math.floor(beatIndex / BEATS_PER_BAR);
    const beatInBar = beatIndex % BEATS_PER_BAR;
    const chordBlock = Math.floor(bar / BARS_PER_CHORD) % CHORDS.length;
    const chord = CHORDS[chordBlock];
    if (beatInBar === 0) {
      this.playBass(BASS[chordBlock], time);
      if (chordBlock !== this.lastChordBlock) {
        this.lastChordBlock = chordBlock;
        this.padOscs.forEach((osc, i) =>
          ramp(osc.frequency, noteFreq(chord[i] - 12), this.ctx, 1.2),
        );
      }
    }
    this.playHihat(time + SEC_PER_BEAT * 0.5);
    if (this.rand() > 0.25) this.playArpNote(chord, time + this.rand() * SEC_PER_BEAT * 0.4);
  }

  private playBass(semitones: number, time: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = noteFreq(semitones);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.16, time + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, time + SEC_PER_BEAT * 1.8);
    osc.connect(g).connect(this.out);
    osc.start(time);
    osc.stop(time + SEC_PER_BEAT * 2);
    osc.onended = () => this.cleanup(osc, g);
  }

  private playArpNote(chord: number[], time: number): void {
    const semi = chord[Math.floor(this.rand() * chord.length)] + (this.rand() > 0.8 ? 12 : 0);
    const freq = noteFreq(semi);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.07, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.7);
    const oscs = [1, 2, 3].map((h) => this.arpPartial(freq * h, 1 / h, time, g));
    g.connect(this.out);
    const stopAt = time + 0.75;
    oscs.forEach((o) => {
      o.stop(stopAt);
      o.onended = () => this.cleanup(o);
    });
  }

  private arpPartial(freq: number, level: number, time: number, dest: GainNode): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = clamp(level, 0, 1);
    osc.connect(g).connect(dest);
    osc.start(time);
    return osc;
  }

  private playHihat(time: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.hatBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.03, time + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    src.connect(hp).connect(g).connect(this.out);
    src.start(time);
    src.stop(time + 0.05);
    src.onended = () => this.cleanup(src, hp, g);
  }

  private cleanup(...nodes: AudioNode[]): void {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}
