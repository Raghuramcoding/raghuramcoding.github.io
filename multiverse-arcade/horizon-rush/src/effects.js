import * as THREE from 'three';

// Pooled smoke/flame particles as a single Points cloud.
export class ParticlePool {
  constructor(scene, count, opts = {}) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.size = new Float32Array(count);
    this.cur = 0;
    const geo = new THREE.BufferGeometry();
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -1000;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.PointsMaterial({
      color: opts.color || 0xdddddd,
      size: opts.size || 2.2,
      transparent: true, opacity: opts.opacity || 0.5,
      depthWrite: false, sizeAttenuation: true,
      blending: opts.blending || THREE.NormalBlending,
    });
    this.mat = mat;
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
    this.grav = opts.grav ?? 0.0;
    this.drag = opts.drag ?? 0.96;
  }
  emit(x, y, z, vx, vy, vz, life) {
    const i = this.cur; this.cur = (this.cur + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
  }
  update(dt) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { if (p[i * 3 + 1] > -900) p[i * 3 + 1] = -1000; continue; }
      this.life[i] -= dt;
      v[i * 3] *= this.drag; v[i * 3 + 2] *= this.drag;
      v[i * 3 + 1] += this.grav * dt;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// Skid marks as a growing line strip (per rear wheel).
export class SkidMarks {
  constructor(scene, max = 4000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7 });
    this.mesh = new THREE.LineSegments(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.count = 0;
    this.lastL = null; this.lastR = null;
  }
  addPair(lx, lz, rx, rz, y) {
    if (this.count >= this.max - 4) { this.count = 0; } // wrap
    if (this.lastL) {
      this._seg(this.lastL[0], y, this.lastL[1], lx, y, lz);
      this._seg(this.lastR[0], y, this.lastR[1], rx, y, rz);
    }
    this.lastL = [lx, lz]; this.lastR = [rx, rz];
  }
  break() { this.lastL = null; this.lastR = null; }
  _seg(x0, y0, z0, x1, y1, z1) {
    const i = this.count * 3;
    if (i + 5 >= this.pos.length) return;
    this.pos[i] = x0; this.pos[i + 1] = y0 + 0.02; this.pos[i + 2] = z0;
    this.pos[i + 3] = x1; this.pos[i + 4] = y1 + 0.02; this.pos[i + 5] = z1;
    this.count += 2;
    this.geo.setDrawRange(0, this.count);
    this.geo.attributes.position.needsUpdate = true;
  }
}

// Rain: falling line streaks that recycle around the camera.
export class Rain {
  constructor(scene, count = 2500) {
    this.count = count;
    this.pos = new Float32Array(count * 6); // pairs (line segments)
    this.vy = -180;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo = geo;
    this.mat = new THREE.LineBasicMaterial({ color: 0xaaccff, transparent: true, opacity: 0.35 });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.origins = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this._respawn(i, true);
  }
  _respawn(i, initial) {
    const x = (Math.random() - 0.5) * 220;
    const y = initial ? Math.random() * 120 : 80 + Math.random() * 40;
    const z = (Math.random() - 0.5) * 220;
    this.origins[i * 3] = x; this.origins[i * 3 + 1] = y; this.origins[i * 3 + 2] = z;
  }
  setVisible(v) { this.mesh.visible = v; }
  update(dt, camPos) {
    if (!this.mesh.visible) return;
    const o = this.origins, p = this.pos;
    for (let i = 0; i < this.count; i++) {
      o[i * 3 + 1] += this.vy * dt;
      if (o[i * 3 + 1] < 0) { this._respawn(i, false); o[i * 3] += camPos.x; o[i * 3 + 2] += camPos.z; }
      const wx = o[i * 3], wy = o[i * 3 + 1], wz = o[i * 3 + 2];
      // wrap around camera
      let x = wx, z = wz;
      x = camPos.x + (((wx - camPos.x + 110) % 220 + 220) % 220 - 110);
      z = camPos.z + (((wz - camPos.z + 110) % 220 + 220) % 220 - 110);
      const j = i * 6;
      p[j] = x; p[j + 1] = wy; p[j + 2] = z;
      p[j + 3] = x + 0.3; p[j + 4] = wy - 2.4; p[j + 5] = z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}
