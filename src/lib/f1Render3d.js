// Drawing Drift King in 3D (three.js, loaded only for the game): the
// circuit, the cars and three views. Everything is built in code; no
// downloaded models or images.
//
// Views: "top" (high up behind the car, looking well down the road),
// "chase" (third person, close behind the car), "cockpit" (first person).
//
// The guide line: the way through the next corners, drawn on the track ahead
// of you. Green: you're fine at this speed. Yellow: ease off. Red: brake.

import * as THREE from "three";
import { TRACK_W, KERB_W, BRAKE } from "./f1Engine.js";
import { buildCar as buildRoadCar } from "./rush3d.js";

const fwd = (h) => [-Math.sin(h), -Math.cos(h)];

export function canvasTexture(w, h, draw, repeat = null) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

export function speckle(ctx, w, h, base, spread, count, size = 1) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = Math.random() * spread * 2 - spread;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

// What the place around each circuit looks like (by track id).
export const LOOKS = {
  day: { sky: ["#3f86c9", "#cfe4f5"], ground: "#4f7f35", night: false, scenery: "trees" },
  desert: { sky: ["#3b7cc4", "#f3dfbf"], ground: "#c9a46b", night: false, scenery: "none" },
  desertNight: { sky: ["#05081a", "#2a2050"], ground: "#6f5a3c", night: true, scenery: "none" },
  cityNight: { sky: ["#03040f", "#1c1240"], ground: "#2c2f36", night: true, scenery: "city" },
  city: { sky: ["#4a8fd0", "#dceaf5"], ground: "#5b6b4a", night: false, scenery: "city" },
  sunset: { sky: ["#40306e", "#ff9d5c"], ground: "#5a7a38", night: false, scenery: "trees" },
};
const TRACK_LOOK = {
  bh02: "desertNight",
  qa04: "desertNight",
  ae09: "desertNight",
  sg08: "cityNight",
  us23: "cityNight",
  sa21: "desertNight",
  mc29: "city",
  us22: "city",
  es26: "city",
};

// ---------- the cars ----------

export const box = (w, h, d, mat, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

// An open-wheel race car, nose toward -z. Returns the group with its front
// wheels (to steer), all wheels (to spin) and the driver (hidden in the
// cockpit view).
export function buildF1Car(color, accent = "#F5F5F5") {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.35 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.3, roughness: 0.55 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.3 });

  g.add(box(1.25, 0.05, 4.7, carbon, 0, 0.09, 0.1)); // floor
  g.add(box(0.72, 0.42, 2.9, paint, 0, 0.36, -0.15)); // tub
  // Nose, sloping down to the front wing.
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 1.5, 4, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), paint);
  nose.scale.set(1, 0.65, 1);
  nose.position.set(0, 0.3, -2.25);
  nose.castShadow = true;
  g.add(nose);
  g.add(box(1.85, 0.05, 0.5, trim, 0, 0.13, -2.75)); // front wing
  g.add(box(1.85, 0.05, 0.28, paint, 0, 0.2, -2.6));
  for (const sx of [-1, 1]) g.add(box(0.04, 0.26, 0.6, carbon, sx * 0.93, 0.2, -2.7)); // endplates
  // Sidepods and engine cover with a fin.
  for (const sx of [-1, 1]) {
    const pod = box(0.48, 0.38, 1.7, paint, sx * 0.6, 0.3, 0.2);
    g.add(pod);
    g.add(box(0.4, 0.05, 1.5, trim, sx * 0.6, 0.5, 0.25));
  }
  g.add(box(0.5, 0.42, 1.7, paint, 0, 0.66, 0.85));
  g.add(box(0.04, 0.35, 1.2, trim, 0, 0.95, 1.1));
  // Cockpit, driver, halo.
  g.add(box(0.5, 0.06, 0.8, carbon, 0, 0.58, -0.45));
  const driver = new THREE.Group();
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: accent, metalness: 0.2, roughness: 0.3 }));
  helmet.position.set(0, 0.78, -0.35);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.1), new THREE.MeshStandardMaterial({ color: 0x0b0b0b, metalness: 0.9, roughness: 0.1 }));
  visor.position.set(0, 0.8, -0.5);
  driver.add(helmet, visor);
  g.add(driver);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 24, Math.PI), carbon);
  driver.add(halo);
  halo.rotation.set(-Math.PI / 2, 0, 0);
  halo.position.set(0, 0.95, -0.35);
  const pillar = box(0.05, 0.36, 0.05, carbon, 0, 0.78, -0.72);
  pillar.rotation.x = 0.4;
  driver.add(pillar); // hidden with the driver in the cockpit view
  // Rear wing.
  g.add(box(1.0, 0.06, 0.38, trim, 0, 0.98, 2.4));
  g.add(box(1.0, 0.05, 0.25, paint, 0, 1.12, 2.45));
  for (const sx of [-1, 1]) g.add(box(0.04, 0.6, 0.55, carbon, sx * 0.52, 0.85, 2.4));
  // Wheels.
  const wheels = [];
  const front = [];
  for (const [wx, wz] of [
    [-0.82, -1.75],
    [0.82, -1.75],
    [-0.82, 1.62],
    [0.82, 1.62],
  ]) {
    const holder = new THREE.Group();
    holder.position.set(wx, 0.36, wz);
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, wz > 0 ? 0.42 : 0.34, 24).rotateZ(Math.PI / 2), tyre);
    t.castShadow = true;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, (wz > 0 ? 0.42 : 0.34) + 0.01, 16).rotateZ(Math.PI / 2), rim);
    w.add(t, r);
    holder.add(w);
    g.add(holder);
    wheels.push(w);
    if (wz < 0) front.push(holder);
  }
  // A steering wheel, seen only from the cockpit.
  const wheel = new THREE.Group();
  // Low and close, so only its top shows along the bottom of the screen.
  const rimW = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 24), carbon);
  const lights = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.01), new THREE.MeshStandardMaterial({ color: 0x0080f0, emissive: 0x0080f0, emissiveIntensity: 0.8 }));
  lights.position.y = 0.1;
  wheel.add(rimW, lights);
  wheel.position.set(0, 0.7, -0.95);
  wheel.rotation.x = -0.3;
  wheel.visible = false;
  g.add(wheel);
  g.userData = { wheels, front, driver, steeringWheel: wheel };
  return g;
}

// A closed sports car, nose toward -z: "gt" (low mid-engine supercar),
// "tuner" (JDM coupe with a big wing) or "muscle" (long hood, stripes).
// Same parts as the open-wheel car: the cabin goes in `driver`, so the
// cockpit view looks out over the hood.
function wedge(w, h, d, mat, x, y, z, tilt) {
  const m = box(w, h, d, mat, x, y, z);
  m.rotation.x = tilt;
  return m;
}

export function buildSportsCar(type, color, accent = "#F5F5F5") {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.28 });
  const trim = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.4, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.3, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d1a26, metalness: 0.9, roughness: 0.08 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.15 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: type === "tuner" ? 0x2b2b2b : 0xb9bec4, metalness: 0.85, roughness: 0.25 });
  const head = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, emissive: 0xdde8ff, emissiveIntensity: 0.9 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff0000, emissiveIntensity: 0.9 });
  const driver = new THREE.Group();
  let wheelX = 0.86;
  let wheelZ = [-1.55, 1.5];
  let r = 0.34;

  if (type === "gt") {
    g.add(box(1.96, 0.42, 4.5, paint, 0, 0.42, 0)); // body
    g.add(wedge(1.9, 0.12, 1.3, paint, 0, 0.62, -1.55, -0.12)); // sloping nose
    g.add(box(1.7, 0.08, 1.6, paint, 0, 0.68, 1.25)); // engine deck
    g.add(box(1.98, 0.08, 0.4, dark, 0, 0.24, -2.2)); // splitter
    g.add(box(1.7, 0.18, 0.3, dark, 0, 0.32, 2.2)); // diffuser
    for (const sx of [-1, 1]) g.add(box(0.06, 0.24, 0.9, dark, sx * 0.99, 0.5, 0.55)); // side intakes
    g.add(box(1.6, 0.05, 0.28, paint, 0, 0.78, 2.15)); // ducktail
    const cabin = wedge(1.36, 0.4, 1.7, glass, 0, 0.82, -0.05, 0);
    driver.add(cabin, box(1.3, 0.05, 1.1, paint, 0, 1.04, 0.05));
    for (const sx of [-1, 1]) {
      g.add(box(0.42, 0.06, 0.12, head, sx * 0.62, 0.6, -2.22));
      g.add(box(0.5, 0.07, 0.06, tail, sx * 0.6, 0.6, 2.26));
    }
    g.add(box(0.3, 0.02, 4.2, trim, 0, 0.67, -0.1)); // centre stripe
  } else if (type === "tuner") {
    wheelX = 0.82;
    wheelZ = [-1.45, 1.4];
    r = 0.33;
    g.add(box(1.84, 0.5, 4.3, paint, 0, 0.5, 0));
    g.add(wedge(1.78, 0.1, 1.2, paint, 0, 0.76, -1.5, -0.08)); // hood
    g.add(box(1.86, 0.1, 0.35, dark, 0, 0.27, -2.12)); // front lip
    g.add(box(1.4, 0.16, 0.08, dark, 0, 0.5, -2.16)); // grille
    driver.add(box(1.5, 0.48, 2.0, glass, 0, 0.99, 0.2), box(1.44, 0.05, 1.5, paint, 0, 1.25, 0.25));
    // Big wing on stands.
    g.add(box(1.8, 0.06, 0.42, trim, 0, 1.18, 1.95));
    for (const sx of [-1, 1]) {
      g.add(box(0.06, 0.4, 0.2, dark, sx * 0.6, 0.95, 1.95));
      g.add(box(0.04, 0.22, 0.46, trim, sx * 0.9, 1.18, 1.95));
      g.add(box(0.06, 0.2, 3.6, trim, sx * 0.93, 0.45, 0)); // side stripe
      g.add(box(0.4, 0.07, 0.1, head, sx * 0.6, 0.62, -2.16));
      g.add(box(0.36, 0.1, 0.06, tail, sx * 0.62, 0.66, 2.16));
    }
  } else {
    // Muscle.
    wheelX = 0.88;
    wheelZ = [-1.7, 1.55];
    r = 0.36;
    g.add(box(1.98, 0.56, 4.9, paint, 0, 0.54, 0));
    g.add(box(1.9, 0.08, 2.0, paint, 0, 0.86, -1.35)); // long hood
    g.add(box(0.6, 0.14, 0.9, dark, 0, 0.96, -1.1)); // scoop
    g.add(box(2.0, 0.14, 0.14, chrome, 0, 0.36, -2.48)); // bumpers
    g.add(box(2.0, 0.14, 0.14, chrome, 0, 0.36, 2.48));
    g.add(box(1.6, 0.22, 0.06, dark, 0, 0.6, -2.46)); // grille
    driver.add(box(1.62, 0.46, 1.75, glass, 0, 1.05, 0.55), box(1.56, 0.05, 1.3, paint, 0, 1.29, 0.6));
    g.add(box(1.7, 0.05, 0.3, paint, 0, 0.92, 2.3)); // spoiler lip
    for (const sx of [-1, 1]) {
      g.add(box(0.22, 0.02, 4.92, trim, sx * 0.24, 0.83, 0)); // twin stripes
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 16).rotateX(Math.PI / 2), head);
      lamp.position.set(sx * 0.68, 0.6, -2.47);
      g.add(lamp);
      g.add(box(0.6, 0.1, 0.06, tail, sx * 0.55, 0.68, 2.46));
    }
  }
  // A helmeted driver behind the glass, so the cabin doesn't read as empty.
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.35 }));
  helmet.position.set(-0.36, type === "gt" ? 0.92 : 1.08, type === "muscle" ? 0.6 : 0.15);
  driver.add(helmet);
  g.add(driver);

  const wheels = [];
  const front = [];
  for (const wz of wheelZ) {
    for (const sx of [-1, 1]) {
      const holder = new THREE.Group();
      holder.position.set(sx * wheelX, r, wz);
      const w = new THREE.Group();
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 24).rotateZ(Math.PI / 2), tyre);
      tr.castShadow = true;
      const rm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.31, 16).rotateZ(Math.PI / 2), rim);
      w.add(tr, rm);
      holder.add(w);
      g.add(holder);
      wheels.push(w);
      if (wz < 0) front.push(holder);
    }
  }
  // Steering wheel for the cockpit view, as on the open-wheel car.
  const wheel = new THREE.Group();
  const rimW = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 24), dark);
  wheel.add(rimW);
  wheel.position.set(-0.36, 0.78, -0.75);
  wheel.rotation.x = -0.3;
  wheel.visible = false;
  g.add(wheel);
  g.userData = { wheels, front, driver, steeringWheel: wheel };
  return g;
}

export const buildCar = (type, color, accent) => (type === "formula" ? buildF1Car(color, accent) : buildSportsCar(type, color, accent));

// ---------- the circuit ----------

// A strip of triangles between two edges (arrays of [x, y, z]).
function ribbon(left, right, vScale, uv = [0, 1]) {
  const n = left.length;
  const pos = new Float32Array(n * 6);
  const uvs = new Float32Array(n * 4);
  let v = 0;
  for (let i = 0; i < n; i++) {
    pos.set(left[i], i * 6);
    pos.set(right[i], i * 6 + 3);
    if (i > 0) v += Math.hypot(left[i][0] - left[i - 1][0], left[i][2] - left[i - 1][2]) / vScale;
    uvs.set([uv[0], v, uv[1], v], i * 4);
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Points `off` meters left of the middle (negative = right), at height y.
export function edge(track, i, off, y) {
  const [fx, fz] = fwd(track.heading[i]);
  return [track.x[i] + fz * off, y, track.z[i] - fx * off];
}

export function buildCircuit(scene, track, look) {
  const { n } = track;
  const loop = [...Array(n).keys(), 0];

  const asphalt = canvasTexture(256, 512, (ctx, w, h) => {
    speckle(ctx, w, h, "#3a3c41", 34, 30000);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.fillRect(w * 0.3, 0, w * 0.12, h);
    ctx.fillRect(w * 0.58, 0, w * 0.12, h);
    ctx.fillStyle = "#ecebe6";
    ctx.fillRect(w * 0.015, 0, w * 0.02, h);
    ctx.fillRect(w * 0.965, 0, w * 0.02, h);
  }, [1, 1]);
  const road = new THREE.Mesh(
    ribbon(loop.map((i) => edge(track, i, TRACK_W / 2, 0.02)), loop.map((i) => edge(track, i, -TRACK_W / 2, 0.02)), 24),
    new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  );
  road.receiveShadow = true;
  scene.add(road);

  // Paved runoff beside the kerbs, so the edge isn't a hard line on grass.
  const runoff = new THREE.MeshStandardMaterial({ color: look.night ? 0x2a2c30 : 0x6b6e66, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 });
  for (const side of [1, -1]) {
    const inner = loop.map((i) => edge(track, i, side * (TRACK_W / 2 + KERB_W), 0.012));
    const outer = loop.map((i) => edge(track, i, side * (TRACK_W / 2 + Math.min(3, (side > 0 ? track.roL : track.roR)[i])), 0.012));
    const m = new THREE.Mesh(side > 0 ? ribbon(inner, outer, 10) : ribbon(outer, inner, 10), runoff);
    m.receiveShadow = true;
    scene.add(m);
  }

  // Kerbs on the bends: red and white.
  const kerbTex = canvasTexture(32, 64, (ctx, w, h) => {
    ctx.fillStyle = "#d61f26";
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(0, h / 2, w, h / 2);
  }, [1, 1]);
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.7, side: THREE.DoubleSide });
  const bendy = (i) => Math.abs(track.k[i]) > 0.012;
  let i = 0;
  while (i < n) {
    if (!bendy(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && bendy(j)) j++;
    const run = [];
    for (let q = Math.max(0, i - 4); q <= Math.min(n - 1, j + 4); q++) run.push(q);
    if (run.length > 2) {
      for (const side of [1, -1]) {
        const a = run.map((q) => edge(track, q, side * (TRACK_W / 2), 0.035));
        const b = run.map((q) => edge(track, q, side * (TRACK_W / 2 + KERB_W), 0.035));
        scene.add(new THREE.Mesh(side > 0 ? ribbon(a, b, 3) : ribbon(b, a, 3), kerbMat));
      }
    }
    i = j + 1;
  }

  // Barriers with boards.
  const boards = canvasTexture(1024, 64, (ctx, w, h) => {
    const words = ["TUNR", "BOOSTED STUDIOS", "TUNR", "GEORGIA CAR MEETS"];
    const seg = w / words.length;
    words.forEach((word, k) => {
      ctx.fillStyle = k % 2 ? "#0A0A0A" : "#0080F0";
      ctx.fillRect(k * seg, 0, seg, h);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 34px 'Barlow Condensed', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(word, k * seg + seg / 2, h / 2 + 2);
    });
  }, [1, 1]);
  boards.wrapT = THREE.ClampToEdgeWrapping;
  // Boards on the face toward the track, plain grey on the back.
  const boardFace = (front) => new THREE.MeshStandardMaterial({ map: boards, roughness: 0.6, side: front ? THREE.FrontSide : THREE.BackSide });
  const plainBack = (front) => new THREE.MeshStandardMaterial({ color: 0x6f747c, roughness: 0.8, side: front ? THREE.BackSide : THREE.FrontSide });
  for (const side of [1, -1]) {
    const ro = side > 0 ? track.roL : track.roR;
    const bottom = loop.map((q) => edge(track, q, side * (TRACK_W / 2 + ro[q] + 0.3), 0));
    const top = loop.map((q) => edge(track, q, side * (TRACK_W / 2 + ro[q] + 0.3), 1.1));
    // Sideways along the wall: u runs along it (swap the uv roles).
    const g = ribbon(bottom, top, 40);
    const uvAttr = g.getAttribute("uv");
    for (let q = 0; q < uvAttr.count; q++) {
      const u = uvAttr.getX(q);
      const v = uvAttr.getY(q);
      // Seen from the track, one side's wall is the back of the strip:
      // run its lettering the other way so it reads right.
      uvAttr.setXY(q, side > 0 ? v : -v, u);
    }
    const front = side > 0;
    for (const m of [new THREE.Mesh(g, boardFace(front)), new THREE.Mesh(g, plainBack(front))]) {
      m.castShadow = true;
      scene.add(m);
    }
  }

  // Start line, gantry and lights.
  const checks = canvasTexture(128, 16, (ctx, w, h) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? "#111" : "#f5f5f5";
      ctx.fillRect((x * w) / 16, (y * h) / 2, w / 16, h / 2);
    }
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_W, 1.4), new THREE.MeshStandardMaterial({ map: checks, roughness: 0.8 }));
  line.rotation.set(-Math.PI / 2, track.heading[0], 0, "YXZ");
  line.position.set(track.x[0], 0.04, track.z[0]);
  scene.add(line);
  const gantry = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.6, roughness: 0.4 });
  for (const sx of [-1, 1]) gantry.add(box(0.4, 7, 0.4, metal, sx * (TRACK_W / 2 + 1.2), 3.5, 0));
  gantry.add(box(TRACK_W + 3, 0.9, 0.6, metal, 0, 6.6, 0));
  const lightMats = [];
  for (let k = 0; k < 5; k++) {
    const m = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000, roughness: 0.3 });
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), m);
    pod.position.set(-2.4 + k * 1.2, 6.6, 0.35);
    gantry.add(pod);
    lightMats.push(m);
  }
  gantry.position.set(track.x[0], 0, track.z[0]);
  gantry.rotation.y = track.heading[0];
  scene.add(gantry);

  // Grandstands along the start straight, on the roomier side.
  const crowd = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#30343c";
    ctx.fillRect(0, 0, w, h);
    const cols = ["#e11d2e", "#0080f0", "#facc15", "#f5f5f5", "#10b981", "#f97316", "#a855f7"];
    for (let y = 4; y < h; y += 8) for (let x = 2; x < w; x += 5) {
      ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      ctx.fillRect(x, y, 3, 4);
    }
  }, [1, 1]);
  const standMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.5, metalness: 0.3 });
  const side = track.roL[0] >= track.roR[0] ? 1 : -1;
  for (const back of [-70, -35, 0, 35]) {
    const q = ((Math.round(back / (track.L / n)) % n) + n) % n;
    const ro = (side > 0 ? track.roL : track.roR)[q];
    const p = edge(track, q, side * (TRACK_W / 2 + ro + 6), 0);
    // Built along x, stepping back along +z; turned so +z points away from
    // the track and x runs along it.
    const stand = new THREE.Group();
    for (let tier = 0; tier < 4; tier++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(30, 1.6, 3), standMat);
      t.position.set(0, 0.8 + tier * 1.6, tier * 2.4);
      stand.add(t);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(32, 0.3, 12), roofMat);
    roof.position.set(0, 9.2, 4);
    stand.add(roof);
    stand.position.set(p[0], 0, p[2]);
    const [hx, hz] = fwd(track.heading[q]);
    stand.rotation.y = Math.atan2(side * hz, -side * hx);
    scene.add(stand);
  }
  return { lightMats };
}

// Trees or city blocks around the circuit, kept clear of the track.
export function buildSurroundings(scene, track, look) {
  if (look.scenery === "none") return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.x[i]);
    maxX = Math.max(maxX, track.x[i]);
    minZ = Math.min(minZ, track.z[i]);
    maxZ = Math.max(maxZ, track.z[i]);
  }
  const clear = (px, pz, need) => {
    for (let i = 0; i < track.n; i += 3) {
      const ro = Math.max(track.roL[i], track.roR[i]);
      if (Math.hypot(px - track.x[i], pz - track.z[i]) < TRACK_W / 2 + ro + need) return false;
    }
    return true;
  };
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const spots = [];
  for (let k = 0; k < 2600 && spots.length < (look.scenery === "city" ? 140 : 420); k++) {
    const px = minX - 120 + rand() * (maxX - minX + 240);
    const pz = minZ - 120 + rand() * (maxZ - minZ + 240);
    if (clear(px, pz, look.scenery === "city" ? 14 : 5)) spots.push([px, pz]);
  }
  const m = new THREE.Matrix4();
  if (look.scenery === "trees") {
    const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 8, 7), new THREE.MeshStandardMaterial({ color: 0x2c5a26, roughness: 0.9, flatShading: true }), spots.length);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), new THREE.MeshStandardMaterial({ color: 0x5a3b22 }), spots.length);
    spots.forEach(([px, pz], k) => {
      const s = 0.7 + rand() * 0.8;
      m.makeScale(s, s, s).setPosition(px, 5 * s, pz);
      leaves.setMatrixAt(k, m);
      m.makeScale(s, s, s).setPosition(px, 1 * s, pz);
      trunks.setMatrixAt(k, m);
    });
    scene.add(leaves, trunks);
  } else {
    const windows = canvasTexture(64, 128, (ctx, w, h) => {
      ctx.fillStyle = look.night ? "#141821" : "#5b6573";
      ctx.fillRect(0, 0, w, h);
      for (let y = 4; y < h - 4; y += 8) for (let x = 4; x < w - 4; x += 8) {
        const on = Math.random() < (look.night ? 0.45 : 0.15);
        ctx.fillStyle = on ? (look.night ? "#ffd27a" : "#cfe3f5") : look.night ? "#1f2530" : "#465060";
        ctx.fillRect(x, y, 4, 5);
      }
    }, [2, 3]);
    const mat = new THREE.MeshStandardMaterial({ map: windows, roughness: 0.6, emissive: look.night ? 0xffffff : 0x000000, emissiveMap: look.night ? windows : null, emissiveIntensity: look.night ? 0.6 : 0 });
    const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, spots.length);
    spots.forEach(([px, pz], k) => {
      const w = 10 + rand() * 14;
      const h = 12 + rand() * 50;
      m.makeScale(w, h, w).setPosition(px, h / 2, pz);
      blocks.setMatrixAt(k, m);
    });
    scene.add(blocks);
  }
}

// ---------- the scene ----------

// Where the guide line runs: toward the inside of each corner, more so the
// tighter it is. Left of centre (side > 0) for a left turn.
function guideOffsets(track) {
  const { n, k } = track;
  const out = new Float32Array(n);
  const W = 10;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -W; j <= W; j++) sum += k[(i + j + n) % n];
    out[i] = Math.max(-3.6, Math.min(3.6, (sum / (2 * W + 1)) * 110));
  }
  return out;
}

const GUIDE_PTS = 60;
const GREEN = [0.13, 0.77, 0.37];
const YELLOW = [0.98, 0.8, 0.08];
const RED = [0.94, 0.27, 0.27];

function buildGuide(scene) {
  const pos = new Float32Array(GUIDE_PTS * 2 * 3);
  const col = new Float32Array(GUIDE_PTS * 2 * 4);
  const index = [];
  for (let i = 0; i < GUIDE_PTS - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(index);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false, toneMapped: false })
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return mesh;
}

// playerLook: your own car from your garage ({ color, body, spoiler, rims,
// height }), drawn instead of a race car.
export function createF1Scene(canvas, race, { view = "chase", lowPower = false, guide = true, playerLook = null } = {}) {
  const track = race.track;
  const look = LOOKS[TRACK_LOOK[track.id] || "day"];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = look.night ? 1.15 : 0.95;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const skyTex = canvasTexture(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, look.sky[0]);
    g.addColorStop(0.5, look.sky[1]);
    g.addColorStop(1, look.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  scene.background = skyTex;
  scene.fog = new THREE.Fog(new THREE.Color(look.sky[1]), 250, 1400);

  scene.add(new THREE.HemisphereLight(look.night ? 0x8a93c8 : 0xdbe8ff, look.night ? 0x202028 : 0x5a5040, look.night ? 1.4 : 1.1));
  const sun = new THREE.DirectionalLight(look.night ? 0xe8eeff : 0xfff2dd, look.night ? 1.2 : 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 200 });
  scene.add(sun, sun.target);

  const groundTex = canvasTexture(256, 256, (ctx, w, h) => speckle(ctx, w, h, look.ground, 26, 9000, 2), [200, 200]);
  // Pushed back in the depth test so the track always draws over it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const { lightMats } = buildCircuit(scene, track, look);
  buildSurroundings(scene, track, look);

  // The cars.
  const meshes = race.cars.map((c) => {
    let m;
    if (c.ai) m = buildCar(race.car, c.color, c.accent);
    else if (playerLook) {
      m = buildRoadCar({ ...playerLook, plate: "TUNR", sport: true });
      m.traverse((o) => o.isMesh && (o.castShadow = true));
    } else m = buildCar(race.car, "#0080F0", "#F5F5F5");
    scene.add(m);
    return m;
  });
  const me = meshes[race.cars.indexOf(race.player)];
  // Eye height in the cockpit view: higher in a tall road car.
  const eyeY = playerLook ? (playerLook.body === "truck" || playerLook.body === "suv" ? 1.6 : 1.15) : 1.1;

  // Tyre smoke: a small pool of soft puffs.
  const puffTex = canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(235,235,240,0.9)");
    g.addColorStop(1, "rgba(235,235,240,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  const puffs = [];
  for (let k = 0; k < 48; k++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
    sp.visible = false;
    scene.add(sp);
    puffs.push({ sp, life: 0, max: 1 });
  }
  let nextPuff = 0;

  // Boosted Studios coins, spinning above the track.
  const coinTex = new THREE.TextureLoader().load("/game/boost.webp");
  coinTex.colorSpace = THREE.SRGBColorSpace;
  const coinFace = new THREE.MeshBasicMaterial({ map: coinTex, transparent: true });
  const coinEdge = new THREE.MeshStandardMaterial({ color: 0x0080f0, emissive: 0x38bdf8, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.2 });
  const coinGeo = new THREE.CylinderGeometry(1.15, 1.15, 0.16, 40).rotateX(Math.PI / 2);
  const coins = race.coins.map((c) => {
    const m = new THREE.Mesh(coinGeo, [coinEdge, coinFace, coinFace]);
    m.position.set(c.x, 1.35, c.z);
    scene.add(m);
    return m;
  });
  let spin = 0;
  let fovNow = 60;

  const guideMesh = buildGuide(scene);
  const guideOff = guideOffsets(track);
  guideMesh.visible = guide;

  // Redraw the guide line from just ahead of the car, coloured for your speed.
  function updateGuide(race) {
    const p = race.player;
    const { n, x, z, heading, s: dist, L } = track;
    const pos = guideMesh.geometry.attributes.position.array;
    const col = guideMesh.geometry.attributes.color.array;
    const v = Math.abs(p.speed);
    const start = (p.idx + 2) % n;
    for (let k = 0; k < GUIDE_PTS; k++) {
      const i = (start + k) % n;
      const [fx, fz] = fwd(heading[i]);
      const o = guideOff[i];
      const half = 0.5;
      for (const [m, w] of [
        [0, o + half],
        [1, o - half],
      ]) {
        const at = (k * 2 + m) * 3;
        pos[at] = x[i] + fz * w;
        pos[at + 1] = 0.04;
        pos[at + 2] = z[i] - fx * w;
      }
      // How hard you'd have to brake from here to take this point.
      let d = dist[i] - dist[p.idx];
      if (d < 0) d += L;
      const target = race.profile[i];
      const need = v > target ? (v * v - target * target) / (2 * Math.max(d, 1)) : 0;
      const c = need === 0 ? GREEN : need > BRAKE * 0.45 ? RED : YELLOW;
      const alpha = 0.85 * Math.min(1, k / 4) * Math.min(1, (GUIDE_PTS - 1 - k) / 14);
      for (let m = 0; m < 2; m++) {
        const at = (k * 2 + m) * 4;
        col[at] = c[0];
        col[at + 1] = c[1];
        col[at + 2] = c[2];
        col[at + 3] = alpha;
      }
    }
    guideMesh.geometry.attributes.position.needsUpdate = true;
    guideMesh.geometry.attributes.color.needsUpdate = true;
  }

  const camera = new THREE.PerspectiveCamera(60, 1, 0.12, 3000);
  let mode = view;
  const cam = { x: race.player.x, y: 5, z: race.player.z, h: race.player.heading };

  function setView(v) {
    mode = v;
    // Hide the driver and cabin from inside; your own road car has none to hide.
    if (me.userData.driver) me.userData.driver.visible = v !== "cockpit";
    if (me.userData.steeringWheel) me.userData.steeringWheel.visible = v === "cockpit";
  }
  setView(view);

  function setGuide(on) {
    guideMesh.visible = on;
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function placeCar(m, c, dt) {
    m.position.set(c.x, 0, c.z);
    m.rotation.y = c.heading;
    const speed = c.ai ? c.v : c.speed;
    const steer = c.ai ? 0 : c.steer;
    for (const f of m.userData.front || []) f.rotation.y = steer * 0.4;
    for (const w of m.userData.wheels || []) w.rotation.x -= (speed * dt) / 0.36;
  }

  function render(race, dt) {
    race.cars.forEach((c, k) => placeCar(meshes[k], c, dt));
    const p = race.player;

    // Start lights: on one by one, all out at the go.
    const lit = race.state === "countdown" ? Math.min(5, Math.floor((race.time + 3) / 0.55) + 1) : 0;
    lightMats.forEach((m, k) => {
      const on = k < lit;
      m.color.set(on ? 0xff1a1a : 0x220000);
      m.emissive.set(on ? 0xff0000 : 0x000000);
      m.emissiveIntensity = on ? 2.5 : 0;
    });

    // Smoke from the rear wheels while sliding.
    if (p.slip > 0.14 && Math.abs(p.speed) > 10) {
      const [fx, fz] = fwd(p.heading);
      for (const sx of [-0.8, 0.8]) {
        const puff = puffs[nextPuff];
        nextPuff = (nextPuff + 1) % puffs.length;
        puff.life = 0;
        puff.max = 0.6 + Math.random() * 0.5;
        puff.sp.visible = true;
        puff.sp.position.set(p.x - fx * 1.7 + fz * sx, 0.4, p.z - fz * 1.7 - fx * sx);
      }
    }
    for (const puff of puffs) {
      if (!puff.sp.visible) continue;
      puff.life += dt;
      const t = puff.life / puff.max;
      if (t >= 1) {
        puff.sp.visible = false;
        continue;
      }
      puff.sp.material.opacity = 0.55 * (1 - t);
      const size = 1.2 + t * 4;
      puff.sp.scale.set(size, size, 1);
      puff.sp.position.y += dt * 0.8;
    }

    if (guideMesh.visible) updateGuide(race);
    spin += dt * 3;
    coins.forEach((m, k) => {
      m.visible = race.coins[k].takenLap !== p.lap;
      m.rotation.y = spin;
      m.position.y = 1.5 + Math.sin(spin * 0.8 + k) * 0.15;
    });
    const boosting = p.boost > 0;

    // Camera.
    const [fx, fz] = fwd(p.heading);
    if (mode === "cockpit") {
      // At the driver's eyes, looking down the nose.
      camera.fov = 70;
      camera.up.set(0, 1, 0);
      camera.position.set(p.x + fx * 0.45, eyeY, p.z + fz * 0.45);
      camera.lookAt(p.x + fx * 22, eyeY - 0.55, p.z + fz * 22);
    } else if (mode === "top") {
      // High and behind, tipped forward: you see well down the road, the
      // way arcade taxi games do. Pulls back a little with speed.
      camera.fov = boosting ? 66 : 58;
      camera.up.set(0, 1, 0);
      cam.h += Math.atan2(Math.sin(p.heading - cam.h), Math.cos(p.heading - cam.h)) * Math.min(1, dt * 3.5);
      const [cx, cz] = fwd(cam.h);
      const back = 14 + Math.abs(p.speed) * 0.05;
      cam.y += (13 + Math.abs(p.speed) * 0.04 - cam.y) * Math.min(1, dt * 2);
      camera.position.set(p.x - cx * back, cam.y, p.z - cz * back);
      camera.lookAt(p.x + cx * 10, 0, p.z + cz * 10);
    } else {
      camera.fov = 62 + Math.min(12, Math.abs(p.speed) * 0.12) + (boosting ? 8 : 0);
      camera.up.set(0, 1, 0);
      // Trails the car's heading a little, so drifts show.
      cam.h += Math.atan2(Math.sin(p.heading - cam.h), Math.cos(p.heading - cam.h)) * Math.min(1, dt * 5);
      const [cx, cz] = fwd(cam.h);
      // The closed cars are bigger: sit a little further back and up.
      const back = race.car === "formula" ? 8.5 : 10;
      camera.position.set(p.x - cx * back, race.car === "formula" ? 3.1 : 3.6, p.z - cz * back);
      camera.lookAt(p.x + cx * 6, 1.0, p.z + cz * 6);
    }
    // Ease the zoom (a boost widens it), rather than jumping.
    fovNow += (camera.fov - fovNow) * Math.min(1, dt * 5 || 1);
    camera.fov = fovNow;
    camera.updateProjectionMatrix();
    sun.target.position.set(p.x, 0, p.z);
    sun.position.set(p.x + 40, 80, p.z + 25);
    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
    scene.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mm) => {
          mm.map?.dispose?.();
          mm.dispose?.();
        });
      }
    });
  }

  return { render, setView, setGuide, resize, dispose };
}

