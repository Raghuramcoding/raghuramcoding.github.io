import * as THREE from 'three';

// ---- Road network: a big loop connecting 3 biomes + connector shortcuts ----
// Coordinate note: XZ plane is ground, +Y up. Path in world units (meters-ish).
// Biomes: Festival Coast (south, +Z), Mountain Pass (west, -X, elevated), City Center (east, +X).

export const ROAD_WIDTH = 14;

// Control points for the main loop (Catmull-Rom, closed). Y encodes elevation.
const CTRL = [
  [0, 0, 260],      // coast center
  [140, 0, 220],    // coast->city sweep
  [260, 2, 120],    // approaching city
  [300, 3, 0],      // city entrance
  [300, 4, -140],   // city north
  [200, 8, -240],   // city->mountain link, rising
  [40, 26, -260],   // mountain base
  [-120, 60, -200], // mountain hairpin 1 (high)
  [-220, 78, -60],  // mountain peak area
  [-240, 70, 90],   // mountain descent
  [-160, 34, 200],  // descending toward coast
  [-40, 6, 250],    // back near coast
];

export const roadCurve = new THREE.CatmullRomCurve3(
  CTRL.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
  true,
  'catmullrom',
  0.5
);

// ---- Connector / shortcut roads (open-world network) ----
// Each is an OPEN Catmull-Rom curve linking two zones directly across the map.
// 1) Coast -> City diagonal shortcut (skips the long coast sweep)
// 2) City -> Mountain direct link (across the middle)
// 3) Mountain -> Coast descent shortcut
const CONNECTORS = [
  {
    name: 'coast-city',
    pts: [
      [0, 0, 258], [70, 1, 170], [150, 2, 70], [240, 3, -10], [300, 3.5, -60],
    ],
  },
  {
    name: 'city-mountain',
    pts: [
      [300, 3.5, -70], [180, 10, -110], [40, 30, -120], [-90, 55, -110], [-180, 72, -70],
    ],
  },
  {
    name: 'mountain-coast',
    pts: [
      [-200, 72, 40], [-140, 44, 130], [-70, 18, 200], [0, 4, 250],
    ],
  },
];

export const connectorCurves = CONNECTORS.map(
  (c) => new THREE.CatmullRomCurve3(c.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.5)
);
export const connectorMeta = CONNECTORS;

// Sample points/frames along the main loop for placement & AI.
export function sampleRoad(n) {
  const pts = [], tangents = [], normals = [];
  for (let i = 0; i < n; i++) {
    const u = i / n;
    pts.push(roadCurve.getPointAt(u));
    tangents.push(roadCurve.getTangentAt(u).normalize());
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    normals.push(new THREE.Vector3().crossVectors(tangents[i], up).normalize());
  }
  return { pts, tangents, normals };
}

// Sample a connector curve (open) into world-space polyline for minimap + collision-free placement.
export function sampleConnectors(n) {
  return connectorCurves.map((curve) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(curve.getPointAt(i / n));
    return pts;
  });
}

// Zone of a world position (for minimap color + biome checks).
export function zoneAt(x, z) {
  if (x > 120) return 'city';
  if (x < -60) return 'mountain';
  return 'coast';
}

// Height of terrain / road approx at param (used for ground placement).
function roadFrameArray(curve, segments, closed) {
  const arr = [];
  const upto = closed ? segments : segments;
  for (let i = 0; i <= upto; i++) {
    const u = closed ? (i % segments) / segments : i / segments;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).normalize();
    const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
    arr.push({ p, t, n });
  }
  return arr;
}

export function buildWorld(scene, envMap) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = []; // {x,z,r} static circle colliders (solid, non-destructible)
  const disposables = [];

  // Destructible registries. Each entry references an InstancedMesh + instance index.
  // trees: { im:[trunkIM, leafIM], idx, x, z, y, s, ry, r, alive, kind }
  const destructibleTrees = [];
  const destructibleBarriers = []; // { im, idx, x, y, z, ry, r, alive }

  // ---------- Ground / biome tiles ----------
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3f7d4a, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  group.add(ground);

  // Coast sand patch (south).
  const sand = new THREE.Mesh(new THREE.CircleGeometry(360, 40), new THREE.MeshStandardMaterial({ color: 0xe9d8a6, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.03, 300);
  sand.receiveShadow = true;
  group.add(sand);

  // Ocean shader plane (animated waves).
  const oceanMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      time: { value: 0 },
      colA: { value: new THREE.Color(0x0a5aa0) },
      colB: { value: new THREE.Color(0x2ba7d8) },
    },
    vertexShader: `
      uniform float time; varying float vH; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        float w = sin(p.x*0.02 + time*1.2)*1.2 + cos(p.y*0.03 + time*0.9)*1.0;
        p.z += w; vH = w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 colA; uniform vec3 colB; varying float vH; varying vec2 vUv;
      void main(){
        float f = smoothstep(-1.5,1.5,vH);
        vec3 c = mix(colA, colB, f);
        c += pow(f, 6.0)*0.4;
        gl_FragColor = vec4(c, 0.9);
      }
    `,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1200, 700, 80, 40), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.5, 640);
  group.add(ocean);

  // Snow ground for mountain (high area).
  const snow = new THREE.Mesh(new THREE.CircleGeometry(320, 40), new THREE.MeshStandardMaterial({ color: 0xeef4ff, roughness: 0.85 }));
  snow.rotation.x = -Math.PI / 2;
  snow.position.set(-210, 55, 30);
  snow.receiveShadow = true;
  group.add(snow);

  // City plaza (dark asphalt).
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(200, 32), new THREE.MeshStandardMaterial({ color: 0x2a2d38, roughness: 0.9 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(300, 3.0, -70);
  plaza.receiveShadow = true;
  group.add(plaza);

  // ---------- Main road ribbon ----------
  const segments = 600;
  const frames = roadFrameArray(roadCurve, segments, true);
  const halfW = ROAD_WIDTH / 2;

  function buildRibbon(fr, width, closed, yUp, dashed) {
    const rp = [], rn = [], ru = [], ri = [], lv = [];
    const hw = width / 2;
    for (let i = 0; i < fr.length; i++) {
      const f = fr[i];
      const left = f.p.clone().addScaledVector(f.n, -hw); left.y += yUp;
      const right = f.p.clone().addScaledVector(f.n, hw); right.y += yUp;
      rp.push(left.x, left.y, left.z, right.x, right.y, right.z);
      rn.push(0, 1, 0, 0, 1, 0);
      const v = i / 6; ru.push(0, v, 1, v);
      if (dashed && i % 6 < 3) {
        const c0 = f.p.clone(); c0.y += yUp + 0.01; c0.addScaledVector(f.n, -0.25);
        const c1 = f.p.clone(); c1.y += yUp + 0.01; c1.addScaledVector(f.n, 0.25);
        lv.push(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z);
      }
    }
    const count = fr.length - 1;
    for (let i = 0; i < count; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      ri.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(rn, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
    geo.setIndex(ri);
    return { geo, lineVerts: lv };
  }

  const mainRibbon = buildRibbon(frames, ROAD_WIDTH, true, 0.06, true);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.7, metalness: 0.0 });
  const road = new THREE.Mesh(mainRibbon.geo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(mainRibbon.lineVerts, 3));
  const centerLine = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xf5c542 }));
  group.add(centerLine);

  // ---------- Connector roads (open-world shortcuts) ----------
  const connectorFrames = [];
  {
    const connMat = new THREE.MeshStandardMaterial({ color: 0x272a33, roughness: 0.75, metalness: 0.0 });
    connectorCurves.forEach((curve) => {
      const fr = roadFrameArray(curve, 180, false);
      connectorFrames.push(fr);
      const ribbon = buildRibbon(fr, ROAD_WIDTH - 2, false, 0.05, true);
      const m = new THREE.Mesh(ribbon.geo, connMat);
      m.receiveShadow = true;
      group.add(m);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(ribbon.lineVerts, 3));
      group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.7 })));
    });
  }

  // ---------- InstancedMesh helper ----------
  const dummy = new THREE.Object3D();
  function makeInstanced(geo, mat, transforms, castShadow = true) {
    const im = new THREE.InstancedMesh(geo, mat, transforms.length);
    im.castShadow = castShadow;
    im.receiveShadow = false;
    transforms.forEach((tr, i) => {
      dummy.position.set(tr.x, tr.y, tr.z);
      dummy.rotation.set(tr.rx || 0, tr.ry || 0, tr.rz || 0);
      dummy.scale.set(tr.s || 1, tr.sy || tr.s || 1, tr.s || 1);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      if (tr.color) im.setColorAt(i, new THREE.Color(tr.color));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
    disposables.push(geo, mat);
    return im;
  }

  // is a point near ANY road (main or connectors) — avoid placing props on road
  function nearRoad(x, z, dist) {
    const d2 = dist * dist;
    for (let i = 0; i < frames.length; i += 4) {
      const f = frames[i];
      const dx = f.p.x - x, dz = f.p.z - z;
      if (dx * dx + dz * dz < d2) return true;
    }
    for (const fr of connectorFrames) {
      for (let i = 0; i < fr.length; i += 3) {
        const f = fr[i];
        const dx = f.p.x - x, dz = f.p.z - z;
        if (dx * dx + dz * dz < d2) return true;
      }
    }
    return false;
  }

  // ---------- Palm trees (coast) — DESTRUCTIBLE, denser ----------
  {
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 6, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
    const leafGeo = new THREE.ConeGeometry(3.2, 1.6, 6);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2fa84f, roughness: 0.9 });
    const trunks = [], leaves = [], meta = [];
    for (let i = 0; i < 220; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 110 + Math.random() * 250;
      const x = Math.cos(ang) * rad;
      const z = 300 + Math.sin(ang) * rad * 0.7;
      if (z > 560) continue;
      if (nearRoad(x, z, 11)) continue;
      const s = 0.8 + Math.random() * 0.6;
      const ry = Math.random() * 6;
      trunks.push({ x, y: 3 * s, z, s: 1, sy: s, ry });
      leaves.push({ x, y: 6 * s, z, s });
      meta.push({ x, z, s, ry });
    }
    const trunkIM = makeInstanced(trunkGeo, trunkMat, trunks);
    const leafIM = makeInstanced(leafGeo, leafMat, leaves);
    meta.forEach((m, idx) => destructibleTrees.push({
      trunkIM, leafIM, idx, kind: 'palm', x: m.x, z: m.z, y: 0, s: m.s, ry: m.ry, r: 1.2, alive: true,
      trunkColor: 0x7a5230, leafColor: 0x2fa84f,
    }));
  }

  // ---------- Pine trees (mountain) — DESTRUCTIBLE, denser ----------
  {
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 3, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4327, roughness: 1 });
    const coneGeo = new THREE.ConeGeometry(2.4, 6, 7);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x1e5e3a, roughness: 0.95 });
    const trunks = [], cones = [], meta = [];
    for (let i = 0; i < 340; i++) {
      const u = Math.random();
      const uu = 0.48 + u * 0.42; // mountain portion of loop
      const f = frames[Math.floor(uu * segments) % segments];
      const side = (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 55);
      const x = f.p.x + f.n.x * side + (Math.random() - 0.5) * 24;
      const z = f.p.z + f.n.z * side + (Math.random() - 0.5) * 24;
      const y = f.p.y;
      if (nearRoad(x, z, 9)) continue;
      const s = 0.9 + Math.random() * 0.8;
      const ry = Math.random() * 6;
      trunks.push({ x, y: y + 1.5 * s, z, s: 1, sy: s, ry });
      cones.push({ x, y: y + 4.5 * s, z, s });
      meta.push({ x, y, z, s, ry });
    }
    const trunkIM = makeInstanced(trunkGeo, trunkMat, trunks);
    const leafIM = makeInstanced(coneGeo, coneMat, cones);
    meta.forEach((m, idx) => destructibleTrees.push({
      trunkIM, leafIM, idx, kind: 'pine', x: m.x, z: m.z, y: m.y, s: m.s, ry: m.ry, r: 1.5, alive: true,
      trunkColor: 0x5c4327, leafColor: 0x1e5e3a,
    }));
  }

  // ---------- Snowy peaks (big cones) ----------
  {
    const geo = new THREE.ConeGeometry(70, 160, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xcdd8ea, roughness: 1, flatShading: true });
    const peaks = [
      { x: -320, y: 60, z: -120, s: 1.4 },
      { x: -380, y: 40, z: 80, s: 1.1 },
      { x: -260, y: 90, z: -220, s: 1.0 },
      { x: -420, y: 30, z: -30, s: 1.3 },
      { x: -360, y: 55, z: 180, s: 1.15 },
      { x: -300, y: 75, z: -300, s: 1.25 },
    ];
    makeInstanced(geo, mat, peaks, false);
  }

  // ---------- City skyscrapers (instanced boxes w/ emissive windows) — denser ----------
  const cityWindowMat = new THREE.MeshStandardMaterial({
    color: 0x1a2030, roughness: 0.4, metalness: 0.3,
    emissive: 0x223, emissiveIntensity: 0.0,
  });
  let cityLights = null;
  {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const wc = document.createElement('canvas'); wc.width = 64; wc.height = 128;
    const wx = wc.getContext('2d');
    wx.fillStyle = '#0c1020'; wx.fillRect(0, 0, 64, 128);
    for (let y = 4; y < 124; y += 10) for (let x = 4; x < 60; x += 10) {
      wx.fillStyle = Math.random() < 0.6 ? '#0e1424' : (['#ffd27f','#8fdcff','#ff8fb0','#c9a0ff'][(Math.random()*4)|0]);
      wx.fillRect(x, y, 6, 7);
    }
    const wtex = new THREE.CanvasTexture(wc);
    wtex.wrapS = wtex.wrapT = THREE.RepeatWrapping;
    const bMat = new THREE.MeshStandardMaterial({ map: wtex, emissiveMap: wtex, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.5, metalness: 0.2, color: 0x30384a });
    cityLights = bMat;
    const towers = [];
    const cx0 = 300, cz0 = -70;
    for (let gx = -5; gx <= 5; gx++) {
      for (let gz = -5; gz <= 5; gz++) {
        const x = cx0 + gx * 34 + (Math.random() - 0.5) * 8;
        const z = cz0 + gz * 34 + (Math.random() - 0.5) * 8;
        if (nearRoad(x, z, 12)) continue;
        const h = 26 + Math.random() * 100;
        const w = 12 + Math.random() * 11;
        towers.push({ x, y: h / 2 + 3, z, s: w, sy: h });
        colliders.push({ x, z, r: w * 0.7 });
      }
    }
    const im = new THREE.InstancedMesh(geo, bMat, towers.length);
    im.castShadow = true; im.receiveShadow = true;
    towers.forEach((t, i) => {
      dummy.position.set(t.x, t.y, t.z);
      dummy.scale.set(t.s, t.sy, t.s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    group.add(im);
  }

  // ---------- City neon signs + street furniture (instanced) ----------
  let neonMat = null;
  {
    // Neon billboards: emissive thin boxes on building faces.
    const neonGeo = new THREE.BoxGeometry(6, 3, 0.4);
    neonMat = new THREE.MeshStandardMaterial({ color: 0x111318, emissive: 0xff3ea5, emissiveIntensity: 0.0, roughness: 0.4 });
    const neonMat2 = new THREE.MeshStandardMaterial({ color: 0x111318, emissive: 0x22e0ff, emissiveIntensity: 0.0, roughness: 0.4 });
    const signsA = [], signsB = [];
    const cx0 = 300, cz0 = -70;
    for (let i = 0; i < 40; i++) {
      const x = cx0 + (Math.random() - 0.5) * 300;
      const z = cz0 + (Math.random() - 0.5) * 300;
      if (nearRoad(x, z, 10)) continue;
      const y = 8 + Math.random() * 40;
      const ry = Math.random() * Math.PI;
      (i % 2 ? signsB : signsA).push({ x, y, z, ry });
    }
    makeInstanced(neonGeo, neonMat, signsA, false);
    makeInstanced(neonGeo, neonMat2, signsB, false);

    // Street furniture: benches/trash boxes/planters around city plaza
    const furnGeo = new THREE.BoxGeometry(1.6, 1.0, 0.9);
    const furnMat = new THREE.MeshStandardMaterial({ color: 0x384250, roughness: 0.8 });
    const furn = [];
    for (let i = 0; i < 60; i++) {
      const x = cx0 + (Math.random() - 0.5) * 320;
      const z = cz0 + (Math.random() - 0.5) * 320;
      if (nearRoad(x, z, 9) || nearRoad(x, z, 0.1)) continue;
      furn.push({ x, y: 0.5 + 3, z, ry: Math.random() * Math.PI });
    }
    makeInstanced(furnGeo, furnMat, furn);
  }

  // ---------- Festival props: bunting posts + beach umbrellas + festival stalls (coast) ----------
  {
    // Beach umbrellas (colorful cones on poles)
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 3, 5);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.8 });
    const canGeo = new THREE.ConeGeometry(2.2, 1.4, 8);
    const umbrellaCols = [0xff4d6d, 0xffd23f, 0x22c1c3, 0xa06cd5, 0xff8c42];
    const poles = [], cans = [];
    for (let i = 0; i < 80; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 60 + Math.random() * 200;
      const x = Math.cos(ang) * rad;
      const z = 300 + Math.sin(ang) * rad * 0.7;
      if (z > 540 || nearRoad(x, z, 10)) continue;
      poles.push({ x, y: 1.5, z });
      cans.push({ x, y: 3.1, z, color: umbrellaCols[i % umbrellaCols.length] });
    }
    makeInstanced(poleGeo, poleMat, poles);
    const canMat = new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: false });
    // per-instance colors need instanceColor; makeInstanced sets it if tr.color present
    makeInstanced(canGeo, canMat, cans);

    // Festival stalls (striped boxes)
    const stallGeo = new THREE.BoxGeometry(4, 3, 3);
    const stallMat = new THREE.MeshStandardMaterial({ color: 0xff6b9d, roughness: 0.7, emissive: 0x331122, emissiveIntensity: 0.2 });
    const stalls = [];
    for (let i = 0; i < 24; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 90 + Math.random() * 160;
      const x = Math.cos(ang) * rad;
      const z = 300 + Math.sin(ang) * rad * 0.7;
      if (z > 520 || nearRoad(x, z, 12)) continue;
      stalls.push({ x, y: 1.5, z, ry: Math.random() * Math.PI });
      colliders.push({ x, z, r: 2.2 });
    }
    makeInstanced(stallGeo, stallMat, stalls);
  }

  // ---------- Festival arches over the road (coast) ----------
  {
    const postGeo = new THREE.CylinderGeometry(0.5, 0.5, 12, 8);
    const barGeo = new THREE.BoxGeometry(ROAD_WIDTH + 6, 1.2, 1.2);
    const archMat = new THREE.MeshStandardMaterial({ color: 0xff4d94, roughness: 0.5, emissive: 0x551133, emissiveIntensity: 0.3 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.4, emissive: 0x114455, emissiveIntensity: 0.4 });
    const posts = [], bars = [];
    const params = [0.95, 0.0, 0.05];
    params.forEach((u) => {
      const f = frames[Math.floor(u * segments) % segments];
      const lx = f.p.x + f.n.x * (halfW + 3), lz = f.p.z + f.n.z * (halfW + 3);
      const rx = f.p.x - f.n.x * (halfW + 3), rz = f.p.z - f.n.z * (halfW + 3);
      posts.push({ x: lx, y: 6 + f.p.y, z: lz });
      posts.push({ x: rx, y: 6 + f.p.y, z: rz });
      const ry = Math.atan2(f.t.x, f.t.z);
      bars.push({ x: f.p.x, y: 12 + f.p.y, z: f.p.z, ry });
    });
    makeInstanced(postGeo, archMat, posts);
    makeInstanced(barGeo, barMat, bars);
  }

  // ---------- Crash barriers (mountain, red-white striped) — DESTRUCTIBLE, denser ----------
  {
    const geo = new THREE.BoxGeometry(2.4, 1.0, 0.4);
    const texC = document.createElement('canvas'); texC.width = 64; texC.height = 16;
    const tc = texC.getContext('2d');
    for (let i = 0; i < 8; i++) { tc.fillStyle = i % 2 ? '#e03030' : '#f5f5f5'; tc.fillRect(i * 8, 0, 8, 16); }
    const btex = new THREE.CanvasTexture(texC);
    const mat = new THREE.MeshStandardMaterial({ map: btex, roughness: 0.6 });
    const bars = [], meta = [];
    for (let i = 0; i < segments; i += 4) {
      const u = i / segments;
      if (u < 0.46 || u > 0.92) continue; // mountain span only
      const f = frames[i];
      for (const side of [-1, 1]) {
        const px = f.p.x + f.n.x * (halfW + 1.2) * side;
        const pz = f.p.z + f.n.z * (halfW + 1.2) * side;
        const ry = Math.atan2(f.t.x, f.t.z);
        bars.push({ x: px, y: f.p.y + 0.5, z: pz, ry });
        meta.push({ x: px, y: f.p.y + 0.5, z: pz, ry });
      }
    }
    const barrierIM = makeInstanced(geo, mat, bars);
    barrierIM.__barrierTex = btex;
    meta.forEach((m, idx) => destructibleBarriers.push({
      im: barrierIM, idx, x: m.x, y: m.y, z: m.z, ry: m.ry, r: 0.8, alive: true, tex: btex,
    }));
  }

  // ---------- Ramp jumps (city) ----------
  const ramps = [];
  {
    const geo = new THREE.BoxGeometry(ROAD_WIDTH, 3, 10);
    const mat = new THREE.MeshStandardMaterial({ color: 0x394150, roughness: 0.7, metalness: 0.2 });
    const rampParams = [0.36, 0.42];
    rampParams.forEach((u) => {
      const f = frames[Math.floor(u * segments) % segments];
      const ry = Math.atan2(f.t.x, f.t.z);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(f.p.x, f.p.y + 0.5, f.p.z);
      m.rotation.set(-0.22, ry, 0);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
      ramps.push({ x: f.p.x, z: f.p.z, r: 8 });
    });
  }

  // ---------- Filler terrain detail: rocks, bushes, grass patches between zones ----------
  {
    // Rocks (icosahedron, gray) scattered everywhere off-road, denser near mountain
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d7f86, roughness: 1, flatShading: true });
    const rocks = [];
    for (let i = 0; i < 400; i++) {
      const x = (Math.random() - 0.5) * 900;
      const z = 100 + (Math.random() - 0.5) * 900;
      if (nearRoad(x, z, 8)) continue;
      const y = zoneAt(x, z) === 'mountain' ? mountainYAt(x, z, frames, segments) : (zoneAt(x, z) === 'city' ? 3 : 0);
      const s = 0.6 + Math.random() * 2.2;
      rocks.push({ x, y: y + s * 0.4, z, s, sy: s * (0.7 + Math.random() * 0.5), ry: Math.random() * 6, rx: Math.random() * 0.4, rz: Math.random() * 0.4 });
      if (s > 1.6) colliders.push({ x, z, r: s * 0.6 }); // big rocks solid
    }
    makeInstanced(rockGeo, rockMat, rocks);

    // Bushes (green dodecahedron) — coast + between zones
    const bushGeo = new THREE.DodecahedronGeometry(1, 0);
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x3c7d3f, roughness: 0.95, flatShading: true });
    const bushes = [];
    for (let i = 0; i < 500; i++) {
      const x = (Math.random() - 0.5) * 900;
      const z = 120 + (Math.random() - 0.5) * 850;
      if (nearRoad(x, z, 7)) continue;
      const zone = zoneAt(x, z);
      if (zone === 'city') continue; // no bushes downtown
      const y = zone === 'mountain' ? mountainYAt(x, z, frames, segments) : 0;
      const s = 0.7 + Math.random() * 1.4;
      bushes.push({ x, y: y + s * 0.5, z, s, sy: s * 0.7, ry: Math.random() * 6 });
    }
    makeInstanced(bushGeo, bushMat, bushes);

    // Grass patches (flat low cones, subtle) — coast & fields
    const grassGeo = new THREE.ConeGeometry(1.4, 0.5, 5);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4f9c53, roughness: 1 });
    const grass = [];
    for (let i = 0; i < 700; i++) {
      const x = (Math.random() - 0.5) * 800;
      const z = 140 + (Math.random() - 0.5) * 800;
      if (nearRoad(x, z, 6)) continue;
      const zone = zoneAt(x, z);
      if (zone === 'city') continue;
      const y = zone === 'mountain' ? mountainYAt(x, z, frames, segments) : 0;
      grass.push({ x, y: y + 0.2, z, s: 0.7 + Math.random() * 1.2, ry: Math.random() * 6 });
    }
    makeInstanced(grassGeo, grassMat, grass, false);
  }

  // ---------- Street lights (city + some coast) ----------
  const streetLightNodes = [];
  {
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.25, 8, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
    const headGeo = new THREE.SphereGeometry(0.5, 8, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffe6a0, emissive: 0xffcc55, emissiveIntensity: 0.0 });
    const poles = [], heads = [];
    for (let i = 0; i < segments; i += 8) {
      const u = i / segments;
      if (u > 0.05 && u < 0.42) { /* city+coast east span */ } else continue;
      const f = frames[i];
      const side = (i % 16 === 0) ? 1 : -1;
      const px = f.p.x + f.n.x * (halfW + 2) * side;
      const pz = f.p.z + f.n.z * (halfW + 2) * side;
      poles.push({ x: px, y: f.p.y + 4, z: pz });
      heads.push({ x: px, y: f.p.y + 8, z: pz });
      streetLightNodes.push({ x: px, y: f.p.y + 8, z: pz });
    }
    makeInstanced(poleGeo, poleMat, poles);
    makeInstanced(headGeo, headMat, heads, false);
    streetLightHeadMat = headMat;
  }

  // ---------- Ferris wheel landmark (coast) ----------
  {
    const wheelGroup = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xff2e63, emissive: 0x551122, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.5 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(22, 0.8, 8, 40), ringMat);
    ring.position.y = 26;
    wheelGroup.add(ring);
    // Spokes and cabs as InstancedMesh children (rotate with the group, 2 draw calls instead of 24)
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x114455, emissiveIntensity: 0.4 });
    const spokeIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.15, 44, 6), spokeMat, 12);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0xffd27f, emissive: 0x332200, emissiveIntensity: 0.3 });
    const cabIM = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), cabMat, 12);
    const _m = new THREE.Matrix4();
    const _q = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      _e.set(0, 0, a); _q.setFromEuler(_e);
      _m.compose(new THREE.Vector3(0, 26, 0), _q, _s);
      spokeIM.setMatrixAt(i, _m);
      _q.identity();
      _m.compose(new THREE.Vector3(Math.cos(a) * 22, 26 + Math.sin(a) * 22, 0), _q, _s);
      cabIM.setMatrixAt(i, _m);
    }
    spokeIM.instanceMatrix.needsUpdate = true;
    cabIM.instanceMatrix.needsUpdate = true;
    wheelGroup.add(spokeIM);
    wheelGroup.add(cabIM);
    const support = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 26, 8), new THREE.MeshStandardMaterial({ color: 0x555 }));
    support.position.y = 13;
    wheelGroup.add(support);
    wheelGroup.position.set(90, 0, 340);
    group.add(wheelGroup);
    ferrisWheel = wheelGroup;
    colliders.push({ x: 90, z: 340, r: 4 });
  }

  return {
    group, road, ocean, oceanMat, colliders, ramps,
    cityWindowMat: cityLights, streetLightNodes,
    destructibleTrees, destructibleBarriers,
    getStreetHeadMat: () => streetLightHeadMat,
    getNeonMat: () => neonMat,
    getFerris: () => ferrisWheel,
    frames, connectorFrames,
    dispose() { disposables.forEach((d) => d.dispose && d.dispose()); },
  };
}

// Approximate mountain-zone ground height by nearest road frame y.
function mountainYAt(x, z, frames, segments) {
  let best = 1e9, by = 0;
  for (let i = 0; i < frames.length; i += 3) {
    const f = frames[i];
    const dx = f.p.x - x, dz = f.p.z - z; const d = dx * dx + dz * dz;
    if (d < best) { best = d; by = f.p.y; }
  }
  return Math.max(0, by - 2);
}

let streetLightHeadMat = null;
let ferrisWheel = null;
