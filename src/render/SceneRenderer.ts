import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Texture,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { GraphicsSettings, TimeOfDay, Weather } from '../core/types';

interface LightingPreset {
  elevationDeg: number;
  azimuthDeg: number;
  sunIntensity: number;
  sunColor: string;
  ambient: number;
  hemiSky: string;
  hemiGround: string;
  fogColor: string;
  fogDensity: number;
  turbidity: number;
  rayleigh: number;
  exposure: number;
}

const PRESETS: Record<TimeOfDay, LightingPreset> = {
  morning: {
    elevationDeg: 14,
    azimuthDeg: 110,
    sunIntensity: 2.2,
    sunColor: '#ffd9a8',
    ambient: 0.1,
    hemiSky: '#bcd4ff',
    hemiGround: '#5a5a40',
    fogColor: '#d9e2ee',
    fogDensity: 0.0009,
    turbidity: 6,
    rayleigh: 2.2,
    exposure: 0.36,
  },
  noon: {
    elevationDeg: 58,
    azimuthDeg: 180,
    sunIntensity: 2.5,
    sunColor: '#fff4e0',
    ambient: 0.12,
    hemiSky: '#a9c8ff',
    hemiGround: '#6b6b4a',
    fogColor: '#dfe8f4',
    fogDensity: 0.0005,
    turbidity: 3,
    rayleigh: 1.4,
    exposure: 0.35,
  },
  evening: {
    elevationDeg: 7,
    azimuthDeg: 265,
    sunIntensity: 1.8,
    sunColor: '#ffb070',
    ambient: 0.08,
    hemiSky: '#e0a080',
    hemiGround: '#3a3a30',
    fogColor: '#e8c7a8',
    fogDensity: 0.0011,
    turbidity: 10,
    rayleigh: 3.5,
    exposure: 0.4,
  },
  night: {
    elevationDeg: -8,
    azimuthDeg: 30,
    sunIntensity: 0.25,
    sunColor: '#8fa8ff',
    ambient: 0.05,
    hemiSky: '#1a2040',
    hemiGround: '#050508',
    fogColor: '#05070f',
    fogDensity: 0.0016,
    turbidity: 2,
    rayleigh: 0.3,
    exposure: 0.5,
  },
};

/**
 * Owns the WebGL renderer, camera, sky, sun/shadows, environment map, fog and
 * post-processing. Everything else adds itself to `scene`.
 */
export class SceneRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly ambient: AmbientLight;
  private readonly sky: Sky;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private envTexture: Texture | null = null;
  private settings: GraphicsSettings;
  private readonly sunDir = new Vector3();
  private readonly pmrem: PMREMGenerator;
  timeOfDay: TimeOfDay = 'noon';
  weather: Weather = 'clear';

  constructor(canvas: HTMLCanvasElement, settings: GraphicsSettings) {
    this.settings = settings;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.camera = new PerspectiveCamera(settings.fov, 1, 0.1, 6000);
    this.sun = new DirectionalLight('#ffffff', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 600;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new HemisphereLight('#bcd4ff', '#5a5a40', 0.6);
    this.ambient = new AmbientLight('#ffffff', 0.3);
    this.scene.add(this.hemi, this.ambient);
    this.sky = new Sky();
    this.sky.scale.setScalar(450000);
    this.scene.add(this.sky);
    this.pmrem = new PMREMGenerator(this.renderer);
    this.applySettings(settings);
    this.setLighting('noon', 'clear');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applySettings(s: GraphicsSettings): void {
    this.settings = s;
    const q = s.quality;
    const dprCap = q === 'ultra' ? 2 : q === 'high' ? 1.5 : q === 'medium' ? 1.25 : 1;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, dprCap) * MathUtils.clamp(s.resolutionScale, 0.5, 1),
    );
    this.renderer.shadowMap.enabled = s.shadows;
    const shadowSize = q === 'ultra' ? 4096 : q === 'high' ? 3072 : q === 'medium' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.setupPost();
    this.resize();
  }

  private setupPost(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (!this.settings.postProcessing) return;
    const size = this.renderer.getDrawingBufferSize(
      new Vector3() as unknown as import('three').Vector2,
    );
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(size as unknown as import('three').Vector2, 0.15, 0.5, 3.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new SMAAPass());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  /** Configures sun, sky, fog and environment for a time of day and weather. */
  setLighting(time: TimeOfDay, weather: Weather): void {
    this.timeOfDay = time;
    this.weather = weather;
    const p = PRESETS[time];
    const overcast = weather !== 'clear';
    const phi = MathUtils.degToRad(90 - p.elevationDeg);
    const theta = MathUtils.degToRad(p.azimuthDeg);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.turbidity.value = overcast ? 20 : p.turbidity;
    u.rayleigh.value = overcast ? 0.8 : p.rayleigh;
    u.mieCoefficient.value = overcast ? 0.02 : 0.005;
    u.mieDirectionalG.value = 0.8;
    this.sun.color.set(p.sunColor);
    this.sun.intensity = p.sunIntensity * (overcast ? 0.35 : 1);
    this.sun.visible = p.elevationDeg > -3 || true;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = overcast ? 0.45 : 0.3;
    this.ambient.intensity = p.ambient * (overcast ? 1.4 : 1);
    const fogColor = new Color(p.fogColor);
    if (overcast) fogColor.multiplyScalar(0.8);
    const density = p.fogDensity * (weather === 'rain' ? 2.4 : overcast ? 1.6 : 1);
    this.scene.fog = new Fog(fogColor, 80, Math.min(4000, 1.6 / density));
    this.scene.background = null;
    this.renderer.toneMappingExposure = p.exposure * (overcast ? 0.9 : 1);
    this.buildEnvironment();
  }

  private buildEnvironment(): void {
    this.envTexture?.dispose();
    const rt = this.pmrem.fromScene(this.sky as unknown as Scene, 0.02, 1, 1000);
    this.envTexture = rt.texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = this.timeOfDay === 'night' ? 0.25 : 0.3;
  }

  /** Keeps the shadow frustum centred on the point of interest (the player's car). */
  updateShadowTarget(focus: Vector3, radius = 110): void {
    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.updateProjectionMatrix();
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
  }

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  get sunDirection(): Vector3 {
    return this.sunDir;
  }

  dispose(): void {
    this.composer?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
