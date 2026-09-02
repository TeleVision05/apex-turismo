/**
 * Shared contracts between the game core, renderer, UI and audio.
 * Coordinate system: Three.js right-handed, +Y up. Track JSON: +X east, +Z south.
 * Car local frame: forward = -Z, right = +X, up = +Y (matches the GLB export).
 */

export type Drivetrain = 'FR' | 'FF' | 'MR' | 'RR' | '4WD';
export type CarClass = 'N100' | 'N200' | 'N300' | 'N500' | 'Gr.4' | 'Gr.3' | 'Gr.1';
export type TyreCompound = 'comfort' | 'sport' | 'racing';

/** A point on an engine torque curve. */
export interface TorquePoint {
  rpm: number;
  nm: number;
}

/** Static description of a car: physics parameters and shop metadata. */
export interface CarSpec {
  id: string;
  name: string;
  maker: string;
  year: number;
  country: string;
  carClass: CarClass;
  priceCr: number;
  description: string;
  model: string; // GLB file name in public/models/cars
  defaultColor: string; // hex
  colors: string[]; // selectable hex colours
  massKg: number;
  /** fraction of static weight on the front axle (0..1) */
  frontWeightBias: number;
  drivetrain: Drivetrain;
  /** torque split to the front axle for 4WD (0..1) */
  frontTorqueSplit: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  wheelbaseM: number;
  trackM: number;
  cgHeightM: number;
  wheelRadiusM: number;
  torqueCurve: TorquePoint[];
  idleRpm: number;
  redlineRpm: number;
  gearRatios: number[]; // forward gears
  finalDrive: number;
  reverseRatio: number;
  dragCd: number;
  frontalAreaM2: number;
  /** downforce coefficient * area (Cl*A) for front and rear, positive = down */
  downforceFront: number;
  downforceRear: number;
  /** suspension spring rate N/m per corner and damping N*s/m */
  springFront: number;
  springRear: number;
  damperFront: number;
  damperRear: number;
  antiRollFront: number;
  antiRollRear: number;
  suspensionTravelM: number;
  brakeTorqueNm: number; // max total at 100% pedal (front+rear)
  brakeBias: number; // fraction front
  /** base tyre grip coefficient at asphalt with sport tyres */
  tyreGrip: number;
  steerLockDeg: number;
  /** starting tyre fitment */
  tyres: TyreCompound;
}

/** Per-car upgrades and settings that the player can change in the tuning shop. */
export interface CarTuning {
  powerStage: 0 | 1 | 2 | 3;
  weightStage: 0 | 1 | 2 | 3;
  tyres: TyreCompound;
  /** -1 (soft) .. +1 (stiff) */
  suspension: number;
  /** -1 (low) .. +1 (high) downforce, only for cars with aero */
  downforce: number;
  /** final-drive multiplier 0.85 (long) .. 1.15 (short) */
  finalDriveMul: number;
  /** brake bias override 0.5..0.7 front */
  brakeBias: number;
  color: string;
}

export interface OwnedCar {
  specId: string;
  tuning: CarTuning;
  /** total distance driven in metres (for garage stats) */
  odometerM: number;
}

export interface TrackCorner {
  name: string;
  number: number | null;
  index: number;
}

/** The JSON produced by tools/tracks. */
export interface TrackJson {
  id: string;
  name: string;
  country: string;
  lengthM: number;
  direction: 'clockwise' | 'anticlockwise';
  sampleSpacingM: number;
  points: [number, number, number][];
  widths: number[];
  startIndex: number;
  corners: TrackCorner[];
  pitLane: [number, number, number][] | null;
  origin: { lat: number; lon: number };
  source: string;
}

export interface TrackIndexEntry {
  id: string;
  name: string;
  country: string;
  lengthM: number;
  direction: string;
  corners: number;
  elevationRangeM: number;
}

export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'night';
export type Weather = 'clear' | 'overcast' | 'rain';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';
export type Transmission = 'auto' | 'manual';

export interface Assists {
  abs: boolean;
  tcs: number; // 0 off, 1 weak, 2 strong
  stability: boolean;
  racingLine: boolean;
  autoBrake: boolean; // "brake assist" for beginners
}

export interface RaceConfig {
  mode: 'race' | 'timetrial' | 'practice';
  trackId: string;
  laps: number;
  opponents: number;
  difficulty: Difficulty;
  timeOfDay: TimeOfDay;
  weather: Weather;
  playerCarId: string; // owned car index as string, or spec id in arcade
  /** opponents are drawn from this class when set */
  opponentClass?: CarClass;
  eventId?: string;
  rollingStart: boolean;
  /** driver-selected transmission */
  transmission: Transmission;
}

export interface GraphicsSettings {
  quality: 'low' | 'medium' | 'high' | 'ultra';
  shadows: boolean;
  postProcessing: boolean;
  motionBlur: boolean;
  resolutionScale: number; // 0.5 .. 1.0 of devicePixelRatio
  fov: number;
}

export interface AudioSettings {
  master: number;
  engine: number;
  effects: number;
  music: number;
}

export interface GameSettings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  assists: Assists;
  transmission: Transmission;
  units: 'kmh' | 'mph';
  cameraMode: CameraMode;
  steeringSensitivity: number; // 0.5..2 for gamepad/keyboard
  wheelRotationDeg: number; // physical wheel lock-to-lock, e.g. 900
  wheelForceFeedback: number; // 0..1 (vibration strength where available)
}

export type CameraMode = 'chase' | 'chaseFar' | 'hood' | 'cockpit' | 'bumper';

/** A lap record stored in the save file. */
export interface LapRecord {
  trackId: string;
  carSpecId: string;
  timeMs: number;
  dateIso: string;
}

export interface SaveData {
  version: number;
  credits: number;
  garage: OwnedCar[];
  selectedCar: number;
  records: LapRecord[];
  completedEvents: Record<string, { bestPosition: number; count: number }>;
  settings: GameSettings;
  totalRaces: number;
  totalDistanceM: number;
  inputMappings: Record<string, InputMapping>;
  driverName: string;
}

/** Digital + analogue controls, normalised. */
export interface InputState {
  steer: number; // -1 left .. +1 right
  /** true when steer comes from a physical wheel and maps 1:1 to the road wheels */
  steerIsDirect: boolean;
  throttle: number; // 0..1
  brake: number; // 0..1
  handbrake: boolean;
  shiftUp: boolean; // edge-triggered (true for one frame)
  shiftDown: boolean;
  camera: boolean; // edge
  lookBack: boolean;
  pause: boolean; // edge
  reset: boolean; // edge
  standings: boolean;
  /** menu navigation, edge triggered */
  menuUp: boolean;
  menuDown: boolean;
  menuLeft: boolean;
  menuRight: boolean;
  menuConfirm: boolean;
  menuBack: boolean;
}

export type InputAction =
  | 'steerLeft'
  | 'steerRight'
  | 'steerAxis'
  | 'throttle'
  | 'brake'
  | 'handbrake'
  | 'shiftUp'
  | 'shiftDown'
  | 'camera'
  | 'lookBack'
  | 'pause'
  | 'reset'
  | 'standings';

/** One binding of a gamepad/wheel control to an action. */
export interface DeviceBinding {
  kind: 'axis' | 'button';
  index: number;
  /** For axes: value at rest and value when fully engaged (handles inverted pedals). */
  rest: number;
  full: number;
}

export interface InputMapping {
  deviceId: string;
  deviceType: 'gamepad' | 'wheel';
  bindings: Partial<Record<InputAction, DeviceBinding>>;
}

/** Everything the HUD needs each frame. */
export interface HudState {
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  gear: number; // 0 = N, -1 = R
  throttle: number;
  brake: number;
  position: number;
  totalCars: number;
  lap: number;
  totalLaps: number;
  currentLapMs: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  deltaToBestMs: number | null;
  sectorTimes: (number | null)[];
  gapAheadMs: number | null;
  gapBehindMs: number | null;
  countdown: number | null; // 3,2,1 or null
  message: string | null; // e.g. "GO!", "FINAL LAP", "FINISH"
  finished: boolean;
  offTrack: boolean;
  abs: boolean; // ABS active this frame
  tcs: boolean;
  fuel?: number;
  /** normalised track progress of every car for the minimap, index 0 = player */
  carProgress: { s: number; lateral: number; color: string; isPlayer: boolean }[];
  standings: StandingEntry[];
  wrongWay: boolean;
  invalidLap: boolean;
}

export interface StandingEntry {
  name: string;
  carName: string;
  position: number;
  lap: number;
  gapMs: number | null; // to leader; null for leader
  bestLapMs: number | null;
  isPlayer: boolean;
  finished: boolean;
}

export interface RaceResultEntry extends StandingEntry {
  totalTimeMs: number | null;
}

export interface RaceResult {
  config: RaceConfig;
  entries: RaceResultEntry[];
  playerPosition: number;
  creditsEarned: number;
  newRecord: boolean;
  bestLapMs: number | null;
}
