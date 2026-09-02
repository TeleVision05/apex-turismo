import * as THREE from 'three';
import {
  DirectionalLight,
  HemisphereLight,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Track } from '../../src/track/Track';
import { RacingLine } from '../../src/track/RacingLine';
import type { TrackJson } from '../../src/core/types';
import { buildTrackScene } from '../../src/render/track/TrackScene';

const params = new URLSearchParams(location.search);
const trackId = params.get('track') ?? 'suzuka';
const quality = (params.get('quality') as 'low' | 'medium' | 'high' | 'ultra') ?? 'high';
const cornerParam = params.get('corner');
const hideTrees = params.get('hideTrees') === '1';
const viewParam = params.get('view'); // 'start' | 'overhead' | 'corner'

const statsEl = document.getElementById('stats') as HTMLDivElement;

async function main(): Promise<void> {
  const res = await fetch(`/tracks/${trackId}.json`);
  if (!res.ok) throw new Error(`could not load /tracks/${trackId}.json (${res.status})`);
  const json = (await res.json()) as TrackJson;
  const track = new Track(json);
  const racingLine = new RacingLine(track);

  const scene = new Scene();
  const trackScene = buildTrackScene(track, { quality, timeOfDay: 'noon', racingLine });
  if (hideTrees) trackScene.group.getObjectByName('trees')?.removeFromParent();
  scene.add(trackScene.group);

  scene.add(new HemisphereLight(0xbfd9ff, 0x2a2a1a, 1.1));
  const sun = new DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(track.points[0].x + 300, 400, track.points[0].z + 200);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 1200;
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  scene.add(sun);

  const camera = new PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 5000);
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  document.getElementById('app')!.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const startView = (): void => {
    const p = track.points[0];
    const f = track.forwards[0];
    camera.position.set(p.x - f.x * 6, p.y + 1.2, p.z - f.z * 6);
    controls.target.set(p.x + f.x * 20, p.y + 1, p.z + f.z * 20);
    controls.update();
  };
  const overheadView = (): void => {
    const c = trackScene.bounds.getCenter(track.points[0].clone());
    const size = trackScene.bounds.getSize(track.points[0].clone());
    const dist = Math.max(size.x, size.z) * 0.7;
    camera.position.set(c.x, dist, c.z + 0.01);
    controls.target.set(c.x, c.y, c.z);
    controls.update();
  };
  const cornerView = (index: number): void => {
    const p = track.points[index];
    const f = track.forwards[index];
    const r = track.rights[index];
    camera.position.set(p.x - f.x * 25 + r.x * 15, p.y + 12, p.z - f.z * 25 + r.z * 15);
    controls.target.set(p.x, p.y + 1, p.z);
    controls.update();
  };
  document.getElementById('btn-start')!.addEventListener('click', startView);
  document.getElementById('btn-overhead')!.addEventListener('click', overheadView);
  let lineVisible = false;
  document.getElementById('btn-line')!.addEventListener('click', () => {
    lineVisible = !lineVisible;
    trackScene.setRacingLineVisible(lineVisible);
  });
  if (viewParam === 'overhead') overheadView();
  else if (cornerParam !== null) cornerView(Number(cornerParam));
  else startView();
  (window as unknown as { __viewer: unknown }).__viewer = {
    camera,
    controls,
    track,
    trackScene,
    THREE,
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    controls.update();
    trackScene.update(dt, camera.position);
    renderer.render(scene, camera);
    statsEl.textContent =
      `track=${trackId} quality=${quality} ` +
      `calls=${renderer.info.render.calls} tris=${renderer.info.render.triangles} ` +
      `verts=${renderer.info.render.points}`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  statsEl.textContent = `error: ${String(err)}`;
  console.error(err);
});
