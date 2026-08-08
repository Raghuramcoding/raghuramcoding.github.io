import * as THREE from 'three';

// Build a stylized sleek sports car from primitives.
// Returns { group, wheels:[fl,fr,rl,rr], headlights:[], taillightMat, bodyMat }
export function buildCar(color, envMap, isPlayer = false) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.9,
    roughness: 0.28,
    clearcoat: 1.0,
    clearcoatRoughness: 0.15,
    envMap,
    envMapIntensity: 1.4,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x111820, metalness: 0.2, roughness: 0.05, transmission: 0.0,
    envMap, envMapIntensity: 1.2, clearcoat: 1,
  });

  // Lower body
  const lower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 4.4), bodyMat);
  lower.position.y = 0.55; lower.castShadow = true;
  group.add(lower);
  // Wedge front (scaled box)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 1.4), bodyMat);
  nose.position.set(0, 0.5, 1.9); nose.castShadow = true;
  group.add(nose);
  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), glassMat);
  cabin.position.set(0, 1.05, -0.1); cabin.castShadow = true;
  group.add(cabin);
  // Roof accent
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.15, 1.6), bodyMat);
  roof.position.set(0, 1.35, -0.15); roof.castShadow = true;
  group.add(roof);
  // Spoiler
  const spoilerBar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.5), bodyMat);
  spoilerBar.position.set(0, 1.05, -2.2); spoilerBar.castShadow = true;
  group.add(spoilerBar);
  for (const sx of [-0.8, 0.8]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.2), bodyMat);
    stand.position.set(sx, 0.85, -2.2);
    group.add(stand);
  }

  // Headlights (emissive)
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 1.2 });
  const headlights = [];
  for (const hx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    hl.position.set(hx, 0.6, 2.55);
    group.add(hl);
    headlights.push(hl);
  }
  // Taillights
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0xff2233, emissiveIntensity: 1.0 });
  for (const tx of [-0.7, 0.7]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.1), tailMat);
    tl.position.set(tx, 0.65, -2.25);
    group.add(tl);
  }

  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 1, roughness: 0.3, envMap });
  const wheels = [];
  const wpos = [[-1.0, -1.5], [1.0, -1.5], [-1.0, 1.5], [1.0, 1.5]]; // rl, rr, fl, fr in x,z
  // order: FL, FR, RL, RR
  const order = [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]];
  for (const [wx, wz] of order) {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, wheelMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wg.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.42, 8), rimMat);
    rim.rotation.z = Math.PI / 2;
    wg.add(rim);
    wg.position.set(wx, 0.5, wz);
    group.add(wg);
    wheels.push(wg);
  }

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // Real spotlights for player headlights at night
  let headSpots = [];
  if (isPlayer) {
    for (const hx of [-0.6, 0.6]) {
      const sp = new THREE.SpotLight(0xfff2cc, 0, 60, Math.PI / 5, 0.4, 1.2);
      sp.position.set(hx, 0.7, 2.4);
      const tgt = new THREE.Object3D();
      tgt.position.set(hx, 0.2, 18);
      group.add(tgt);
      sp.target = tgt;
      group.add(sp);
      headSpots.push(sp);
    }
  }

  return { group, wheels, headlights, headMat, tailMat, bodyMat, headSpots };
}
