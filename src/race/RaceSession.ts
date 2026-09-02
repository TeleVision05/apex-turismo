import type {
  Assists,
  CarSpec,
  CarTuning,
  HudState,
  InputState,
  RaceConfig,
  RaceResult,
  RaceResultEntry,
  StandingEntry,
  Transmission,
} from '../core/types';
import { Track } from '../track/Track';
import { RacingLine } from '../track/RacingLine';
import { Vehicle, PHYSICS_DT } from '../physics/Vehicle';
import { AIDriver } from './AIDriver';
import { resolveVehicleCollisions, type CollisionEvent } from '../physics/Collisions';
import { performancePoints } from '../physics/Tuning';
import { emptyInput } from '../core/Input';

export interface RaceEntry {
  spec: CarSpec;
  tuning: CarTuning;
  name: string;
  isPlayer: boolean;
  skill: number;
}

/** Per-car timing and progress bookkeeping. */
export class Participant {
  lap = 0;
  lastS: number;
  lapStartMs = 0;
  currentLapMs = 0;
  lastLapMs: number | null = null;
  bestLapMs: number | null = null;
  bestLapSectors: number[] = [];
  sectors: (number | null)[] = [null, null, null];
  sectorIndex = 0;
  sectorStartMs = 0;
  finished = false;
  finishTimeMs: number | null = null;
  distance = 0;
  invalidLap = false;
  wrongWayTimer = 0;
  position = 1;
  readonly input: InputState = emptyInput();
  constructor(
    readonly entry: RaceEntry,
    readonly vehicle: Vehicle,
    readonly ai: AIDriver | null,
    readonly pp: number,
  ) {
    this.lastS = vehicle.query.s;
  }
}

export type RaceState = 'countdown' | 'racing' | 'finished';

/** Runs one race: physics stepping, timing, standings and results. */
export class RaceSession {
  readonly participants: Participant[] = [];
  readonly vehicles: Vehicle[] = [];
  readonly line: RacingLine;
  state: RaceState = 'countdown';
  clockMs = 0;
  countdown = 4;
  private accumulator = 0;
  message: string | null = null;
  private messageTimer = 0;
  readonly collisionEvents: CollisionEvent[] = [];
  readonly player: Participant;
  paused = false;
  simTime = 0;

  constructor(
    readonly track: Track,
    readonly config: RaceConfig,
    entries: RaceEntry[],
    assists: Assists,
    transmission: Transmission,
  ) {
    this.line = new RacingLine(track);
    const botAssists: Assists = {
      abs: true,
      tcs: 1,
      stability: false,
      racingLine: false,
      autoBrake: false,
    };
    entries.forEach((e, i) => {
      const v = new Vehicle(
        e.spec,
        e.tuning,
        track,
        e.isPlayer ? assists : botAssists,
        e.isPlayer ? transmission : 'auto',
      );
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const s = track.length - 12 - row * 10 - (side < 0 ? 0 : 5);
      v.placeAt(s, side * 2.8);
      v.weatherGrip = config.weather === 'rain' ? 0.72 : 1;
      if (config.rollingStart) {
        v.vel.copy(v.forward).multiplyScalar(22);
        for (const w of v.wheels) w.omega = 22 / w.radius;
        v.drivetrain.gear = 2;
      }
      const ai = e.isPlayer ? null : new AIDriver(v, this.line, e.skill, 1000 + i * 17);
      const p = new Participant(e, v, ai, performancePoints(e.spec, e.tuning));
      p.lastS = v.query.s;
      this.participants.push(p);
      this.vehicles.push(v);
    });
    const player = this.participants.find((p) => p.entry.isPlayer);
    if (!player) throw new Error('A race needs a player');
    this.player = player;
    if (config.mode !== 'race') {
      this.countdown = 0;
      this.state = 'racing';
    }
  }

  /** Advances the race by a frame; `playerInput` is applied to the player's car. */
  update(frameDt: number, playerInput: InputState): void {
    if (this.paused) return;
    const dt = Math.min(frameDt, 0.1);
    if (this.state === 'countdown') this.updateCountdown(dt);
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= PHYSICS_DT && steps < 30) {
      this.stepPhysics(PHYSICS_DT, playerInput);
      this.accumulator -= PHYSICS_DT;
      steps++;
    }
    if (this.state !== 'countdown') this.clockMs += dt * 1000;
    this.simTime += dt;
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = null;
    }
    this.updateTiming(dt);
    this.updateStandings();
    // consume edge-triggered player inputs once per frame
    playerInput.shiftUp = playerInput.shiftDown = false;
  }

  private updateCountdown(dt: number): void {
    const before = Math.ceil(this.countdown);
    this.countdown -= dt;
    const after = Math.ceil(this.countdown);
    if (before !== after && after >= 1 && after <= 3) this.showMessage(String(after), 1);
    if (this.countdown <= 0) {
      this.state = 'racing';
      this.showMessage('GO!', 1.5);
    }
  }

  private stepPhysics(dt: number, playerInput: InputState): void {
    const launching = this.state === 'countdown';
    for (const p of this.participants) {
      p.vehicle.drivetrain.launchHold = launching;
      if (p.ai) {
        p.ai.update(dt, this.vehicles, p.input);
        if (launching) {
          p.input.throttle = 0;
          p.input.brake = 1;
        }
        p.vehicle.setControls(p.input, dt);
      } else {
        const inp = playerInput;
        if (launching) {
          p.vehicle.setControls(
            { ...inp, throttle: 0, brake: 1, shiftUp: false, shiftDown: false },
            dt,
          );
        } else {
          p.vehicle.setControls(inp, dt);
          inp.shiftUp = inp.shiftDown = false;
        }
      }
      p.vehicle.absActive = false;
    }
    for (const v of this.vehicles) v.step(dt);
    resolveVehicleCollisions(this.vehicles, this.collisionEvents);
  }

  private updateTiming(dt: number): void {
    const L = this.track.length;
    for (const p of this.participants) {
      const s = p.vehicle.query.s;
      const ds = this.track.deltaS(p.lastS, s);
      p.wrongWayTimer = ds < -0.05 && Math.abs(p.vehicle.speed) > 3 ? p.wrongWayTimer + dt : 0;
      const crossedForward = p.lastS > L * 0.85 && s < L * 0.15;
      const crossedBackward = p.lastS < L * 0.15 && s > L * 0.85;
      if (crossedForward && !p.finished && this.state === 'racing') this.onLineCrossed(p);
      if (crossedBackward && p.lap > 0) p.lap -= 1;
      p.lastS = s;
      p.distance = p.lap * L + s;
      if (p.lap > 0 && !p.finished) {
        p.currentLapMs = this.clockMs - p.lapStartMs;
        this.updateSectors(p, s);
        if (p.vehicle.offTrackWheels >= 4) p.invalidLap = true;
      }
    }
  }

  private updateSectors(p: Participant, s: number): void {
    const sectorLen = this.track.length / 3;
    const idx = Math.min(2, Math.floor(s / sectorLen));
    if (idx !== p.sectorIndex && idx === p.sectorIndex + 1) {
      p.sectors[p.sectorIndex] = this.clockMs - p.sectorStartMs;
      p.sectorStartMs = this.clockMs;
      p.sectorIndex = idx;
    }
  }

  private onLineCrossed(p: Participant): void {
    if (p.lap > 0) {
      const lapMs = this.clockMs - p.lapStartMs;
      p.sectors[2] = this.clockMs - p.sectorStartMs;
      p.lastLapMs = lapMs;
      if (!p.invalidLap && (p.bestLapMs === null || lapMs < p.bestLapMs)) {
        p.bestLapMs = lapMs;
        p.bestLapSectors = p.sectors.map((x) => x ?? 0);
        if (p.entry.isPlayer && this.config.mode !== 'race') this.showMessage('BEST LAP', 2);
      }
    }
    p.lap += 1;
    p.lapStartMs = this.clockMs;
    p.sectorStartMs = this.clockMs;
    p.sectorIndex = 0;
    p.sectors = [null, null, null];
    p.invalidLap = false;
    const total = this.config.laps;
    if (this.config.mode === 'race') {
      if (p.lap > total) {
        p.finished = true;
        p.finishTimeMs = this.clockMs;
        if (p.entry.isPlayer) {
          this.state = 'finished';
          this.showMessage('FINISH', 4);
        }
      } else if (p.lap === total && p.entry.isPlayer) this.showMessage('FINAL LAP', 2.5);
    }
  }

  private updateStandings(): void {
    const sorted = [...this.participants].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTimeMs ?? 0) - (b.finishTimeMs ?? 0);
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.distance - a.distance;
    });
    sorted.forEach((p, i) => (p.position = i + 1));
  }

  private showMessage(text: string, seconds: number): void {
    this.message = text;
    this.messageTimer = seconds;
  }

  /** Time gap (ms) between two cars, estimated from distance and the leader's speed. */
  private gapMs(ahead: Participant, behind: Participant): number {
    if (ahead.finished && behind.finished)
      return (behind.finishTimeMs ?? 0) - (ahead.finishTimeMs ?? 0);
    const dist = ahead.distance - behind.distance;
    const speed = Math.max(8, Math.abs(behind.vehicle.speed));
    return (dist / speed) * 1000;
  }

  standings(): StandingEntry[] {
    const sorted = [...this.participants].sort((a, b) => a.position - b.position);
    const leader = sorted[0];
    return sorted.map((p) => ({
      name: p.entry.name,
      carName: p.entry.spec.name,
      position: p.position,
      lap: p.lap,
      gapMs: p === leader ? null : this.gapMs(leader, p),
      bestLapMs: p.bestLapMs,
      isPlayer: p.entry.isPlayer,
      finished: p.finished,
    }));
  }

  hud(out: HudState): HudState {
    const p = this.player;
    const v = p.vehicle;
    const sorted = [...this.participants].sort((a, b) => a.position - b.position);
    const idx = sorted.indexOf(p);
    out.speedKmh = v.speedKmh;
    out.rpm = v.rpm;
    out.redlineRpm = v.drivetrain.redline;
    out.gear = v.gear;
    out.throttle = v.controls.throttle;
    out.brake = v.controls.brake;
    out.position = p.position;
    out.totalCars = this.participants.length;
    out.lap = Math.max(1, Math.min(p.lap, this.config.laps));
    out.totalLaps = this.config.laps;
    out.currentLapMs = p.lap > 0 ? p.currentLapMs : 0;
    out.lastLapMs = p.lastLapMs;
    out.bestLapMs = p.bestLapMs;
    out.deltaToBestMs = this.deltaToBest(p);
    out.sectorTimes = p.sectors;
    out.gapAheadMs = idx > 0 ? this.gapMs(sorted[idx - 1], p) : null;
    out.gapBehindMs = idx < sorted.length - 1 ? this.gapMs(p, sorted[idx + 1]) : null;
    out.countdown =
      this.state === 'countdown' && this.countdown <= 3
        ? Math.max(0, Math.ceil(this.countdown))
        : null;
    out.message = this.message;
    out.finished = p.finished;
    out.offTrack = v.offTrackWheels >= 3;
    out.abs = v.absActive;
    out.tcs = v.tcsActive;
    out.carProgress = this.participants.map((q) => ({
      s: q.vehicle.query.s / this.track.length,
      lateral: q.vehicle.query.lateral,
      color: q.entry.tuning.color,
      isPlayer: q.entry.isPlayer,
    }));
    out.standings = this.standings();
    out.wrongWay = p.wrongWayTimer > 1.5;
    out.invalidLap = p.invalidLap;
    return out;
  }

  private deltaToBest(p: Participant): number | null {
    if (p.bestLapMs === null || p.bestLapSectors.length < 3 || p.lap === 0) return null;
    // compare elapsed time against the best lap at the same track fraction (per sector granularity)
    const frac = p.vehicle.query.s / this.track.length;
    const sectorLen = 1 / 3;
    const si = Math.min(2, Math.floor(frac / sectorLen));
    let bestElapsed = 0;
    for (let i = 0; i < si; i++) bestElapsed += p.bestLapSectors[i];
    bestElapsed += p.bestLapSectors[si] * ((frac - si * sectorLen) / sectorLen);
    return p.currentLapMs - bestElapsed;
  }

  results(): RaceResult {
    const sorted = [...this.participants].sort((a, b) => a.position - b.position);
    const entries: RaceResultEntry[] = sorted.map((p) => ({
      ...this.standings().find((s) => s.name === p.entry.name)!,
      totalTimeMs: p.finishTimeMs,
    }));
    const pos = this.player.position;
    const pp = this.player.pp;
    const posMul = pos === 1 ? 1 : pos === 2 ? 0.7 : pos === 3 ? 0.5 : 0.25;
    const credits =
      this.config.mode === 'race'
        ? Math.round(this.config.laps * 900 * (1 + pp / 500) * posMul)
        : 0;
    return {
      config: this.config,
      entries,
      playerPosition: pos,
      creditsEarned: credits,
      newRecord: false,
      bestLapMs: this.player.bestLapMs,
    };
  }
}
