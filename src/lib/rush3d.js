// TUNR Rush in 3D (three.js). Same game as rushEngine.js — only the
// drawing changes: real lighting, shadows and reflective paint on a desert
// highway. Every model here is built in code (no downloaded models), so
// there's nothing to license. Loaded only when 3D graphics are on.
import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { drawHud } from "./rushEngine.js";

const LANE_W = 3.6; // meters between lane centers
const DEPTH = 190; // meters of road ahead, matching the engine's 0..1 z
const PLAYER_Z = -7; // where your car sits; obstacles hit around here
const LOOP = 420; // scenery repeats every this many meters

// ---------- textures drawn in code ----------

function canvasTexture(w, h, draw, { repeat = null } = {}) {
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

function speckle(ctx, w, h, base, spread, count, size = 1) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(Math.random() * spread * 2 - spread);
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

// One 24 m tile of 3-lane asphalt: grainy, with tire-worn lanes, dashed
// lane lines and solid edge lines.
const ROAD_TILE = 24;
function roadTexture() {
  return canvasTexture(
    512,
    1024,
    (ctx, w, h) => {
      speckle(ctx, w, h, "#3b3d42", 40, 60000);
      // Darker tire tracks in each lane.
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let lane = 0; lane < 3; lane++) {
        const cx = w * (0.2 + lane * 0.3);
        ctx.fillRect(cx - w * 0.08, 0, w * 0.04, h);
        ctx.fillRect(cx + w * 0.04, 0, w * 0.04, h);
      }
      // Edge lines.
      ctx.fillStyle = "#e8e4d8";
      ctx.fillRect(w * 0.035, 0, w * 0.018, h);
      ctx.fillRect(w * 0.947, 0, w * 0.018, h);
      // Dashed lane lines: 3 m dash, 9 m gap.
      for (const x of [0.35, 0.65]) {
        ctx.fillRect(w * x - w * 0.009, 0, w * 0.018, h * 0.125);
        ctx.fillRect(w * x - w * 0.009, h * 0.5, w * 0.018, h * 0.125);
      }
      // A few patches and cracks.
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        let x = Math.random() * w;
        let y = Math.random() * h;
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) ctx.lineTo((x += Math.random() * 30 - 15), (y += Math.random() * 30));
        ctx.stroke();
      }
    },
    { repeat: [1, 1] }
  );
}

function sandTexture() {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      speckle(ctx, w, h, "#d8b27a", 30, 50000, 2);
      ctx.fillStyle = "rgba(120,80,40,0.08)";
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 6 + Math.random() * 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeat: [30, 30] }
  );
}

function plateTexture(text) {
  return canvasTexture(256, 56, (ctx, w, h) => {
    ctx.fillStyle = "#f4f6f8";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1e3a8a";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = "#111";
    ctx.font = "800 36px 'Barlow Condensed', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(text || "TUNR").slice(0, 9).toUpperCase(), w / 2, h / 2 + 2, w - 16);
  });
}

// ---------- the cars ----------

// Size and shape per body, in meters. u runs along the car (front +),
// v is height. glass*/roof* mark the greenhouse.
const SHAPES = {
  coupe: { L: 4.45, W: 1.9, clear: 0.16, belt: 0.86, deck: 0.9, roof: 1.27, glassRear: -1.45, roofRear: -0.45, roofFront: 0.25, glassFront: 1.05, cabinW: 0.78 },
  sedan: { L: 4.7, W: 1.86, clear: 0.17, belt: 0.92, deck: 0.98, roof: 1.42, glassRear: -1.35, roofRear: -0.6, roofFront: 0.35, glassFront: 1.15, cabinW: 0.8 },
  hatch: { L: 4.2, W: 1.82, clear: 0.17, belt: 0.95, deck: 1.0, roof: 1.48, glassRear: -1.95, roofRear: -1.7, roofFront: 0.3, glassFront: 1.0, cabinW: 0.8 },
  suv: { L: 4.7, W: 1.95, clear: 0.24, belt: 1.12, deck: 1.15, roof: 1.75, glassRear: -2.2, roofRear: -2.0, roofFront: 0.5, glassFront: 1.25, cabinW: 0.86 },
  truck: { L: 5.5, W: 2.0, clear: 0.28, belt: 1.15, deck: 1.15, roof: 1.9, glassRear: -0.35, roofRear: -0.3, roofFront: 0.9, glassFront: 1.55, cabinW: 0.86 },
};

const geoCache = new Map();
function extrude(shape, depth, bevel) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 5,
    curveSegments: 18,
  });
  // Shape x is along the car, extruded across its width: turn it so the
  // car points down -z (away from the camera).
  geo.translate(0, 0, -(depth - bevel * 2) / 2);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function bodyGeometries(body) {
  if (geoCache.has(body)) return geoCache.get(body);
  const s = SHAPES[body] || SHAPES.coupe;
  const half = s.L / 2;
  const wheelR = body === "truck" || body === "suv" ? 0.4 : 0.34;
  const axle = half - (body === "truck" ? 1.05 : 0.88);

  // Lower body, with wheel arches cut out of the bottom edge.
  const lower = new THREE.Shape();
  const bottom = s.clear + 0.1;
  lower.moveTo(-half + 0.05, bottom);
  lower.lineTo(-half - 0.02, bottom + 0.25);
  lower.quadraticCurveTo(-half - 0.06, s.deck - 0.05, -half + 0.12, s.deck);
  lower.lineTo(s.glassRear - 0.05, s.deck + 0.02);
  lower.lineTo(s.glassFront + 0.1, s.belt + 0.02);
  lower.quadraticCurveTo(half - 0.1, s.belt - 0.08, half, s.belt - 0.2);
  lower.lineTo(half + 0.03, bottom + 0.15);
  lower.lineTo(half - 0.1, bottom);
  lower.lineTo(axle + wheelR + 0.08, bottom);
  lower.absarc(axle, wheelR, wheelR + 0.08, 0, Math.PI, false);
  lower.lineTo(-axle + wheelR + 0.08, bottom);
  lower.absarc(-axle, wheelR, wheelR + 0.08, 0, Math.PI, false);
  lower.lineTo(-half + 0.05, bottom);

  // Greenhouse (glass) and the painted roof on top of it.
  const cabin = new THREE.Shape();
  cabin.moveTo(s.glassRear, s.deck - 0.02);
  cabin.quadraticCurveTo(s.roofRear - 0.05, s.roof - 0.02, s.roofRear + 0.15, s.roof);
  cabin.lineTo(s.roofFront - 0.1, s.roof);
  cabin.quadraticCurveTo(s.roofFront + 0.1, s.roof - 0.02, s.glassFront, s.belt);
  cabin.lineTo(s.glassRear, s.deck - 0.02);

  const roof = new THREE.Shape();
  roof.moveTo(s.roofRear - 0.02, s.roof - 0.05);
  roof.quadraticCurveTo(s.roofRear + 0.05, s.roof + 0.03, s.roofRear + 0.25, s.roof + 0.035);
  roof.lineTo(s.roofFront - 0.2, s.roof + 0.035);
  roof.quadraticCurveTo(s.roofFront, s.roof + 0.03, s.roofFront + 0.08, s.roof - 0.05);
  roof.lineTo(s.roofRear - 0.02, s.roof - 0.05);

  const geos = {
    s,
    wheelR,
    axle,
    lower: extrude(lower, s.W, 0.14),
    cabin: extrude(cabin, s.W * s.cabinW, 0.1),
    roof: extrude(roof, s.W * s.cabinW - 0.04, 0.05),
    tire: new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 28).rotateZ(Math.PI / 2),
    rim: new THREE.CylinderGeometry(wheelR * 0.68, wheelR * 0.68, 0.02, 24).rotateZ(Math.PI / 2),
  };
  // Truck: an open bed behind the cab.
  if (body === "truck") {
    const bedLen = half + s.glassRear - 0.15;
    geos.bedFloor = new THREE.BoxGeometry(s.W - 0.24, 0.06, bedLen);
    geos.bedZ = half - bedLen / 2 - 0.05;
  }
  geoCache.set(body, geos);
  return geos;
}

const MAT = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0e16, metalness: 0.1, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.55, metalness: 0.2 }),
  carbon: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.35, metalness: 0.4 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.18, metalness: 1 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.08, metalness: 1 }),
  hole: new THREE.MeshBasicMaterial({ color: 0x050505 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a1a, emissiveIntensity: 2.2, roughness: 0.3 }),
  tailDim: new THREE.MeshStandardMaterial({ color: 0x5a0a0a, emissive: 0xff2020, emissiveIntensity: 0.6, roughness: 0.2 }),
  shadow: null,
};

const paintCache = new Map();
function paint(color) {
  if (!paintCache.has(color)) {
    paintCache.set(
      color,
      new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 })
    );
  }
  return paintCache.get(color);
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

// A whole car: body, glass, roof, wheels, lights, plate, bumper. `sport`
// is your car (diffuser, quad exhaust, spoiler); traffic stays plain.
export function buildCar({ color = "#FF4500", body = "coupe", plate = "", sport = false, spoiler = "lip" }) {
  const g = bodyGeometries(body);
  const s = g.s;
  const half = s.L / 2;
  const car = new THREE.Group();
  const paintMat = paint(color);

  const lower = new THREE.Mesh(g.lower, paintMat);
  const cabin = new THREE.Mesh(g.cabin, MAT.glass);
  const roof = new THREE.Mesh(g.roof, paintMat);
  for (const m of [lower, cabin, roof]) {
    m.castShadow = true;
    car.add(m);
  }

  // Wheels.
  for (const z of [-g.axle, g.axle]) {
    for (const side of [-1, 1]) {
      const tire = new THREE.Mesh(g.tire, MAT.tire);
      tire.position.set(side * (s.W / 2 - 0.16), g.wheelR, z);
      tire.castShadow = true;
      car.add(tire);
      const rim = new THREE.Mesh(g.rim, MAT.rim);
      rim.position.set(side * (s.W / 2 - 0.02), g.wheelR, z);
      car.add(rim);
    }
  }

  const rear = half + 0.19; // the back face (the body's rounded edge sticks out past half)
  if (body === "truck") {
    const bed = new THREE.Mesh(g.bedFloor, MAT.trim);
    bed.position.set(0, s.deck - 0.02, g.bedZ);
    car.add(bed);
    car.add(box(s.W - 0.1, 0.05, 0.08, MAT.trim, 0, s.deck + 0.02, rear - 0.12)); // tailgate cap
    for (const side of [-1, 1]) car.add(box(0.1, 0.42, 0.06, MAT.tail, side * (s.W / 2 - 0.02), s.deck - 0.28, rear - 0.05));
  } else {
    // Slim LED tail lights joined by a light bar.
    const ty = s.deck - 0.13;
    for (const side of [-1, 1]) {
      const light = box(0.48, 0.075, 0.04, MAT.tail, side * (s.W / 2 - 0.3), ty, rear);
      light.rotation.z = side * -0.06;
      car.add(light);
    }
    car.add(box(s.W - 1.15, 0.022, 0.03, MAT.tailDim, 0, ty + 0.01, rear));
  }
  // Third brake light at the top of the rear glass.
  car.add(box(0.36, 0.03, 0.03, MAT.tail, 0, s.roof - 0.06, -s.roofRear + 0.06));

  // Plate.
  if (plate) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.114), new THREE.MeshStandardMaterial({ map: plateTexture(plate), roughness: 0.4 }));
    p.position.set(0, s.clear + 0.42, rear + 0.005);
    car.add(p);
  } else {
    car.add(box(0.52, 0.114, 0.01, new THREE.MeshStandardMaterial({ color: 0xf1f1f1, roughness: 0.5 }), 0, s.clear + 0.42, rear));
  }

  // Lower bumper.
  const by = s.clear + 0.2;
  if (sport) {
    car.add(box(s.W - 0.45, 0.17, 0.2, MAT.carbon, 0, by, rear - 0.05));
    for (let f = -2; f <= 2; f++) car.add(box(0.025, 0.14, 0.24, MAT.trim, f * 0.13, by, rear - 0.03));
    for (const x of [-0.62, -0.47, 0.47, 0.62]) {
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.18, 20).rotateX(Math.PI / 2), MAT.chrome);
      tip.position.set(x, by - 0.02, rear + 0.04);
      car.add(tip);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.042, 18), MAT.hole);
      hole.position.set(x, by - 0.02, rear + 0.135);
      car.add(hole);
    }
  } else {
    car.add(box(s.W - 0.5, 0.12, 0.16, MAT.trim, 0, by, rear - 0.06));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 16).rotateX(Math.PI / 2), MAT.chrome);
    tip.position.set(-0.55, by - 0.03, rear + 0.02);
    car.add(tip);
  }

  // Mirrors.
  for (const side of [-1, 1]) {
    const m = box(0.16, 0.1, 0.12, paintMat, side * (s.W * s.cabinW) / 2 + side * 0.1, s.belt + 0.1, -(s.glassFront - 0.25));
    m.castShadow = true;
    car.add(m);
  }

  // Spoiler.
  if (sport && body !== "truck") {
    if (spoiler === "wing") {
      const wy = s.deck + 0.32;
      const wz = half - 0.28;
      car.add(box(s.W - 0.1, 0.035, 0.32, MAT.carbon, 0, wy, wz));
      for (const side of [-1, 1]) {
        car.add(box(0.05, 0.3, 0.12, MAT.carbon, side * 0.5, wy - 0.16, wz));
        car.add(box(0.02, 0.16, 0.36, MAT.carbon, side * (s.W / 2 - 0.05), wy + 0.04, wz));
      }
    } else if (spoiler === "lip") {
      if (body === "hatch" || body === "suv") {
        car.add(box(s.W * s.cabinW, 0.04, 0.3, MAT.carbon, 0, s.roof + 0.03, -s.roofRear + 0.1));
      } else {
        car.add(box(s.W - 0.5, 0.05, 0.12, MAT.carbon, 0, s.deck + 0.05, half - 0.05));
      }
    }
  }

  // Soft contact shadow under the car.
  if (!MAT.shadow) {
    MAT.shadow = new THREE.MeshBasicMaterial({
      map: canvasTexture(128, 128, (ctx, w, h) => {
        const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grad.addColorStop(0, "rgba(0,0,0,0.55)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false,
    });
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(s.W * 1.35, s.L * 1.15), MAT.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.06;
  car.add(shadow);

  car.userData.rear = rear;
  car.userData.exhaustY = by - 0.02;
  return car;
}

// ---------- other things on the road ----------

function buildCone() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 20), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6 }));
  cone.position.y = 0.4;
  cone.castShadow = true;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.155, 0.12, 20), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 }));
  band.position.y = 0.48;
  const base = box(0.5, 0.04, 0.5, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }), 0, 0.02, 0);
  g.add(cone, band, base);
  return g;
}

function buildBarrel() {
  const tex = canvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = "#ff6a00";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f5f5f5";
    for (const y of [0.22, 0.52]) ctx.fillRect(0, h * y, w, h * 0.14);
  });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 1.05, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  m.position.y = 0.53;
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function buildPickup(kind, art) {
  const g = new THREE.Group();
  if (kind === "boost") {
    let face = new THREE.MeshBasicMaterial({ color: 0x1d4ed8 });
    if (art.boost) {
      const tex = new THREE.Texture(art.boost);
      tex.colorSpace = THREE.SRGBColorSpace;
      if (art.boost.complete) tex.needsUpdate = true;
      else art.boost.addEventListener("load", () => (tex.needsUpdate = true));
      face = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    }
    const edge = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, emissive: 0x38bdf8, emissiveIntensity: 1.5, metalness: 0.6, roughness: 0.2 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 40).rotateX(Math.PI / 2), [edge, face, face]);
    coin.position.y = 1.3;
    g.add(coin);
    const glow = new THREE.PointLight(0x38bdf8, 6, 7, 2);
    glow.position.y = 1.3;
    g.add(glow);
    g.userData.spin = coin;
  } else {
    const tex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w / 2 - 20, 0, Math.PI * 2);
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w / 2, 34);
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w / 2 + 24, h / 2 + 10);
      ctx.stroke();
    });
    const face = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const edge = new THREE.MeshStandardMaterial({ color: 0xca8a04, emissive: 0xfacc15, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 32).rotateX(Math.PI / 2), [edge, face, face]);
    coin.position.y = 1.1;
    g.add(coin);
    g.userData.spin = coin;
  }
  return g;
}

function buildCactus(rand) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 0.85 });
  const g = new THREE.Group();
  const h = 2.5 + rand() * 3;
  const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, h, 6, 12), mat);
  trunk.position.y = h / 2 + 0.28;
  trunk.castShadow = true;
  g.add(trunk);
  for (const side of [-1, 1]) {
    if (rand() < 0.3) continue;
    const ay = h * (0.35 + rand() * 0.3);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.7, 6, 10), mat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(side * 0.55, ay, 0);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.9 + rand(), 6, 10), mat);
    up.position.set(side * 0.9, ay + 0.6, 0);
    g.add(arm, up);
  }
  return g;
}

function buildRock(rand) {
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.6 + rand() * 1.4, 0),
    new THREE.MeshStandardMaterial({ color: 0x9a6a44, roughness: 0.95, flatShading: true })
  );
  m.scale.y = 0.55;
  m.rotation.y = rand() * 6;
  m.castShadow = true;
  return m;
}

// ---------- the scene ----------

// Lighting for each day's look (rushEngine.js THEMES).
const LIGHT = {
  noon: { turbidity: 3.5, rayleigh: 2.6, env: ["#3d78c2", "#a9c8e6", "#f1dcc0"], fog: 0xd9c7a8, sun: 0xfff1d6, sunPower: 2.6, sky: 0.7, exposure: 0.9 },
  golden: { turbidity: 6, rayleigh: 2, env: ["#5a7fb8", "#f6c38a", "#ffd39a"], fog: 0xe6b98d, sun: 0xffbe7a, sunPower: 2.5, sky: 0.6, exposure: 0.85 },
  dusk: { turbidity: 9, rayleigh: 3.5, env: ["#2b2d6b", "#a46a9c", "#f3a6a0"], fog: 0x8f6f8c, sun: 0xff9476, sunPower: 1.7, sky: 0.55, exposure: 0.95 },
};

// opts: { reflections, shadows } — both on by default; off is lighter for
// older phones. theme: the day's look.
export function createRush3D(glCanvas, hudCanvas, W, H, me, art = {}, opts = {}) {
  const { reflections = true, shadows = true, theme = { id: "noon", sun: 58 } } = opts;
  const L = LIGHT[theme.id] || LIGHT.noon;
  const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = L.exposure;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.5, 900);

  // The day's desert sky, which also lights the paint's reflections.
  const sky = new Sky();
  sky.scale.setScalar(10000);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - theme.sun), THREE.MathUtils.degToRad(155));
  sky.material.uniforms.turbidity.value = L.turbidity;
  sky.material.uniforms.rayleigh.value = L.rayleigh;
  sky.material.uniforms.mieCoefficient.value = 0.003;
  sky.material.uniforms.mieDirectionalG.value = 0.82;
  sky.material.uniforms.sunPosition.value.copy(sun);
  scene.add(sky);
  // Reflections come from a simple painted sky (blue overhead, warm haze at
  // the horizon, sand below, a bright sun) rather than the sky shader,
  // whose very bright values can break the lighting on some phones.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envTex = canvasTexture(16, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, L.env[0]);
    grad.addColorStop(0.42, L.env[1]);
    grad.addColorStop(0.5, L.env[2]);
    grad.addColorStop(0.53, "#b8946a");
    grad.addColorStop(1, "#6e5338");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide })));
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.4, 4.5) }));
  sunDisc.position.copy(sun).multiplyScalar(40);
  envScene.add(sunDisc);
  const envMap = reflections ? pmrem.fromScene(envScene, 0.02).texture : null;
  scene.environment = envMap;
  scene.fog = new THREE.Fog(L.fog, 140, 560);

  const sunLight = new THREE.DirectionalLight(L.sun, L.sunPower);
  sunLight.position.copy(sun).multiplyScalar(80);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunLight.shadow.camera, { left: -14, right: 14, top: 40, bottom: -40, near: 1, far: 200 });
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight, sunLight.target);
  scene.add(new THREE.HemisphereLight(0xbcd6ff, 0xc9a06a, L.sky));

  // Road and desert.
  const roadTex = roadTexture();
  const roadLen = 1000;
  roadTex.repeat.set(1, roadLen / ROAD_TILE);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W * 3 + 2.2, roadLen), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.04, -roadLen / 2 + 30);
  road.receiveShadow = true;
  scene.add(road);
  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 1 });
  for (const side of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, roadLen), shoulderMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(side * (LANE_W * 1.5 + 1.1 + 1.25), 0.02, -roadLen / 2 + 30);
    sh.receiveShadow = true;
    scene.add(sh);
  }
  const sandTex = sandTexture();
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.z = -500;
  sand.receiveShadow = true;
  scene.add(sand);

  // Distant mesas.
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mesaMat = new THREE.MeshStandardMaterial({ color: 0xb07a4f, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const r = 30 + rand() * 60;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * (0.5 + rand() * 0.3), r, 18 + rand() * 40, 7), mesaMat);
    const side = i % 2 ? 1 : -1;
    m.position.set(side * (90 + rand() * 260), 8, -420 - rand() * 280);
    scene.add(m);
  }

  // Roadside scenery that loops past.
  const scenery = [];
  for (let i = 0; i < 26; i++) {
    const item = rand() < 0.6 ? buildCactus(rand) : buildRock(rand);
    const side = rand() < 0.5 ? -1 : 1;
    item.position.x = side * (LANE_W * 1.5 + 4 + rand() * 30);
    item.userData.base = rand() * LOOP;
    scene.add(item);
    scenery.push(item);
  }

  // Your car, plus the boost flames and their light.
  let player = null;
  let look = null;
  function setMe(next) {
    const key = JSON.stringify(next);
    if (key === look) return;
    look = key;
    if (player) scene.remove(player);
    player = buildCar({ ...next, sport: true });
    scene.add(player);
  }
  setMe(me);

  // The ghost: your car, see-through, with its own materials.
  let ghostCar = null;
  function makeGhost() {
    ghostCar = buildCar({ ...me, plate: "GHOST", sport: true });
    ghostCar.traverse((o) => {
      if (!o.isMesh) return;
      const swap = (m) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0.35;
        c.depthWrite = false;
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      o.castShadow = false;
    });
    scene.add(ghostCar);
  }

  const flameOuter = new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameInner = new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameGeo = new THREE.ConeGeometry(0.11, 1, 16, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
  const flames = [];
  for (const x of [-0.55, 0.55]) {
    const outer = new THREE.Mesh(flameGeo, flameOuter);
    const inner = new THREE.Mesh(flameGeo, flameInner);
    inner.scale.set(0.5, 0.5, 0.6);
    outer.add(inner);
    outer.userData.x = x;
    scene.add(outer);
    flames.push(outer);
  }
  const boostLight = new THREE.PointLight(0x3b82f6, 0, 9, 2);
  scene.add(boostLight);

  // Traffic and pickups: one mesh per engine object.
  const meshes = new Map();
  function meshFor(o) {
    let m = meshes.get(o);
    if (m) return m;
    if (o.kind === "car") m = buildCar({ color: o.color, body: o.body });
    else if (o.kind === "cone") m = buildCone();
    else if (o.kind === "barrel") m = buildBarrel();
    else m = buildPickup(o.kind, art);
    scene.add(m);
    meshes.set(o, m);
    return m;
  }

  const hud = hudCanvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  hudCanvas.width = W * dpr;
  hudCanvas.height = H * dpr;
  hud.scale(dpr, dpr);

  let camX = 0;
  let fov = 58;

  function render(g, ghost = null) {
    const boosting = g.boostT > 0;
    if (ghost && !ghostCar) makeGhost();
    if (ghostCar) {
      const ahead = ghost ? ghost.dist - g.dist : 0;
      ghostCar.visible = Boolean(ghost) && ahead > 2 && ahead < DEPTH;
      ghostCar.position.set(ghost ? (ghost.laneX - 1) * LANE_W : 0, 0, PLAYER_Z - ahead);
    }
    const px = (g.laneX - 1) * LANE_W;

    // Road and scenery scroll with distance.
    roadTex.offset.y = (g.dist / ROAD_TILE) % 1;
    sandTex.offset.y = (g.dist / 53) % 1;
    for (const item of scenery) {
      item.position.z = 30 - ((item.userData.base + g.dist) % LOOP);
    }

    // You: lean into lane changes, blink after a crash.
    player.position.set(px, 0, PLAYER_Z);
    player.rotation.y = (g.lane - g.laneX) * 0.12;
    player.visible = !(g.crashT > 0 && Math.floor(g.crashT * 10) % 2 === 0);

    // Boost flames.
    const flicker = 0.8 + Math.sin(g.t * 47) * 0.12 + Math.sin(g.t * 83) * 0.08;
    const pop = g.popT > 0 ? 1.7 : 1;
    const rearZ = PLAYER_Z + player.userData.rear + 0.1;
    for (const f of flames) {
      f.visible = boosting;
      f.position.set(px + f.userData.x, player.userData.exhaustY, rearZ);
      f.scale.set(1.2 * pop, 1.2 * pop, 1.15 * flicker * pop);
    }
    boostLight.intensity = boosting ? 9 * flicker * pop : 0;
    boostLight.position.set(px, 0.6, rearZ + 0.8);

    // Traffic and pickups.
    const live = new Set();
    for (const o of g.objects) {
      if (o.z < -0.06 || o.z > 1.02) continue;
      const m = meshFor(o);
      live.add(o);
      m.position.set((o.lane - 1) * LANE_W, 0, -o.z * DEPTH);
      if (m.userData.spin) m.userData.spin.rotation.y = g.t * 3;
    }
    for (const [o, m] of meshes) {
      if (!live.has(o)) {
        scene.remove(m);
        meshes.delete(o);
      }
    }

    // Camera: chases you, widens when boosting, shakes on a crash.
    camX += (px * 0.7 - camX) * 0.12;
    fov += ((boosting ? 70 : 58) - fov) * 0.06;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    const shake = g.crashT > 0.8 ? (Math.random() - 0.5) * 0.25 : 0;
    camera.position.set(camX + shake, 2.9 + shake, PLAYER_Z + 8.6);
    camera.lookAt(camX * 0.6, 0.9, PLAYER_Z - 14);
    sunLight.target.position.set(px, 0, PLAYER_Z - 20);
    sunLight.position.copy(sunLight.target.position).add(sun.clone().multiplyScalar(80));

    renderer.render(scene, camera);
    hud.clearRect(0, 0, W, H);
    drawHud(hud, W, H, g, art, ghost);
  }

  function dispose() {
    renderer.dispose();
    pmrem.dispose();
    envMap?.dispose();
    scene.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose?.();
      }
    });
  }

  return { render, setMe, dispose };
}
