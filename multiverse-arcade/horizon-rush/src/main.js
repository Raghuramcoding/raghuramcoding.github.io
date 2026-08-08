import * as THREE from 'three';
import { makeEnvMap, makeSky, makeStars, sampleDayNight, sunDirection } from './env.js';
import { buildWorld, roadCurve, sampleRoad, sampleConnectors, connectorCurves, zoneAt, ROAD_WIDTH } from './world.js';
import { buildCar } from './car.js';
import { GameAudio } from './audio.js';
import { ParticlePool, SkidMarks, Rain } from './effects.js';
import { Destructibles } from './destructibles.js';

// ---------------- Renderer / scene ----------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe0ff, 240, 1000);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 3000);
camera.position.set(0, 12, 280 - 20);

const envMap = makeEnvMap(renderer);
scene.environment = envMap;

// Sky + stars
const sky = makeSky(); scene.add(sky);
const stars = makeStars(); scene.add(stars);

// Lights
const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x4a6b4f, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 400;
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);
const ambient = new THREE.AmbientLight(0x334466, 0.2);
scene.add(ambient);

// World
const world = buildWorld(scene, envMap);
const roadSamples = sampleRoad(400);
const connectorSamples = sampleConnectors(120); // array of polylines for minimap + AI

// Destructibles (falling trees / flying barriers). Barrier texture shared from world.
const barrierTex = world.destructibleBarriers.length ? world.destructibleBarriers[0].tex : null;
const destructibles = new Destructibles(scene, barrierTex);
let smashStats = { trees: 0, barriers: 0 };
const SMASH_SPEED = 100 / 3.6; // 100 km/h in m/s

// ---------------- Cars ----------------
const player = buildCar(0x2e9dff, envMap, true);
scene.add(player.group);

// Player state
const P = {
  pos: new THREE.Vector3(0, 0, 258),
  vel: new THREE.Vector3(),
  heading: Math.PI,     // facing -Z initially
  speed: 0,             // signed forward speed (m/s)
  lateral: 0,           // lateral velocity for drift
  steer: 0,
  yawRate: 0,
  onGround: true,
  airY: 0, airVY: 0,
  drifting: false,
  nitro: 100,           // meter 0..100
  nitroActive: false,
  driftScore: 0,
  driftCombo: 1,
  driftActive: 0,       // current drift accumulation (banks when drift ends)
  driftTimer: 0,
  totalScore: 0,
  inCar: true,
  wheelSpin: 0,
};

// ---------------- Couch Co-op: Player 2 (Arrow keys) ----------------
// A lighter, independent arcade car — not hooked into P1's drift/nitro/
// scoring systems, to keep this additive and low-risk against the existing
// physics. Still a real, simultaneously-driveable second car on screen.
let player2 = null, P2 = null;
if (COOP) {
  player2 = buildCar(0xffd700, envMap, false);
  scene.add(player2.group);
  P2 = {
    pos: new THREE.Vector3(10, 0, 258),
    heading: Math.PI,
    speed: 0,
  };
}
function updateP2(dt) {
  const throttle = keys['arrowup'] ? 1 : 0;
  const brake = keys['arrowdown'] ? 1 : 0;
  const left = keys['arrowleft'] ? 1 : 0;
  const right = keys['arrowright'] ? 1 : 0;
  const accel = 30, maxV = MAX_SPEED * 0.9;
  if (throttle) P2.speed += accel * dt;
  else if (brake) P2.speed -= 40 * dt;
  else P2.speed -= Math.sign(P2.speed) * 9 * dt;
  P2.speed = THREE.MathUtils.clamp(P2.speed, -15, maxV);
  if (Math.abs(P2.speed) < 0.4 && !throttle && !brake) P2.speed = 0;
  const steerInput = right - left;
  const speedFactor = THREE.MathUtils.clamp(Math.abs(P2.speed) / maxV, 0, 1);
  P2.heading -= steerInput * 1.8 * speedFactor * Math.sign(P2.speed || 1) * dt;
  P2.pos.x += Math.sin(P2.heading) * P2.speed * dt;
  P2.pos.z += Math.cos(P2.heading) * P2.speed * dt;
  player2.group.position.copy(P2.pos);
  player2.group.rotation.y = P2.heading;
  if (player2.wheelSpin !== undefined) player2.wheelSpin += P2.speed * dt;
}

// On-foot character
const person = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 8), new THREE.MeshStandardMaterial({ color: 0xffcc44, roughness: 0.6 }));
  body.position.y = 0.9; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), new THREE.MeshStandardMaterial({ color: 0xf0c090 }));
  head.position.y = 1.7; head.castShadow = true;
  person.add(body, head);
}
person.visible = false;
scene.add(person);
const foot = { pos: new THREE.Vector3(), heading: Math.PI, speed: 0 };

// ---------------- Traffic ----------------
const trafficColors = [0xff5544, 0x44ff88, 0xffd844, 0xaa66ff, 0xffffff, 0x333333, 0xff8822, 0x22ddff];
const traffic = [];
const NUM_TRAFFIC = 16;
for (let i = 0; i < NUM_TRAFFIC; i++) {
  const c = buildCar(trafficColors[i % trafficColors.length], envMap, false);
  scene.add(c.group);
  // ~1/4 of cars drive the connector shortcut network instead of the main loop
  const useConnector = (i >= 4 && i % 3 === 0);
  const connIdx = useConnector ? (i % connectorCurves.length) : -1;
  traffic.push({
    car: c,
    u: i / NUM_TRAFFIC,
    speed: 0.006 + Math.random() * 0.004, // param/sec
    dir: 1,
    lane: (i % 2 === 0 ? 1 : -1) * (ROAD_WIDTH * 0.22),
    slow: 1,
    parked: false,
    onConnector: useConnector,
    connIdx,
    connDir: 1,
    pos: new THREE.Vector3(), heading: 0,
  });
}
// A couple parked cars near coast (stealable)
for (let i = 0; i < 3; i++) {
  const t = traffic[i];
  t.parked = true; t.speed = 0;
  t.u = 0.02 + i * 0.01;
}

// ---------------- Rivals ----------------
const rivalColors = [0xff2e63, 0xa855f7, 0x22d3ee, 0x37e29a, 0xffb020];
const rivals = [];
for (let i = 0; i < 5; i++) {
  const c = buildCar(rivalColors[i], envMap, false);
  c.group.visible = false;
  scene.add(c.group);
  rivals.push({ car: c, u: 0, speed: 0, lane: (i - 2) * 2.2, progress: 0, lap: 0, cp: 0, pos: new THREE.Vector3(), heading: 0, finished: false, finishTime: 0 });
}

// ---------------- Effects ----------------
const smoke = new ParticlePool(scene, 260, { color: 0xdcdcdc, size: 3.2, opacity: 0.42, grav: 3, drag: 0.94 });
const flames = new ParticlePool(scene, 120, { color: 0xff7722, size: 2.0, opacity: 0.85, grav: 0, drag: 0.9, blending: THREE.AdditiveBlending });
const skid = new SkidMarks(scene);
const rain = new Rain(scene);

// ---------------- Race checkpoints ----------------
const raceUs = [0.06, 0.20, 0.34, 0.5, 0.64, 0.78, 0.92]; // checkpoint params along loop
const checkpointRings = [];
{
  const ringGeo = new THREE.TorusGeometry(7, 0.5, 8, 24);
  raceUs.forEach((u, idx) => {
    const p = roadCurve.getPointAt(u);
    const t = roadCurve.getTangentAt(u).normalize();
    const mat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.position.copy(p); ring.position.y += 5;
    ring.lookAt(p.clone().add(t));
    ring.visible = false;
    scene.add(ring);
    checkpointRings.push({ mesh: ring, u, pos: p.clone() });
  });
}

const race = {
  active: false, countdown: 0, phase: 'idle', // idle|countdown|racing|finished
  totalCps: raceUs.length, laps: 2,
  playerCp: 0, playerLap: 0, playerProgress: 0,
  time: 0, position: 1, finishOrder: [],
};

// ---------------- Input ----------------
const keys = {};
const COOP = !!window.ARCADE_COOP; // Couch Co-op: P1=WASD only, P2=Arrow keys (set by the arcade shell before this module loads)
let paused = false;
let started = false;
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (!started) return;
  if (k === 'e') toggleCar();
  if (k === 'r') startRace();
  if (k === 'c') cycleCamera();
  if (k === 't') timeOfDay = (timeOfDay + 0.08) % 1;
  if (k === 'm') { const m = audio.toggleMute(); notify(m ? 'MUTED' : 'SOUND ON'); }
  if (k === 'p' || k === 'escape') togglePause();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// ---------------- Audio ----------------
const audio = new GameAudio();

// ---------------- Day/Night + Weather ----------------
let timeOfDay = 0.42; // start late morning
const DAY_LENGTH = 240; // seconds for full cycle
let weather = 'sunny';
let weatherT = 0;
let rainAmount = 0; // 0..1 eased

// ---------------- Camera modes ----------------
let camMode = 0; // 0 chase, 1 hood, 2 far
function cycleCamera() { camMode = (camMode + 1) % 3; notify(['CHASE CAM', 'HOOD CAM', 'CINEMATIC CAM'][camMode]); }
let camFov = 62;

// ---------------- HUD refs ----------------
const el = (id) => document.getElementById(id);
const hud = el('hud');
const speedNum = el('speed-num'), gearEl = el('gear'), nitroFill = el('nitro-fill');
const arcFill = el('arc-fill');
const driftPanel = el('drift-panel'), driftScoreEl = el('drift-score'), driftComboEl = el('drift-combo'), totalScoreEl = el('total-score');
const racePanel = el('race-panel'), racePosEl = el('race-position'), raceLapEl = el('race-lap'), raceCpEl = el('race-cp'), raceTimerEl = el('race-timer');
const notifyEl = el('notify'), countdownEl = el('countdown');
const minimap = el('minimap'), mmCtx = minimap.getContext('2d');

// arc length for stroke dash
const arcLen = arcFill.getTotalLength();
arcFill.style.strokeDasharray = arcLen;
arcFill.style.strokeDashoffset = arcLen;

let notifyTimer = 0;
function notify(text, dur = 1.6) { notifyEl.textContent = text; notifyEl.classList.add('show'); notifyTimer = dur; }

// ---------------- Debug overlay ----------------
class DebugOverlay {
  constructor(r) { this.r = r; this.el = document.createElement('div'); this.el.id = 'debug-overlay';
    this.el.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;background:rgba(0,0,0,.7);color:#0f0;font:11px/1.4 monospace;padding:5px 8px;pointer-events:none;white-space:pre;';
    document.body.appendChild(this.el); this.frames = 0; this.last = performance.now(); this.fps = 0; }
  update() { this.frames++; const now = performance.now();
    if (now - this.last >= 500) { this.fps = (this.frames * 1000) / (now - this.last); this.frames = 0; this.last = now;
      const i = this.r.info; this.el.textContent = `FPS:${this.fps.toFixed(0)}\nDraw:${i.render.calls} Tri:${i.render.triangles}\nGeo:${i.memory.geometries} Tex:${i.memory.textures}`;
    } }
}
const debug = new DebugOverlay(renderer);

// ---------------- Helpers ----------------
const _v = new THREE.Vector3();
function terrainHeight(x, z) {
  // approximate ground height by nearest road sample (biome elevation)
  // fallback flat 0; mountain elevated handled by road Y
  const zone = zoneAt(x, z);
  if (zone === 'mountain') {
    // find nearest road sample y
    let best = 1e9, by = 0;
    for (let i = 0; i < roadSamples.pts.length; i += 3) {
      const p = roadSamples.pts[i]; const dx = p.x - x, dz = p.z - z; const d = dx * dx + dz * dz;
      if (d < best) { best = d; by = p.y; }
    }
    return by;
  }
  if (zone === 'city') return 3.0;
  return 0;
}

// find nearest point param on road, returns {u, dist, lateral, y, tangent}
function roadInfo(x, z) {
  let best = 1e9, bu = 0, bi = 0;
  const pts = roadSamples.pts;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]; const dx = p.x - x, dz = p.z - z; const d = dx * dx + dz * dz;
    if (d < best) { best = d; bi = i; }
  }
  bu = bi / pts.length;
  const n = roadSamples.normals[bi];
  const p = pts[bi];
  const lateral = (x - p.x) * n.x + (z - p.z) * n.z;
  return { u: bu, dist: Math.sqrt(best), lateral, y: p.y, tangent: roadSamples.tangents[bi] };
}

// ---------------- Enter/exit car ----------------
let activeCarObj = player; // the car object the player controls (player or a stolen traffic car)
function toggleCar() {
  if (P.inCar) {
    // exit
    P.inCar = false;
    person.visible = true;
    foot.pos.copy(P.pos).add(new THREE.Vector3(Math.cos(P.heading) * 3, 0, Math.sin(P.heading) * 3));
    foot.pos.x += 3; foot.heading = P.heading;
    notify('ON FOOT');
    audio.beep(300, 0.1);
  } else {
    // find nearest car (player car or traffic)
    let nearest = null, nd = 6 * 6;
    const candidates = [{ obj: activeCarObj, isPlayer: true, pos: P.pos }];
    traffic.forEach((t) => candidates.push({ obj: t.car, traffic: t, pos: t.pos }));
    candidates.forEach((c) => {
      const dx = c.pos.x - foot.pos.x, dz = c.pos.z - foot.pos.z; const d = dx * dx + dz * dz;
      if (d < nd) { nd = d; nearest = c; }
    });
    if (!nearest) { notify('NO CAR NEARBY'); return; }
    if (nearest.isPlayer) {
      P.inCar = true; person.visible = false; notify('DRIVING');
    } else {
      // steal traffic car: swap it to be the player's active car
      const t = nearest.traffic;
      // hide old traffic slot by turning it into player's car
      P.inCar = true; person.visible = false;
      P.pos.copy(t.pos); P.heading = t.heading; P.speed = 0; P.vel.set(0, 0, 0);
      activeCarObj.group.visible = true;
      activeCarObj = t.car; // now player drives this
      // respawn a replacement traffic car elsewhere
      t.stolen = true; t.car.group.visible = true;
      notify('CAR STOLEN!');
    }
    audio.beep(500, 0.12);
  }
}

// ---------------- Race control ----------------
function startRace() {
  if (race.phase === 'racing' || race.phase === 'countdown') { notify('RACE IN PROGRESS'); return; }
  if (!P.inCar) { notify('GET IN A CAR FIRST'); return; }
  race.phase = 'countdown'; race.countdown = 3.05; race.active = true;
  race.playerCp = 0; race.playerLap = 0; race.playerProgress = 0; race.time = 0; race.finishOrder = [];
  racePanel.classList.remove('hidden');
  checkpointRings.forEach((c) => (c.mesh.visible = true));
  // place rivals at start near player
  const info = roadInfo(P.pos.x, P.pos.z);
  rivals.forEach((r, i) => {
    r.u = info.u; r.speed = 0; r.progress = 0; r.lap = 0; r.cp = 0; r.finished = false; r.finishTime = 0;
    r.car.group.visible = true;
    r.baseSpeed = 0.0095 + i * 0.0004;
  });
  notify('RACE STARTING', 1.2);
  audio.beep(660, 0.15);
}

function playerRaceProgress() { return race.playerLap + race.playerCp / race.totalCps; }

function showFinish() {
  const finishScreen = el('finish-screen');
  el('finish-place').textContent = race.position === 1 ? '🏆 1st PLACE!' : `${ordinal(race.position)} PLACE`;
  el('finish-time').textContent = 'TIME  ' + fmtTime(race.time);
  const rows = race.finishOrder.map((r, i) =>
    `<div class="row ${r.you ? 'you' : ''}"><span>${i + 1}. ${r.name}</span><span>${r.finished ? fmtTime(r.time) : 'DNF'}</span></div>`).join('');
  el('finish-results').innerHTML = rows;
  finishScreen.classList.remove('hidden');
  audio.beep(race.position === 1 ? 880 : 440, 0.4, 'square', 0.3);
}

function ordinal(n) { return n + (['th', 'st', 'nd', 'rd'][(n % 10 > 3 || (n % 100 >= 11 && n % 100 <= 13)) ? 0 : n % 10] || 'th'); }
function fmtTime(s) { const m = Math.floor(s / 60); const sec = (s % 60).toFixed(1).padStart(4, '0'); return `${m}:${sec}`; }

// ---------------- Pause ----------------
function togglePause() {
  paused = !paused;
  el('pause-screen').classList.toggle('hidden', !paused);
  if (paused) audio.setNitro(false);
}

// ---------------- UI buttons ----------------
el('start-btn').addEventListener('click', startGame);
el('resume-btn').addEventListener('click', togglePause);
el('restart-btn').addEventListener('click', () => location.reload());
el('finish-btn').addEventListener('click', () => {
  el('finish-screen').classList.add('hidden'); race.phase = 'idle';
  racePanel.classList.add('hidden');
});

function startGame() {
  started = true;
  el('start-screen').classList.add('hidden');
  hud.classList.remove('hidden');
  audio.start(); audio.resume();
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------- Physics update ----------------
const MAX_SPEED = 78 * (window.ARCADE_SPEED_MULT || 1);       // ~280 km/h (boosted by equipped Arcade Shop tag, if any)
const NITRO_SPEED = 100;
function updateVehicle(dt) {
  const throttle = (keys['w'] || (!COOP && keys['arrowup'])) ? 1 : 0;
  const brake = (keys['s'] || (!COOP && keys['arrowdown'])) ? 1 : 0;
  const left = (keys['a'] || (!COOP && keys['arrowleft'])) ? 1 : 0;
  const right = (keys['d'] || (!COOP && keys['arrowright'])) ? 1 : 0;
  const handbrake = keys[' '] ? 1 : 0;
  const wantNitro = (keys['shift']) && P.nitro > 1;

  // accel
  const accel = 34;
  const maxV = wantNitro ? NITRO_SPEED : MAX_SPEED;
  if (throttle) P.speed += accel * throttle * dt * (wantNitro ? 1.8 : 1);
  else if (brake) P.speed -= 46 * dt;
  else P.speed -= Math.sign(P.speed) * 10 * dt; // engine braking / roll
  if (brake && P.speed > 0) P.speed -= 40 * dt;
  P.speed = THREE.MathUtils.clamp(P.speed, -18, maxV);
  if (Math.abs(P.speed) < 0.4 && !throttle && !brake) P.speed = 0;

  // nitro
  P.nitroActive = wantNitro && Math.abs(P.speed) > 4;
  if (P.nitroActive) P.nitro = Math.max(0, P.nitro - 26 * dt);
  audio.setNitro(P.nitroActive);

  // steering, speed sensitive
  const speedFactor = THREE.MathUtils.clamp(Math.abs(P.speed) / MAX_SPEED, 0, 1);
  const steerInput = right - left;
  const steerStrength = THREE.MathUtils.lerp(2.6, 1.0, speedFactor);
  P.steer = THREE.MathUtils.lerp(P.steer, steerInput, 0.2);

  // drift mechanics
  const gripBreak = handbrake && Math.abs(P.speed) > 8;
  P.drifting = (gripBreak || (Math.abs(P.lateral) > 4 && Math.abs(P.speed) > 14 && Math.abs(steerInput) > 0.2));

  const dirSign = P.speed >= 0 ? 1 : -1;
  const turn = P.steer * steerStrength * dt * dirSign * (0.5 + speedFactor);
  P.heading += turn * (P.drifting ? 1.5 : 1);

  // lateral velocity (drift slide)
  if (gripBreak) {
    P.lateral += steerInput * Math.abs(P.speed) * 2.2 * dt;
    P.lateral -= P.lateral * 0.9 * dt;
  } else {
    // grip pulls lateral back to 0
    const gripFactor = (1 - 0.35 * rainAmount);
    P.lateral -= P.lateral * (P.drifting ? 2.2 : 7) * gripFactor * dt;
    if (Math.abs(steerInput) > 0.3 && Math.abs(P.speed) > 20)
      P.lateral += steerInput * Math.abs(P.speed) * 0.5 * dt * (1 - gripFactor * 0.5);
  }
  P.lateral = THREE.MathUtils.clamp(P.lateral, -30, 30);

  // build velocity in world space
  const fwd = new THREE.Vector3(Math.sin(P.heading), 0, Math.cos(P.heading));
  const side = new THREE.Vector3(Math.cos(P.heading), 0, -Math.sin(P.heading));
  P.vel.copy(fwd).multiplyScalar(P.speed).addScaledVector(side, P.lateral);

  // integrate
  P.pos.addScaledVector(P.vel, dt);

  // ground / ramps / air
  const targetY = terrainHeight(P.pos.x, P.pos.z);
  // ramp launch check
  for (const r of world.ramps) {
    const dx = P.pos.x - r.x, dz = P.pos.z - r.z;
    if (dx * dx + dz * dz < r.r * r.r && Math.abs(P.speed) > 30 && P.onGround) {
      P.onGround = false; P.airVY = 9 + Math.abs(P.speed) * 0.16; P.airY = targetY + 1;
    }
  }
  if (!P.onGround) {
    P.airVY -= 26 * dt;
    P.airY += P.airVY * dt;
    if (P.airY <= targetY) { P.airY = targetY; P.onGround = true; P.airVY = 0; }
    P.pos.y = P.airY;
  } else {
    P.pos.y = THREE.MathUtils.lerp(P.pos.y, targetY, 0.3);
  }

  // world bounds (keep on the big ground)
  const R = 640;
  const d2 = P.pos.x * P.pos.x + (P.pos.z - 100) * (P.pos.z - 100);
  if (d2 > R * R) {
    const a = Math.atan2(P.pos.z - 100, P.pos.x);
    P.pos.x = Math.cos(a) * R; P.pos.z = 100 + Math.sin(a) * R;
    P.speed *= 0.4;
  }

  // static (non-destructible) collisions
  for (const c of world.colliders) {
    const dx = P.pos.x - c.x, dz = P.pos.z - c.z;
    const rr = c.r + 1.6;
    const d = dx * dx + dz * dz;
    if (d < rr * rr) {
      const dist = Math.sqrt(d) || 0.001;
      const push = (rr - dist);
      P.pos.x += (dx / dist) * push; P.pos.z += (dz / dist) * push;
      P.speed *= 0.5; P.lateral *= 0.5;
    }
  }

  // ---- Destructible trees: smash-through above 100 km/h, solid below ----
  const fastEnough = Math.abs(P.speed) >= SMASH_SPEED;
  const dirX = Math.sin(P.heading) * Math.sign(P.speed || 1);
  const dirZ = Math.cos(P.heading) * Math.sign(P.speed || 1);
  for (const tr of world.destructibleTrees) {
    if (!tr.alive) continue;
    const dx = P.pos.x - tr.x, dz = P.pos.z - tr.z;
    const rr = tr.r + 1.6;
    const d = dx * dx + dz * dz;
    if (d < rr * rr) {
      if (fastEnough) {
        destructibles.smashTree(tr, dirX, dirZ);
        smashStats.trees++;
        P.speed *= 0.92; // only a little speed lost
        const bonus = 250;
        P.totalScore += bonus;
        notify('TREE SMASH! +' + bonus, 1.1);
        audio.crunch();
      } else {
        const dist = Math.sqrt(d) || 0.001;
        const push = (rr - dist);
        P.pos.x += (dx / dist) * push; P.pos.z += (dz / dist) * push;
        P.speed *= 0.5; P.lateral *= 0.5;
      }
    }
  }

  // ---- Destructible barriers: launch above/at 100 km/h, solid below ----
  for (const ba of world.destructibleBarriers) {
    if (!ba.alive) continue;
    const dx = P.pos.x - ba.x, dz = P.pos.z - ba.z;
    const rr = ba.r + 1.7;
    const d = dx * dx + dz * dz;
    if (d < rr * rr) {
      if (fastEnough) {
        const sf = THREE.MathUtils.clamp((Math.abs(P.speed) - SMASH_SPEED) / SMASH_SPEED, 0, 1.4);
        destructibles.launchBarrier(ba, dirX, dirZ, sf);
        smashStats.barriers++;
        P.speed *= 0.9; // minor speed loss
        const bonus = 150;
        P.totalScore += bonus;
        notify('BARRIER SMASH! +' + bonus, 1.1);
        audio.impact();
      } else {
        const dist = Math.sqrt(d) || 0.001;
        const push = (rr - dist);
        P.pos.x += (dx / dist) * push; P.pos.z += (dz / dist) * push;
        P.speed *= 0.5; P.lateral *= 0.5;
      }
    }
  }

  // traffic collisions
  for (const t of traffic) {
    if (!t.car.group.visible) continue;
    const dx = P.pos.x - t.pos.x, dz = P.pos.z - t.pos.z;
    const d = dx * dx + dz * dz;
    if (d < 9) {
      const dist = Math.sqrt(d) || 0.001;
      const push = (3 - dist);
      P.pos.x += (dx / dist) * push; P.pos.z += (dz / dist) * push;
      P.speed *= 0.7;
    }
  }

  // drift scoring + nitro fill
  if (P.drifting && Math.abs(P.speed) > 12) {
    const gain = Math.abs(P.lateral) * Math.abs(P.speed) * 0.35 * dt;
    P.driftActive += gain;
    P.driftTimer = 0.6;
    P.driftCombo = Math.min(6, 1 + P.driftActive / 800);
    P.nitro = Math.min(100, P.nitro + 20 * dt);
    driftPanel.classList.remove('hidden');
    driftPanel.classList.add('pop');
    audio.setScreech(Math.min(1, Math.abs(P.lateral) / 12));
  } else {
    driftPanel.classList.remove('pop');
    audio.setScreech(0);
    if (P.driftTimer > 0) { P.driftTimer -= dt; if (P.driftTimer <= 0) bankDrift(); }
  }

  // engine sound
  const rpm = THREE.MathUtils.clamp(Math.abs(P.speed) / maxV, 0, 1);
  audio.updateEngine(rpm, throttle);

  // wheel visuals
  P.wheelSpin += P.speed * dt * 2;

  // update player car mesh
  activeCarObj.group.position.copy(P.pos);
  activeCarObj.group.rotation.set(0, P.heading + Math.PI, 0);
  // wheel spin + steer
  activeCarObj.wheels.forEach((w, i) => {
    w.rotation.x = P.wheelSpin;
    if (i < 2) w.rotation.y = P.steer * 0.5; // front wheels steer (approx local)
  });
  // drift body lean
  activeCarObj.group.rotation.z = THREE.MathUtils.clamp(-P.lateral * 0.01, -0.12, 0.12);

  // brake light glow
  activeCarObj.tailMat.emissiveIntensity = brake ? 2.2 : 0.9;
}

function bankDrift() {
  const banked = Math.round(P.driftActive * P.driftCombo);
  if (banked > 20) {
    P.driftScore += banked; P.totalScore += banked;
    notify(`DRIFT +${banked}`, 1.2);
    audio.beep(700, 0.12, 'triangle', 0.15);
  }
  P.driftActive = 0; P.driftCombo = 1;
}

// ---------------- On-foot update ----------------
function updateFoot(dt) {
  const throttle = (keys['w'] || (!COOP && keys['arrowup'])) ? 1 : 0;
  const back = (keys['s'] || (!COOP && keys['arrowdown'])) ? 1 : 0;
  const left = (keys['a'] || (!COOP && keys['arrowleft'])) ? 1 : 0;
  const right = (keys['d'] || (!COOP && keys['arrowright'])) ? 1 : 0;
  if (left) foot.heading += 2.4 * dt;
  if (right) foot.heading -= 2.4 * dt;
  foot.speed = (throttle - back) * 7;
  foot.pos.x += Math.sin(foot.heading) * foot.speed * dt;
  foot.pos.z += Math.cos(foot.heading) * foot.speed * dt;
  foot.pos.y = terrainHeight(foot.pos.x, foot.pos.z);
  person.position.copy(foot.pos);
  person.rotation.y = foot.heading;
  audio.updateEngine(0.05, 0);
  audio.setScreech(0);
}

// ---------------- Traffic update ----------------
const _tp = new THREE.Vector3();
function updateTraffic(dt) {
  for (const t of traffic) {
    if (t.parked && !t.stolen) {
      // stationary; position from param once
      const p = roadCurve.getPointAt(t.u);
      const n = roadSamples.normals[Math.floor(t.u * roadSamples.pts.length) % roadSamples.pts.length];
      t.pos.set(p.x + n.x * (t.lane + 5), p.y, p.z + n.z * (t.lane + 5));
      t.car.group.position.copy(t.pos);
      continue;
    }
    // slow if player directly ahead in same lane
    let slowTarget = 1;
    const dx = P.pos.x - t.pos.x, dz = P.pos.z - t.pos.z;
    if (dx * dx + dz * dz < 400) slowTarget = 0.3;
    t.slow += (slowTarget - t.slow) * 2 * dt;

    if (t.onConnector && !t.stolen) {
      // drive along a connector shortcut, ping-pong at the ends
      const curve = connectorCurves[t.connIdx];
      t.u += t.speed * t.slow * dt * t.connDir;
      if (t.u >= 1) { t.u = 1; t.connDir = -1; }
      else if (t.u <= 0) { t.u = 0; t.connDir = 1; }
      const p = curve.getPointAt(t.u);
      const tan = curve.getTangentAt(t.u).normalize().multiplyScalar(t.connDir);
      const nrm = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      _tp.set(p.x + nrm.x * t.lane, p.y, p.z + nrm.z * t.lane);
      t.pos.copy(_tp);
      t.heading = Math.atan2(tan.x, tan.z);
    } else {
      t.u = (t.u + t.speed * t.slow * dt + 1) % 1;
      const p = roadCurve.getPointAt(t.u);
      const tan = roadCurve.getTangentAt(t.u).normalize();
      const idx = Math.floor(t.u * roadSamples.pts.length) % roadSamples.pts.length;
      const n = roadSamples.normals[idx];
      _tp.set(p.x + n.x * t.lane, p.y, p.z + n.z * t.lane);
      t.pos.copy(_tp);
      t.heading = Math.atan2(tan.x, tan.z);
    }
    t.car.group.position.copy(t.pos);
    t.car.group.rotation.set(0, t.heading, 0);
    t.car.wheels.forEach((w) => (w.rotation.x += t.speed * 40 * dt));
    t.car.tailMat.emissiveIntensity = 0.9;
    // distance culling: hide far traffic to keep draw calls low (each car is many meshes)
    if (!t.stolen) {
      const ddx = P.pos.x - t.pos.x, ddz = P.pos.z - t.pos.z;
      t.car.group.visible = (ddx * ddx + ddz * ddz) < (230 * 230);
    }
  }
}

// ---------------- Rivals + race update ----------------
function updateRace(dt) {
  if (race.phase === 'countdown') {
    race.countdown -= dt;
    const c = Math.ceil(race.countdown);
    if (race.countdown <= 0) {
      race.phase = 'racing'; countdownEl.classList.add('hidden'); notify('GO!', 1.0); audio.beep(880, 0.3);
    } else {
      countdownEl.classList.remove('hidden');
      const val = c <= 0 ? 'GO' : c;
      if (countdownEl.textContent !== String(val)) { countdownEl.textContent = val; audio.beep(440, 0.15); }
    }
    return;
  }
  if (race.phase !== 'racing') return;

  race.time += dt;

  // rivals follow racing line with rubber-band
  for (const r of rivals) {
    if (r.finished) { r.car.group.position.copy(r.pos); continue; }
    const rubber = THREE.MathUtils.clamp(1 + (playerRaceProgress() - (r.lap + r.cp / race.totalCps)) * 0.4, 0.85, 1.25);
    r.u = (r.u + r.baseSpeed * rubber * dt * 3 + 1) % 1; // advance along racing line
    const p = roadCurve.getPointAt(r.u);
    const tan = roadCurve.getTangentAt(r.u).normalize();
    const idx = Math.floor(r.u * roadSamples.pts.length) % roadSamples.pts.length;
    const n = roadSamples.normals[idx];
    r.pos.set(p.x + n.x * r.lane, p.y, p.z + n.z * r.lane);
    r.heading = Math.atan2(tan.x, tan.z);
    r.car.group.position.copy(r.pos);
    r.car.group.rotation.set(0, r.heading, 0);
    r.car.wheels.forEach((w) => (w.rotation.x += 0.5));
    // checkpoint progress for rival
    const targetU = raceUs[r.cp];
    if (passedCp(r.u, r.prevU ?? r.u, targetU)) {
      r.cp++;
      if (r.cp >= race.totalCps) { r.cp = 0; r.lap++; if (r.lap >= race.laps) { r.finished = true; r.finishTime = race.time; } }
    }
    r.prevU = r.u;
    r.progress = r.lap + r.cp / race.totalCps;
  }

  // player checkpoint detection
  const info = roadInfo(P.pos.x, P.pos.z);
  const ring = checkpointRings[race.playerCp];
  const d = P.pos.distanceTo(ring.pos);
  if (d < 12) {
    race.playerCp++;
    audio.beep(600, 0.12, 'square', 0.2);
    if (race.playerCp >= race.totalCps) {
      race.playerCp = 0; race.playerLap++;
      if (race.playerLap >= race.laps) { finishPlayerRace(); return; }
      notify(`LAP ${race.playerLap + 1}/${race.laps}`, 1.4);
    }
    // highlight next ring
    checkpointRings.forEach((c, i) => c.mesh.material.color.set(i === race.playerCp ? 0xffb020 : 0x22d3ee));
  }

  // position calc
  const pProg = playerRaceProgress();
  let ahead = 0;
  rivals.forEach((r) => { if ((r.finished ? 999 : r.progress) > pProg) ahead++; });
  race.position = ahead + 1;

  // HUD
  racePosEl.textContent = race.position;
  raceLapEl.textContent = `LAP ${race.playerLap + 1}/${race.laps}`;
  raceCpEl.textContent = `CP ${race.playerCp}/${race.totalCps}`;
  raceTimerEl.textContent = fmtTime(race.time);
}

function passedCp(u, prevU, target) {
  // handle wrap
  if (prevU <= u) return prevU <= target && target <= u;
  return target >= prevU || target <= u;
}

function finishPlayerRace() {
  race.phase = 'finished'; race.active = false;
  checkpointRings.forEach((c) => (c.mesh.visible = false));
  // Determine final order
  const entries = [{ name: 'YOU', you: true, progress: race.laps, finished: true, time: race.time }];
  rivals.forEach((r, i) => entries.push({ name: 'RIVAL ' + (i + 1), progress: r.progress, finished: r.finished, time: r.finished ? r.finishTime : race.time + (race.laps - r.progress) * 25 }));
  entries.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return a.time - b.time;
    return b.progress - a.progress;
  });
  race.finishOrder = entries;
  race.position = entries.findIndex((e) => e.you) + 1;
  rivals.forEach((r) => (r.car.group.visible = false));
  showFinish();
}

// ---------------- Camera update ----------------
const _camTarget = new THREE.Vector3();
const _camPos = new THREE.Vector3();
function updateCamera(dt) {
  const target = P.inCar ? P.pos : foot.pos;
  const heading = P.inCar ? P.heading : foot.heading;
  const speed = P.inCar ? Math.abs(P.speed) : 0;
  let dist = 9, height = 4.2, look = 3;
  if (camMode === 1) { dist = 1.5; height = 2.2; look = 8; }
  if (camMode === 2) { dist = 16; height = 8; look = 2; }
  // drift camera offset
  const driftOffset = P.inCar ? -P.lateral * 0.06 : 0;
  const behind = new THREE.Vector3(-Math.sin(heading) * dist, height, -Math.cos(heading) * dist);
  _camPos.copy(target).add(behind);
  _camPos.x += Math.cos(heading) * driftOffset;
  _camPos.z += -Math.sin(heading) * driftOffset;
  _camPos.y = Math.max(_camPos.y, terrainHeight(_camPos.x, _camPos.z) + 2);
  camera.position.lerp(_camPos, 1 - Math.pow(0.001, dt));
  _camTarget.copy(target).add(new THREE.Vector3(Math.sin(heading) * look, 1.2, Math.cos(heading) * look));
  camera.lookAt(_camTarget);

  // speed FOV + nitro kick
  let targetFov = 60 + Math.min(speed / MAX_SPEED, 1.2) * 12;
  if (P.nitroActive) targetFov += 10;
  camFov = THREE.MathUtils.lerp(camFov, targetFov, 1 - Math.pow(0.005, dt));
  camera.fov = camFov;
  camera.updateProjectionMatrix();
}

// ---------------- Effects update ----------------
function updateEffects(dt) {
  // tire smoke while drifting
  if (P.inCar && P.drifting && Math.abs(P.speed) > 12) {
    const back = new THREE.Vector3(-Math.sin(P.heading), 0, -Math.cos(P.heading)).multiplyScalar(1.6);
    for (const sx of [-1, 1]) {
      const off = new THREE.Vector3(Math.cos(P.heading) * sx, 0, -Math.sin(P.heading) * sx);
      smoke.emit(
        P.pos.x + back.x + off.x, P.pos.y + 0.3, P.pos.z + back.z + off.z,
        (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3,
        0.9 + Math.random() * 0.4
      );
    }
    // skid marks
    const bl = new THREE.Vector3(P.pos.x + back.x - Math.cos(P.heading) * 0.9, P.pos.y, P.pos.z + back.z + Math.sin(P.heading) * 0.9);
    const br = new THREE.Vector3(P.pos.x + back.x + Math.cos(P.heading) * 0.9, P.pos.y, P.pos.z + back.z - Math.sin(P.heading) * 0.9);
    skid.addPair(bl.x, bl.z, br.x, br.z, P.pos.y);
  } else {
    skid.break();
  }
  // nitro flames
  if (P.inCar && P.nitroActive) {
    const back = new THREE.Vector3(-Math.sin(P.heading), 0, -Math.cos(P.heading)).multiplyScalar(2.4);
    for (const sx of [-0.7, 0.7]) {
      const off = new THREE.Vector3(Math.cos(P.heading) * sx, 0, -Math.sin(P.heading) * sx);
      flames.emit(P.pos.x + back.x + off.x, P.pos.y + 0.6, P.pos.z + back.z + off.z,
        -Math.sin(P.heading) * -6 + (Math.random() - 0.5) * 2, (Math.random() - 0.3) * 2, -Math.cos(P.heading) * -6 + (Math.random() - 0.5) * 2,
        0.35 + Math.random() * 0.2);
    }
  }
  smoke.update(dt);
  flames.update(dt);
  rain.update(dt, camera.position);
  destructibles.update(dt);
}

// ---------------- Day/night + weather ----------------
const _sunOff = new THREE.Vector3();
function updateAtmosphere(dt) {
  if (race.phase !== 'countdown') timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
  const s = sampleDayNight(timeOfDay);
  sky.material.uniforms.top.value.copy(s.top);
  sky.material.uniforms.bottom.value.copy(s.bot);
  const dir = sunDirection(timeOfDay);
  const focus = P.inCar ? P.pos : foot.pos;
  _sunOff.copy(dir).multiplyScalar(160);
  sun.position.copy(focus).add(_sunOff);
  sun.target.position.copy(focus);
  sun.color.copy(s.sun);
  sun.intensity = s.sunInt;
  hemi.intensity = s.hemiInt;
  hemi.color.copy(s.top); hemi.groundColor.set(0x2a3b2f);
  ambient.intensity = 0.15 + s.night * 0.15;

  // weather cycle
  weatherT += dt;
  if (weatherT > 90) { weatherT = 0; weather = weather === 'sunny' ? 'rain' : 'sunny'; notify(weather === 'rain' ? 'RAIN INCOMING' : 'SKIES CLEARING', 1.6); }
  const targetRain = weather === 'rain' ? 1 : 0;
  rainAmount += (targetRain - rainAmount) * Math.min(1, dt * 0.6);
  rain.setVisible(rainAmount > 0.05);
  rain.mat.opacity = 0.35 * rainAmount;

  // fog color/density
  const fogCol = s.fog.clone().lerp(new THREE.Color(0x5a6b7a), rainAmount * 0.6);
  scene.fog.color.copy(fogCol);
  scene.fog.near = 200 - rainAmount * 80;
  scene.fog.far = 1000 - rainAmount * 400;
  renderer.setClearColor(fogCol);

  // wet roads: darker + glossier
  const wet = rainAmount;
  world.road.material.roughness = 0.7 - wet * 0.55;
  world.road.material.metalness = wet * 0.5;
  world.road.material.envMapIntensity = 0.3 + wet * 1.5;
  world.road.material.color.setRGB(0.14 - wet * 0.06, 0.15 - wet * 0.06, 0.18 - wet * 0.06);

  // exposure dims a touch at night/rain
  renderer.toneMappingExposure = 1.15 - s.night * 0.35 - rainAmount * 0.15;

  // stars
  stars.material.opacity = s.night;

  // night lighting: headlights, streetlights, city neon, tail glow
  const night = s.night;
  if (activeCarObj.headSpots) activeCarObj.headSpots.forEach((sp) => (sp.intensity = night > 0.4 ? 2.5 : 0));
  activeCarObj.headMat.emissiveIntensity = 0.6 + night * 1.5;
  const shMat = world.getStreetHeadMat && world.getStreetHeadMat();
  if (shMat) shMat.emissiveIntensity = night * 2.2;
  if (world.cityWindowMat) world.cityWindowMat.emissiveIntensity = night * 1.4;
  const neon = world.getNeonMat && world.getNeonMat();
  if (neon) neon.emissiveIntensity = 0.3 + night * 2.2;

  // ferris wheel spin
  const fw = world.getFerris && world.getFerris();
  if (fw) fw.rotation.z += dt * 0.15;

  // ocean animate
  if (world.oceanMat) world.oceanMat.uniforms.time.value += dt;
}

// ---------------- HUD update ----------------
function updateHUD() {
  const kmh = Math.round(Math.abs(P.speed) * 3.6);
  speedNum.textContent = P.inCar ? kmh : 0;
  const ratio = THREE.MathUtils.clamp(Math.abs(P.speed) / NITRO_SPEED, 0, 1);
  arcFill.style.strokeDashoffset = arcLen * (1 - ratio);
  // gear
  let gear = 'N';
  if (P.inCar) {
    if (P.speed < -0.5) gear = 'R';
    else if (kmh < 1) gear = 'N';
    else gear = String(Math.min(6, 1 + Math.floor(kmh / 48)));
  }
  gearEl.textContent = gear;
  nitroFill.style.width = P.nitro + '%';
  nitroFill.classList.toggle('ready', P.nitro > 99);
  driftScoreEl.textContent = Math.round(P.driftActive * P.driftCombo);
  driftComboEl.textContent = P.driftCombo.toFixed(1);
  totalScoreEl.textContent = P.totalScore.toLocaleString();
  drawMinimap();
}

// nitro ready notify
let lastNitroReady = false;
function checkNitroReady() {
  const ready = P.nitro > 99;
  if (ready && !lastNitroReady) notify('NITROUS READY', 1.2);
  lastNitroReady = ready;
}

// ---------------- Minimap ----------------
function drawMinimap() {
  const w = 200, h = 200;
  mmCtx.clearRect(0, 0, w, h);
  mmCtx.fillStyle = 'rgba(8,12,22,0.7)';
  mmCtx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const scale = 0.11;
  const focus = P.inCar ? P.pos : foot.pos;
  const rot = -(P.inCar ? P.heading : foot.heading);
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  function toMap(x, z) {
    const rx = (x - focus.x) * scale, rz = (z - focus.z) * scale;
    return [cx + rx * cosR - rz * sinR, cy + rx * sinR + rz * cosR];
  }
  // main road loop
  mmCtx.strokeStyle = 'rgba(120,150,190,0.75)'; mmCtx.lineWidth = 3;
  mmCtx.beginPath();
  const pts = roadSamples.pts;
  for (let i = 0; i <= pts.length; i += 3) {
    const p = pts[i % pts.length];
    const [mx, my] = toMap(p.x, p.z);
    if (i === 0) mmCtx.moveTo(mx, my); else mmCtx.lineTo(mx, my);
  }
  mmCtx.stroke();
  // connector / shortcut roads (dashed amber)
  mmCtx.strokeStyle = 'rgba(245,197,66,0.8)'; mmCtx.lineWidth = 2;
  mmCtx.setLineDash([4, 3]);
  connectorSamples.forEach((line) => {
    mmCtx.beginPath();
    line.forEach((p, i) => { const [mx, my] = toMap(p.x, p.z); if (i === 0) mmCtx.moveTo(mx, my); else mmCtx.lineTo(mx, my); });
    mmCtx.stroke();
  });
  mmCtx.setLineDash([]);
  // zone tints (coast/city/mountain dots)
  // rivals
  if (race.active) {
    mmCtx.fillStyle = '#ff2e63';
    rivals.forEach((r) => { const [mx, my] = toMap(r.pos.x, r.pos.z); mmCtx.beginPath(); mmCtx.arc(mx, my, 3, 0, 7); mmCtx.fill(); });
    // checkpoints
    mmCtx.fillStyle = '#ffb020';
    const ring = checkpointRings[race.playerCp];
    if (ring) { const [mx, my] = toMap(ring.pos.x, ring.pos.z); mmCtx.beginPath(); mmCtx.arc(mx, my, 4, 0, 7); mmCtx.fill(); }
  }
  // traffic
  mmCtx.fillStyle = 'rgba(150,220,255,0.7)';
  traffic.forEach((t) => { const [mx, my] = toMap(t.pos.x, t.pos.z); if (mx > 0 && mx < w && my > 0 && my < h) { mmCtx.fillRect(mx - 1.5, my - 1.5, 3, 3); } });
  // player arrow (always up/center)
  mmCtx.save();
  mmCtx.translate(cx, cy);
  mmCtx.fillStyle = '#22d3ee';
  mmCtx.beginPath(); mmCtx.moveTo(0, -7); mmCtx.lineTo(5, 6); mmCtx.lineTo(0, 3); mmCtx.lineTo(-5, 6); mmCtx.closePath(); mmCtx.fill();
  mmCtx.restore();
  // border
  mmCtx.strokeStyle = 'rgba(120,180,255,0.3)'; mmCtx.lineWidth = 2; mmCtx.strokeRect(1, 1, w - 2, h - 2);
}

// ---------------- Main loop ----------------
const clock = new THREE.Clock();
const FIXED = 1 / 60;
let accum = 0;

function step(dt) {
  if (P.inCar) updateVehicle(dt); else updateFoot(dt);
  if (COOP) updateP2(dt);
  updateTraffic(dt);
  updateRace(dt);
}

function frame() {
  requestAnimationFrame(frame);
  renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.05);
  if (started && !paused) {
    accum += dt;
    let iters = 0;
    while (accum >= FIXED && iters < 5) { step(FIXED); accum -= FIXED; iters++; }
    updateCamera(dt);
    updateEffects(dt);
    updateAtmosphere(dt);
    updateHUD();
    checkNitroReady();
    if (notifyTimer > 0) { notifyTimer -= dt; if (notifyTimer <= 0) notifyEl.classList.remove('show'); }
  }
  renderer.render(scene, camera);
  debug.update();
}
requestAnimationFrame(frame);

// ---------------- Test hooks ----------------
window.render_game_to_text = function () {
  return JSON.stringify({
    started, paused,
    mode: P.inCar ? 'driving' : 'onfoot',
    phase: race.phase,
    coord: 'XZ ground plane, +Y up',
    player: { x: +P.pos.x.toFixed(1), y: +P.pos.y.toFixed(1), z: +P.pos.z.toFixed(1), heading: +P.heading.toFixed(2) },
    speed_kmh: Math.round(Math.abs(P.speed) * 3.6),
    drifting: P.drifting,
    nitro: Math.round(P.nitro),
    nitroActive: P.nitroActive,
    driftActive: Math.round(P.driftActive),
    driftCombo: +P.driftCombo.toFixed(1),
    totalScore: P.totalScore,
    timeOfDay: +timeOfDay.toFixed(2),
    night: +sampleDayNight(timeOfDay).night.toFixed(2),
    weather, rainAmount: +rainAmount.toFixed(2),
    camMode,
    race: { phase: race.phase, position: race.position, lap: race.playerLap, cp: race.playerCp, time: +race.time.toFixed(1) },
    smash: { trees: smashStats.trees, barriers: smashStats.barriers },
    treesAlive: world.destructibleTrees.filter((t) => t.alive).length,
    barriersAlive: world.destructibleBarriers.filter((b) => b.alive).length,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    fps: Math.round(debug.fps),
  });
};

window.advanceTime = function (ms, doRender = false) {
  const steps = Math.min(600, Math.max(1, Math.round(ms / (1000 / 60))));
  for (let i = 0; i < steps; i++) {
    if (started && !paused) { step(FIXED); updateEffects(FIXED); updateAtmosphere(FIXED); }
  }
  updateCamera(FIXED);
  updateHUD();
  checkNitroReady();
  if (doRender) { renderer.info.reset(); renderer.render(scene, camera); }
};

// expose for debugging
window.__game = {
  P, race, keys, traffic, rivals,
  setKey: (k, v) => (keys[k] = v),
  startRace, toggleCar, togglePause,
  cpPositions: () => checkpointRings.map((c) => ({ x: c.pos.x, y: c.pos.y, z: c.pos.z })),
  teleport: (x, y, z, h) => { P.pos.set(x, y, z); if (h !== undefined) P.heading = h; },
  setWeather: (w) => { weather = w; weatherT = 0; },
  setTime: (t) => { timeOfDay = t; },
  smashStats: () => ({ ...smashStats }),
  // nearest alive destructible of a kind: 'tree' | 'barrier'; returns {x,y,z}
  nearestDestructible: (kind) => {
    const list = kind === 'barrier' ? world.destructibleBarriers : world.destructibleTrees;
    return list.filter((e) => e.alive).map((e) => ({ x: e.x, y: e.y, z: e.z }));
  },
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures }),
};
