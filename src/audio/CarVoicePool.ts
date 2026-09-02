import type { CarAudioState } from './AudioContract';
import type { AudioCore } from './AudioCore';
import { EngineVoice } from './EngineVoice';
import { TyreVoice } from './TyreVoice';

const MAX_OTHER_VOICES = 4;

interface Slot {
  carId: number | null;
  engine: EngineVoice;
  tyre: TyreVoice;
}

/**
 * Fixed-size pool of engine+tyre voices: one reserved for the player, up
 * to four more reused (never recreated) for the nearest other cars each
 * frame. Cars outside that window simply never get a voice.
 */
export class CarVoicePool {
  private playerSlot: Slot;
  private otherSlots: Slot[] = [];

  constructor(private core: AudioCore) {
    this.playerSlot = this.makeSlot();
    for (let i = 0; i < MAX_OTHER_VOICES; i++) this.otherSlots.push(this.makeSlot());
  }

  private makeSlot(): Slot {
    return {
      carId: null,
      engine: new EngineVoice(this.core.ctx, this.core.raceEngineGain),
      tyre: new TyreVoice(this.core.ctx, this.core.raceLoopGain),
    };
  }

  update(cars: CarAudioState[], dt: number): void {
    const player = cars.find((c) => c.isPlayer) ?? null;
    this.updatePlayer(player, dt);

    const nearest = cars
      .filter((c) => !c.isPlayer)
      .map((c) => ({ c, d: Math.hypot(c.relX, c.relZ) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_OTHER_VOICES);
    this.freeStaleSlots(nearest.map((o) => o.c.id));
    this.assignNewcomers(nearest.map((o) => o.c));
    this.updateAssignedOthers(
      nearest.map((o) => o.c),
      dt,
    );
  }

  private updatePlayer(car: CarAudioState | null, dt: number): void {
    const slot = this.playerSlot;
    if (!car) {
      slot.engine.idle();
      slot.tyre.idle();
      slot.carId = null;
      return;
    }
    if (slot.carId !== car.id) {
      slot.carId = car.id;
      slot.engine.assign(car);
      slot.tyre.assign(car);
    }
    slot.engine.update(car, dt);
    slot.tyre.update(car, dt);
  }

  private freeStaleSlots(wantedIds: number[]): void {
    const wanted = new Set(wantedIds);
    for (const slot of this.otherSlots) {
      if (slot.carId !== null && !wanted.has(slot.carId)) {
        slot.carId = null;
        slot.engine.idle();
        slot.tyre.idle();
      }
    }
  }

  private assignNewcomers(cars: CarAudioState[]): void {
    for (const c of cars) {
      if (this.otherSlots.some((s) => s.carId === c.id)) continue;
      const free = this.otherSlots.find((s) => s.carId === null);
      if (!free) continue;
      free.carId = c.id;
      free.engine.assign(c);
      free.tyre.assign(c);
    }
  }

  private updateAssignedOthers(cars: CarAudioState[], dt: number): void {
    for (const slot of this.otherSlots) {
      if (slot.carId === null) continue;
      const car = cars.find((c) => c.id === slot.carId);
      if (!car) continue;
      slot.engine.update(car, dt);
      slot.tyre.update(car, dt);
    }
  }
}
