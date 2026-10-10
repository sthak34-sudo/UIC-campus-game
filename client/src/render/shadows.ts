/**
 * Sun shadow that follows the camera. One shadow map (cheap: one extra depth pass) whose box is
 * centered a little ahead of the camera at street level, snapped to whole shadow texels so edges
 * don't shimmer while walking. For aerial cameras the box recenters on where the camera looks and
 * grows with altitude (coarser, but the whole view gets shadows).
 * OWNER: Graphics Engineer.
 */
import * as THREE from 'three';
import type { QualitySettings } from './quality';

const DIST = 900; // light distance from the shadow center (m)

export class ShadowFollower {
  private dir = new THREE.Vector3(0, 1, 0);
  private right = new THREE.Vector3(1, 0, 0);
  private up = new THREE.Vector3(0, 0, -1);
  private center = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private extent = 0;

  constructor(private sun: THREE.DirectionalLight, private q: QualitySettings) {
    const s = sun.shadow;
    s.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    s.radius = q.shadowRadius;
    s.blurSamples = 8;
    s.camera.near = 1;
    s.camera.far = DIST * 2;
    this.setExtent(q.shadowExtent);
  }

  setSunDirection(d: THREE.Vector3): void {
    this.dir.copy(d).normalize();
    const worldUp = Math.abs(this.dir.y) > 0.99 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
    // same basis three's lookAt builds for the shadow camera (looking along -dir)
    this.right.crossVectors(worldUp, this.dir).normalize();
    this.up.crossVectors(this.dir, this.right).normalize();
  }

  private setExtent(e: number): void {
    if (e === this.extent) return;
    this.extent = e;
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -e / 2;
    c.right = c.top = e / 2;
    c.updateProjectionMatrix();
    const texel = e / this.q.shadowMapSize;
    this.sun.shadow.normalBias = texel * 1.4;
    this.sun.shadow.bias = -0.00004;
  }

  update(camera: THREE.Camera): void {
    const pos = camera.getWorldPosition(this.tmp).clone();
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const height = Math.max(pos.y, 0);
    let extent = this.q.shadowExtent;
    const c = this.center;
    if (height < 40 || fwd.y > -0.05) {
      // street level: shift the box forward so more of it is in view
      const h = new THREE.Vector3(fwd.x, 0, fwd.z);
      if (h.lengthSq() > 1e-6) h.normalize();
      c.copy(pos).addScaledVector(h, extent * 0.3);
      c.y = Math.min(pos.y, 20);
    } else {
      const t = Math.min(-pos.y / fwd.y, 2500);
      c.copy(pos).addScaledVector(fwd, t * 0.85);
      c.y = 0;
      // grow with altitude, quantized to avoid constant resizing
      const want = Math.min(1600, extent + height * 2.6);
      extent = extent * Math.pow(1.25, Math.ceil(Math.log(want / extent) / Math.log(1.25)));
    }
    this.setExtent(extent);
    // snap to texels in light space
    const texel = extent / this.q.shadowMapSize;
    const cr = c.dot(this.right);
    const cu = c.dot(this.up);
    c.addScaledVector(this.right, Math.round(cr / texel) * texel - cr);
    c.addScaledVector(this.up, Math.round(cu / texel) * texel - cu);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(this.dir, DIST);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }
}
