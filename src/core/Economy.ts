import type { CarSpec, CarTuning, OwnedCar, SaveData, TyreCompound } from './types';
import type { UpgradeInfo } from '../ui/UiContract';
import { carById } from '../data/cars';
import { defaultTuning } from '../physics/Tuning';

const TYRES: TyreCompound[] = ['comfort', 'sport', 'racing'];

/** Prices scale with the car so upgrades stay meaningful on expensive cars. */
export function upgradeCatalogue(spec: CarSpec): UpgradeInfo[] {
  const base = Math.max(4000, Math.round((spec.priceCr * 0.06) / 100) * 100);
  return [
    {
      kind: 'power',
      label: 'Engine tuning',
      stages: [
        { label: 'Stock', priceCr: 0 },
        { label: 'Stage 1: Sports ECU & exhaust (+8%)', priceCr: base },
        { label: 'Stage 2: Intake, cams & headers (+17%)', priceCr: base * 2.5 },
        { label: 'Stage 3: Full race build (+28%)', priceCr: base * 5 },
      ],
    },
    {
      kind: 'weight',
      label: 'Weight reduction',
      stages: [
        { label: 'Stock', priceCr: 0 },
        { label: 'Stage 1: Interior strip (-3%)', priceCr: base * 0.8 },
        { label: 'Stage 2: Carbon panels (-6%)', priceCr: base * 2 },
        { label: 'Stage 3: Full carbon body (-10%)', priceCr: base * 4 },
      ],
    },
    {
      kind: 'tyres',
      label: 'Tyres',
      stages: [
        { label: 'Comfort', priceCr: Math.round(base * 0.3) },
        { label: 'Sport', priceCr: Math.round(base * 0.7) },
        { label: 'Racing slicks', priceCr: Math.round(base * 1.6) },
      ],
    },
  ];
}

const fmt = (n: number): string => `Cr. ${Math.round(n).toLocaleString('en-US')}`;

/** Garage, dealership and tuning-shop transactions on the save data. */
export class Economy {
  constructor(private readonly save: SaveData) {}

  buyCar(specId: string, color: string): string | null {
    const spec = carById(specId);
    if (this.save.credits < spec.priceCr) {
      return `You need ${fmt(spec.priceCr - this.save.credits)} more to buy the ${spec.name}. Win races to earn credits.`;
    }
    this.save.credits -= spec.priceCr;
    const tuning = defaultTuning(spec);
    tuning.color = spec.colors.includes(color) ? color : spec.defaultColor;
    this.save.garage.push({ specId, tuning, odometerM: 0 });
    this.save.selectedCar = this.save.garage.length - 1;
    return null;
  }

  sellCar(index: number): string | null {
    if (this.save.garage.length <= 1) return 'You cannot sell your only car.';
    const car = this.save.garage[index];
    if (!car) return 'That car is not in your garage.';
    const spec = carById(car.specId);
    const value = Math.round(spec.priceCr * 0.55);
    this.save.credits += value;
    this.save.garage.splice(index, 1);
    if (this.save.selectedCar >= this.save.garage.length)
      this.save.selectedCar = this.save.garage.length - 1;
    return null;
  }

  buyUpgrade(index: number, kind: UpgradeInfo['kind'], stage: number): string | null {
    const car = this.save.garage[index];
    if (!car) return 'That car is not in your garage.';
    const spec = carById(car.specId);
    const info = upgradeCatalogue(spec).find((u) => u.kind === kind);
    const target = info?.stages[stage];
    if (!info || !target) return 'That upgrade is not available.';
    const current =
      kind === 'power'
        ? car.tuning.powerStage
        : kind === 'weight'
          ? car.tuning.weightStage
          : TYRES.indexOf(car.tuning.tyres);
    if (current === stage) return 'That is already installed.';
    if (kind !== 'tyres' && stage < current) {
      this.applyStage(car, kind, stage);
      return null;
    }
    if (this.save.credits < target.priceCr) {
      return `You need ${fmt(target.priceCr - this.save.credits)} more for ${target.label}.`;
    }
    this.save.credits -= target.priceCr;
    this.applyStage(car, kind, stage);
    return null;
  }

  private applyStage(car: OwnedCar, kind: UpgradeInfo['kind'], stage: number): void {
    if (kind === 'power') car.tuning.powerStage = stage as CarTuning['powerStage'];
    else if (kind === 'weight') car.tuning.weightStage = stage as CarTuning['weightStage'];
    else car.tuning.tyres = TYRES[stage];
  }
}
