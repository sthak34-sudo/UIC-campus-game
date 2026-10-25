/**
 * Cascaded sun shadows (three's CSM addon, the same technique as three-csm).
 * Several shadow maps cover near, middle, and far distances so the player sees a sharp
 * shadow without a huge single map. Every lit standard material has to opt in, otherwise
 * the three cascade lights would each add their own sun.
 * OWNER: Graphics Engineer.
 *
 * Baked lightmaps for Daley Library and University Hall are a follow-up: those meshes are
 * merged without a second UV channel, so a unique lightmap atlas is not a small change.
 * Screen-space N8AO is the stand-in until then.
 */
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import type { QualitySettings } from './quality';

const hooked = new WeakSet<THREE.Material>();

export function hookCascadeMaterial(material: THREE.Material, csm: CSM): void {
  if (hooked.has(material)) return;
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  hooked.add(material);
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey.bind(material);
  csm.setupMaterial(material);
  const csmCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    csmCompile.call(material, shader, renderer);
    prev.call(material, shader, renderer);
  };
  material.customProgramCacheKey = () => `csm${csm.cascades}:${prevKey()}`;
  material.needsUpdate = true;
}

export class CascadeSun {
  readonly csm: CSM;
  private readonly baseFar: number;

  constructor(scene: THREE.Scene, camera: THREE.Camera, q: QualitySettings) {
    this.baseFar = q.shadowFar;
    this.csm = new CSM({
      camera,
      parent: scene,
      cascades: q.cascades,
      maxFar: q.shadowFar,
      mode: 'practical',
      shadowMapSize: q.shadowMapSize,
      shadowBias: -0.0002,
      lightDirection: new THREE.Vector3(0.2, -1, 0.15).normalize(),
      lightIntensity: 2,
      lightNear: 1,
      lightFar: 2500,
      lightMargin: 80,
    });
    this.csm.fade = false;
    for (const light of this.csm.lights) {
      light.name = 'gfx.sun';
      light.shadow.bias = -0.0002;
      light.shadow.normalBias = 0.045;
      light.shadow.radius = q.shadowRadius;
      light.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    }
  }

  /** `towardSun` points from the ground toward the sun. */
  setDirectionTowardSun(towardSun: THREE.Vector3): void {
    this.csm.lightDirection.copy(towardSun).multiplyScalar(-1);
    if (this.csm.lightDirection.lengthSq() < 1e-8) this.csm.lightDirection.set(0, -1, 0);
    else this.csm.lightDirection.normalize();
  }

  setAppearance(color: THREE.Color, intensity: number): void {
    this.csm.lightIntensity = intensity;
    for (const light of this.csm.lights) {
      light.color.copy(color);
      light.intensity = intensity;
      light.castShadow = intensity > 1e-4;
    }
  }

  /** Opt every standard material under `root` into the cascade shader. Cheap after the first pass. */
  adopt(root: THREE.Object3D): void {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material;
      if (!mat) return;
      const list = Array.isArray(mat) ? mat : [mat];
      for (const m of list) hookCascadeMaterial(m, this.csm);
    });
  }

  update(camera: THREE.Camera): void {
    const height = Math.max(0, camera.position.y);
    const want = height < 35 ? this.baseFar : Math.min(1400, this.baseFar + height * 2.4);
    if (Math.abs(this.csm.maxFar - want) > 30) {
      this.csm.maxFar = want;
      this.csm.updateFrustums();
    }
    this.csm.update();
  }
}
