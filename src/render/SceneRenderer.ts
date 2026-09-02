import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
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
    fogDensity: 0.0006,
    turbidity: 6,
    rayleigh: 2.8,
    exposure: 0.5,
  },
  noon: {
    elevationDeg: 58,
    azimuthDeg: 180,
    sunIntensity: 2.5,
    sunColor: '#fff4e0',
    ambient: 0.12,
    hemiSky: '#a9c8ff',
    hemiGround: '#6b6b4a',
    fogColor: '#c9d8ea',
    fogDensity: 0.00028,
    turbidity: 4,
    rayleigh: 2.6,
    exposure: 0.5,
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
    exposure: 0.55,
  },
  night: {
    elevationDeg: -8,
    azimuthDeg: 30,
    sunIntensity: 0.55,
    sunColor: '#8fa8ff',
    ambient: 0.1,
    hemiSky: '#2a3a6a',
    hemiGround: '#0a0c12',
    fogColor: '#070a14',
    fogDensity: 0.0016,
    turbidity: 2,
    rayleigh: 0.3,
    exposure: 0.75,
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
  private readonly skyScale = { value: 0.32 };
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
    // the physical sky is far brighter than the rest of the scene; scale its output down
    const skyMat = this.sky.material;
    skyMat.onBeforeCompile = (shader) => {
      shader.uniforms.skyScale = this.skyScale;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'uniform float mieDirectionalG;',
          'uniform float mieDirectionalG;\nuniform float skyScale;',
        )
        .replace(
          'gl_FragColor = vec4( texColor, 1.0 );',
          'gl_FragColor = vec4( min( texColor * skyScale, vec3( 2.2 ) ), 1.0 );',
        );
    };
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
    this.bloom = new UnrealBloomPass(size as unknown as import('three').Vector2, 0.12, 0.4, 2.0);
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
    this.hemi.intensity = this.timeOfDay === 'night' ? 0.5 : overcast ? 0.45 : 0.3;
    this.ambient.intensity = p.ambient * (overcast ? 1.4 : 1);
    const fogColor = new Color(p.fogColor);
    if (overcast) fogColor.multiplyScalar(0.8);
    const density = p.fogDensity * (weather === 'rain' ? 2.4 : overcast ? 1.6 : 1);
    this.scene.fog = new Fog(fogColor, 120, Math.min(7000, 1.8 / density));
    this.scene.background = null;
    this.renderer.toneMappingExposure = p.exposure * (overcast ? 0.9 : 1);
    this.buildEnvironment();
  }

  /**
   * Image-based lighting comes from a small gradient dome with sane radiance
   * (the physical sky is far too bright to use directly), plus a sun blob so
   * car paint picks up a highlight.
   */
  private buildEnvironment(): void {
    this.envTexture?.dispose();
    const p = PRESETS[this.timeOfDay];
    const overcast = this.weather !== 'clear';
    const envScene = new Scene();
    const top = new Color(p.hemiSky).multiplyScalar(overcast ? 0.55 : 0.75);
    const horizon = new Color(p.fogColor).multiplyScalar(overcast ? 0.6 : 0.85);
    const ground = new Color(p.hemiGround).multiplyScalar(0.5);
    const dome = new Mesh(
      new SphereGeometry(50, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        uniforms: {
          top: { value: top },
          horizon: { value: horizon },
          ground: { value: ground },
          sunDir: { value: this.sunDir.clone() },
          sunColor: {
            value: new Color(p.sunColor).multiplyScalar(overcast ? 1.5 : p.sunIntensity * 2.5),
          },
        },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
          void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(horizon, top, pow(y, 0.6)) : mix(horizon, ground, pow(-y, 0.5));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunColor * pow(s, 400.0) + sunColor * 0.04 * pow(s, 8.0);
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    envScene.add(dome);
    const rt = this.pmrem.fromScene(envScene, 0.04, 1, 100);
    dome.geometry.dispose();
    (dome.material as ShaderMaterial).dispose();
    this.envTexture = rt.texture;
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = this.timeOfDay === 'night' ? 0.5 : 1;
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
