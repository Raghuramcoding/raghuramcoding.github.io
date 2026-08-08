import * as THREE from 'three';

// Procedural environment map for reflective car paint (no external HDR needed).
export function makeEnvMap(renderer) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  // sky gradient
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#aee6ff');
  g.addColorStop(0.45, '#7fc4ff');
  g.addColorStop(0.5, '#dfeeff');
  g.addColorStop(0.55, '#cfe6d6');
  g.addColorStop(1, '#4a6b4f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // sun bloom
  const sg = ctx.createRadialGradient(size * 0.7, size * 0.28, 4, size * 0.7, size * 0.28, 90);
  sg.addColorStop(0, 'rgba(255,255,245,1)');
  sg.addColorStop(1, 'rgba(255,255,245,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, size, size);
  // soft clouds
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * size, y = Math.random() * size * 0.4;
    ctx.beginPath();
    ctx.ellipse(x, y, 20 + Math.random() * 30, 8 + Math.random() * 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  return envRT.texture;
}

// Sky gradient dome that we recolor by time of day.
export function makeSky() {
  const geo = new THREE.SphereGeometry(1800, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x1e6bd6) },
      bottom: { value: new THREE.Color(0xbfe3ff) },
      offset: { value: 400 },
      exponent: { value: 0.6 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
    `,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exponent;
      varying vec3 vWorld;
      void main(){
        float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottom, top, t), 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

// Star field for night.
export function makeStars() {
  const N = 1200;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 1600;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random()); // upper hemisphere bias
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi) * 0.9 + 100;
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0 });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -1;
  return pts;
}

// Day-night keyframes: t in [0,1). Returns colors + sun direction + intensities.
const KEYS = [
  // t, skyTop, skyBottom, sunColor, sunInt, hemiInt, fog, night, ambient
  { t: 0.00, top: 0x0a0f2a, bot: 0x141a30, sun: 0x334066, si: 0.05, hi: 0.15, fog: 0x0a0e1e, night: 1.0 }, // midnight
  { t: 0.22, top: 0xff8a4b, bot: 0xffd9a0, sun: 0xffb070, si: 0.6, hi: 0.5, fog: 0xffc79a, night: 0.35 }, // dawn
  { t: 0.30, top: 0x2e8ae0, bot: 0xcdeaff, sun: 0xfff4e0, si: 1.15, hi: 0.75, fog: 0xbfe0ff, night: 0.0 }, // morning
  { t: 0.50, top: 0x1e6bd6, bot: 0xbfe3ff, sun: 0xffffff, si: 1.35, hi: 0.9, fog: 0xcfe8ff, night: 0.0 }, // noon
  { t: 0.72, top: 0xd8622e, bot: 0xffc98c, sun: 0xff8a3c, si: 0.75, hi: 0.5, fog: 0xf0a878, night: 0.25 }, // dusk
  { t: 0.82, top: 0x241a44, bot: 0x3a2c5c, sun: 0x5a4a80, si: 0.15, hi: 0.25, fog: 0x241d3a, night: 0.8 }, // twilight
  { t: 1.00, top: 0x0a0f2a, bot: 0x141a30, sun: 0x334066, si: 0.05, hi: 0.15, fog: 0x0a0e1e, night: 1.0 },
];

function lerpColor(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }

export function sampleDayNight(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 1 && t > KEYS[i + 1].t) i++;
  const a = KEYS[i], b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const span = (b.t - a.t) || 1;
  const f = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);
  return {
    top: lerpColor(a.top, b.top, f),
    bot: lerpColor(a.bot, b.bot, f),
    sun: lerpColor(a.sun, b.sun, f),
    fog: lerpColor(a.fog, b.fog, f),
    sunInt: THREE.MathUtils.lerp(a.si, b.si, f),
    hemiInt: THREE.MathUtils.lerp(a.hi, b.hi, f),
    night: THREE.MathUtils.lerp(a.night, b.night, f),
  };
}

// Sun direction from time of day.
export function sunDirection(t) {
  const ang = (t - 0.25) * Math.PI * 2; // sunrise at t=0.25
  const y = Math.sin(ang);
  const x = Math.cos(ang);
  return new THREE.Vector3(x * 0.7, Math.max(y, -0.3), 0.35).normalize();
}
