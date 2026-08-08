import * as THREE from 'three';

// Pool of reusable "falling" meshes used when a destructible instance is smashed.
// Instanced trees/barriers hide the impacted instance (zero its matrix) and we
// spawn a dynamic mesh here that animates a satisfying fall/tumble, then fades.

const ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

// Hide an instance from an InstancedMesh by zeroing its matrix.
function hideInstance(im, idx) {
  im.setMatrixAt(idx, ZERO_MATRIX);
  im.instanceMatrix.needsUpdate = true;
}

// ---- Falling TREE meshes (trunk + foliage) ----
class TreeFall {
  constructor() {
    this.group = new THREE.Group();
    this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
    this.leafMat = new THREE.MeshStandardMaterial({ color: 0x2fa84f, roughness: 0.9 });
    // Trunk pivots around its base: build geometry offset so base is at group origin.
    this.trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 6, 6), this.trunkMat);
    this.trunk.geometry.translate(0, 3, 0); // base at y=0
    this.trunk.castShadow = true;
    this.leaf = new THREE.Mesh(new THREE.ConeGeometry(3.0, 3.0, 7), this.leafMat);
    this.leaf.castShadow = true;
    this.group.add(this.trunk, this.leaf);
    this.group.visible = false;
    this.active = false;
  }
  spawn(entry, dirX, dirZ) {
    const g = this.group;
    g.visible = true; this.active = true;
    g.position.set(entry.x, entry.y, entry.z);
    g.rotation.set(0, entry.ry || 0, 0);
    g.scale.setScalar(entry.s || 1);
    // configure per-kind visuals
    if (entry.kind === 'palm') {
      this.trunk.geometry.dispose();
      this.trunk.geometry = new THREE.CylinderGeometry(0.25, 0.4, 6, 6); this.trunk.geometry.translate(0, 3, 0);
      this.leaf.geometry.dispose();
      this.leaf.geometry = new THREE.ConeGeometry(3.2, 1.6, 6); this.leaf.position.y = 6;
    } else {
      this.trunk.geometry.dispose();
      this.trunk.geometry = new THREE.CylinderGeometry(0.3, 0.5, 3, 5); this.trunk.geometry.translate(0, 1.5, 0);
      this.leaf.geometry.dispose();
      this.leaf.geometry = new THREE.ConeGeometry(2.4, 6, 7); this.leaf.position.y = 4.5;
    }
    this.trunkMat.color.set(entry.trunkColor);
    this.leafMat.color.set(entry.leafColor);
    this.trunkMat.opacity = 1; this.trunkMat.transparent = false;
    this.leafMat.opacity = 1; this.leafMat.transparent = false;
    // topple axis: horizontal axis perpendicular to fall direction
    const len = Math.hypot(dirX, dirZ) || 1;
    this.axis = new THREE.Vector3(dirZ / len, 0, -dirX / len); // rotate around this to fall toward dir
    this.fallAngle = 0;
    this.angVel = 2.2 + Math.random() * 0.8; // rad/s toward ground
    this.t = 0;
    this.bounced = false;
    this.state = 'falling'; // falling -> resting -> sinking
    this.restTimer = 0;
    this.baseQuat = g.quaternion.clone();
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const g = this.group;
    if (this.state === 'falling') {
      this.fallAngle += this.angVel * dt;
      if (this.fallAngle >= Math.PI / 2) {
        this.fallAngle = Math.PI / 2;
        if (!this.bounced) {
          // small bounce back up
          this.bounced = true;
          this.angVel = -0.9;
        } else {
          this.state = 'resting';
          this.restTimer = 8.5;
          this.angVel = 0;
        }
      }
      if (this.bounced && this.fallAngle < Math.PI / 2 - 0.12) {
        // settle back down
        this.angVel = 3.0;
      }
      const q = new THREE.Quaternion().setFromAxisAngle(this.axis, this.fallAngle);
      g.quaternion.copy(q).multiply(this.baseQuat);
    } else if (this.state === 'resting') {
      this.restTimer -= dt;
      if (this.restTimer <= 0) { this.state = 'sinking'; this.trunkMat.transparent = true; this.leafMat.transparent = true; }
    } else if (this.state === 'sinking') {
      g.position.y -= dt * 1.2;
      this.trunkMat.opacity = Math.max(0, this.trunkMat.opacity - dt * 0.5);
      this.leafMat.opacity = Math.max(0, this.leafMat.opacity - dt * 0.5);
      if (this.trunkMat.opacity <= 0.01) { this.release(); }
    }
  }
  release() { this.active = false; this.group.visible = false; }
}

// ---- Flying BARRIER meshes (physics tumble) ----
class BarrierFly {
  constructor(sharedTex) {
    this.mat = new THREE.MeshStandardMaterial({ map: sharedTex, roughness: 0.6 });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.4), this.mat);
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.active = false;
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
  }
  spawn(entry, dirX, dirZ, speedFactor) {
    this.mesh.visible = true; this.active = true;
    this.mesh.position.set(entry.x, entry.y, entry.z);
    this.mesh.rotation.set(0, entry.ry || 0, 0);
    const len = Math.hypot(dirX, dirZ) || 1;
    const power = 10 + speedFactor * 22;
    this.vel.set((dirX / len) * power, 9 + speedFactor * 10, (dirZ / len) * power);
    this.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    this.groundY = entry.y - 0.5;
    this.t = 0; this.state = 'flying'; this.restTimer = 0;
    this.mat.opacity = 1; this.mat.transparent = false;
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const m = this.mesh;
    if (this.state === 'flying') {
      this.vel.y -= 26 * dt; // gravity
      m.position.addScaledVector(this.vel, dt);
      m.rotation.x += this.spin.x * dt;
      m.rotation.y += this.spin.y * dt;
      m.rotation.z += this.spin.z * dt;
      if (m.position.y <= this.groundY) {
        m.position.y = this.groundY;
        // bounce with damping
        if (Math.abs(this.vel.y) > 3) {
          this.vel.y = -this.vel.y * 0.35;
          this.vel.x *= 0.6; this.vel.z *= 0.6;
          this.spin.multiplyScalar(0.5);
        } else {
          this.vel.set(0, 0, 0); this.spin.set(0, 0, 0);
          this.state = 'resting'; this.restTimer = 7.5;
        }
      }
    } else if (this.state === 'resting') {
      this.restTimer -= dt;
      if (this.restTimer <= 0) { this.state = 'fading'; this.mat.transparent = true; }
    } else if (this.state === 'fading') {
      this.mat.opacity = Math.max(0, this.mat.opacity - dt * 0.6);
      m.position.y -= dt * 0.6;
      if (this.mat.opacity <= 0.01) this.release();
    }
  }
  release() { this.active = false; this.mesh.visible = false; }
}

export class Destructibles {
  constructor(scene, barrierTex) {
    this.scene = scene;
    this.treePool = [];
    this.barrierPool = [];
    this.barrierTex = barrierTex;
    for (let i = 0; i < 6; i++) { const t = new TreeFall(); scene.add(t.group); this.treePool.push(t); }
    for (let i = 0; i < 6; i++) { const b = new BarrierFly(barrierTex); scene.add(b.mesh); this.barrierPool.push(b); }
  }
  _freeTree() { return this.treePool.find((t) => !t.active); }
  _freeBarrier() { return this.barrierPool.find((b) => !b.active); }

  smashTree(entry, dirX, dirZ) {
    if (!entry.alive) return false;
    entry.alive = false;
    // hide both instanced parts
    hideInstance(entry.trunkIM, entry.idx);
    hideInstance(entry.leafIM, entry.idx);
    const t = this._freeTree();
    if (t) t.spawn(entry, dirX, dirZ);
    return true;
  }

  launchBarrier(entry, dirX, dirZ, speedFactor) {
    if (!entry.alive) return false;
    entry.alive = false;
    hideInstance(entry.im, entry.idx);
    const b = this._freeBarrier();
    if (b) b.spawn(entry, dirX, dirZ, speedFactor);
    return true;
  }

  update(dt) {
    for (const t of this.treePool) t.update(dt);
    for (const b of this.barrierPool) b.update(dt);
  }
}
