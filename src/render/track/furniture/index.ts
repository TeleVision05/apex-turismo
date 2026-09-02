import { Group, Mesh } from 'three';
import type { Track } from '../../../track/Track';
import type { TrackSceneOptions } from '../types';
import { mergeDisposables, newDisposables, type Disposables } from '../types';
import { buildPitBuilding } from './pitBuilding';
import { buildGrandstand } from './grandstand';
import { buildStartGantry, GREEN_OFF, GREEN_ON, RED_OFF, RED_ON } from './startGantry';
import { buildMarshalHuts } from './marshalHuts';
import { buildDistanceBoards } from './distanceBoards';
import { buildFlagPoles, buildLightPoles } from './flagsAndLights';
import { buildCornerSigns } from './cornerSigns';

export interface FurnitureBuild {
  group: Group;
  disposables: Disposables;
  setStartLights(count: number): void;
  animatedFlags: Mesh[];
  lodBoards: Mesh[];
}

export function buildFurniture(track: Track, options: TrackSceneOptions): FurnitureBuild {
  const group = new Group();
  group.name = 'furniture';
  const disposables = newDisposables();

  const pit = buildPitBuilding(track);
  const grandstand = buildGrandstand(track);
  const gantry = buildStartGantry(track);
  const huts = buildMarshalHuts(track);
  const boards = buildDistanceBoards(track);
  const signs = buildCornerSigns(track);
  const flags = buildFlagPoles(track);
  const lights = buildLightPoles(track, options.timeOfDay);

  group.add(
    pit.group,
    grandstand.group,
    gantry.group,
    huts.group,
    boards.group,
    signs.group,
    flags.group,
    lights.group,
  );
  mergeDisposables(
    disposables,
    pit.disposables,
    grandstand.disposables,
    gantry.disposables,
    huts.disposables,
    boards.disposables,
    signs.disposables,
    flags.disposables,
    lights.disposables,
  );

  const setStartLights = (count: number): void => {
    gantry.redLamps.forEach((mat, i) => {
      const on = count >= 0 && i < count;
      mat.color.setHex(on ? RED_ON : RED_OFF);
      mat.emissive.setHex(on ? RED_ON : RED_OFF);
    });
    const green = count === -1;
    gantry.greenLamp.color.setHex(green ? GREEN_ON : GREEN_OFF);
    gantry.greenLamp.emissive.setHex(green ? GREEN_ON : GREEN_OFF);
  };
  setStartLights(0);

  const lodBoards: Mesh[] = [];
  boards.group.traverse((child) => {
    if (child instanceof Mesh) lodBoards.push(child);
  });
  signs.group.traverse((child) => {
    if (child instanceof Mesh) lodBoards.push(child);
  });

  return { group, disposables, setStartLights, animatedFlags: flags.flags, lodBoards };
}
