import type { Track } from '../../../track/Track';
import type { TrackSceneOptions } from '../types';

/** Side of the track a landmark/region sits on, relative to driving direction. 'center' spans the road (bridges). */
export type Side = 'left' | 'right' | 'center';
export type RoofStyle = 'flat' | 'pitched' | 'tiered' | 'wing';

interface PlacedAt {
  /** arc length in metres from start/finish */
  s: number;
  side: Side;
  /** metres beyond the barrier line (clamped to a minimum of 4m clearance) */
  distance: number;
  /** extra yaw in degrees on top of facing along the track */
  rotationDeg?: number;
  scale?: number;
}

export interface GrandstandSpec extends PlacedAt {
  kind: 'grandstand';
  length: number;
  rows: number;
  roof: RoofStyle;
  seatColors?: number[];
}

export interface PitComplexSpec extends PlacedAt {
  kind: 'pitComplex';
  length: number;
  garages: number;
  towerHeight: number;
  roof: RoofStyle;
  color?: number;
}

export interface PaddockSpec extends PlacedAt {
  kind: 'paddock';
  blocks: number;
  spread: number;
}

export interface FerrisWheelSpec extends PlacedAt {
  kind: 'ferrisWheel';
  radius: number;
}

export interface BullStatueSpec extends PlacedAt {
  kind: 'bullStatue';
  hillHeight: number;
}

export interface MountainConeSpec extends PlacedAt {
  kind: 'mountainCone';
  height: number;
  radius: number;
  snowLine: number;
}

export interface RidgeLineSpec extends PlacedAt {
  kind: 'ridgeLine';
  length: number;
  height: number;
  peaks: number;
}

export interface RollingHillsSpec extends PlacedAt {
  kind: 'rollingHills';
  length: number;
  height: number;
  oaks: number;
}

export interface CitySkylineSpec extends PlacedAt {
  kind: 'citySkyline';
  length: number;
  towers: number;
  maxHeight: number;
}

export interface BridgeSpec extends PlacedAt {
  kind: 'bridge';
  clearance: number;
}

export interface MarshalPostSpec extends PlacedAt {
  kind: 'marshalPost';
}

export interface CameraTowerSpec extends PlacedAt {
  kind: 'cameraTower';
  height: number;
}

export interface ApexBoardSpec extends PlacedAt {
  kind: 'apexBoard';
}

export interface HelipadSpec extends PlacedAt {
  kind: 'helipad';
}

export interface CarParkSpec extends PlacedAt {
  kind: 'carPark';
  rows: number;
  cols: number;
}

export type Landmark =
  | GrandstandSpec
  | PitComplexSpec
  | PaddockSpec
  | FerrisWheelSpec
  | BullStatueSpec
  | MountainConeSpec
  | RidgeLineSpec
  | RollingHillsSpec
  | CitySkylineSpec
  | BridgeSpec
  | MarshalPostSpec
  | CameraTowerSpec
  | ApexBoardSpec
  | HelipadSpec
  | CarParkSpec;

interface RegionBase {
  sStart: number;
  sEnd: number;
  side: 'left' | 'right' | 'both';
  distance: number;
}

export interface ForestBeltRegion extends RegionBase {
  kind: 'forestBelt';
  density: number;
  tall?: boolean;
}

export interface AdBoardRunRegion extends RegionBase {
  kind: 'adBoardRun';
  spacing: number;
  colors: number[];
}

export interface FlagRowRegion extends RegionBase {
  kind: 'flagRow';
  spacing: number;
}

export interface GravelTrapRegion extends RegionBase {
  kind: 'gravelTrap';
  width: number;
}

export type Region = ForestBeltRegion | AdBoardRunRegion | FlagRowRegion | GravelTrapRegion;

export interface DressingSpec {
  id: string;
  landmarks: Landmark[];
  regions: Region[];
}

export interface DressingContext {
  track: Track;
  options: TrackSceneOptions;
}

/** A world-space placement resolved from a PlacedAt: position sits on terrain, forward/right follow the track frame. */
export interface PlacementFrame {
  position: import('three').Vector3;
  forward: import('three').Vector3;
  right: import('three').Vector3;
  index: number;
}
