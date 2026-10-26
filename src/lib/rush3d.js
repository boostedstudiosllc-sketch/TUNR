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

// The ground for a place: a base color, grain, soft blotches, and for some
// places a little extra (lava cracks, craters, snow drifts).
function groundTexture(look) {
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      speckle(ctx, w, h, look.ground, look.grain ?? 30, 50000, 2);
      ctx.fillStyle = look.blotch;
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 6 + Math.random() * 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (look.extra === "lava") {
        ctx.strokeStyle = "rgba(255,110,20,0.75)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          let x = Math.random() * w;
          let y = Math.random() * h;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < 6; k++) ctx.lineTo((x += Math.random() * 40 - 20), (y += Math.random() * 40 - 20));
          ctx.stroke();
        }
      }
      if (look.extra === "craters") {
        for (let i = 0; i < 18; i++) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const r = 6 + Math.random() * 22;
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x - 1, y - 1, r, Math.PI * 0.9, Math.PI * 1.7);
          ctx.stroke();
        }
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
  suv: { L: 4.8, W: 1.98, clear: 0.28, belt: 1.15, deck: 1.18, roof: 1.82, glassRear: -2.25, roofRear: -2.12, roofFront: 0.5, glassFront: 1.3, cabinW: 0.88 },
  // A pickup: cab from cabBack forward; behind it an open bed whose floor is
  // at `floor` and whose rails (and tailgate top) are at `deck`.
  truck: { L: 5.7, W: 2.04, clear: 0.32, belt: 1.22, deck: 1.22, floor: 0.82, roof: 1.98, cabBack: -0.25, glassRear: -0.25, roofRear: -0.25, roofFront: 1.05, glassFront: 1.65, cabinW: 0.9 },
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
  const wheelR = body === "truck" ? 0.44 : body === "suv" ? 0.41 : 0.34;
  const axle = half - (body === "truck" ? 1.05 : 0.88);

  // Lower body, with wheel arches cut out of the bottom edge.
  const lower = new THREE.Shape();
  const bottom = s.clear + 0.1;
  lower.moveTo(-half + 0.05, bottom);
  lower.lineTo(-half - 0.02, bottom + 0.25);
  if (body === "truck") {
    // Low under the bed, stepping up at the back of the cab.
    lower.lineTo(-half, s.floor);
    lower.lineTo(s.cabBack, s.floor);
    lower.lineTo(s.cabBack, s.belt);
  } else {
    lower.quadraticCurveTo(-half - 0.06, s.deck - 0.05, -half + 0.12, s.deck);
    lower.lineTo(s.glassRear - 0.05, s.deck + 0.02);
  }
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
  if (body === "truck") {
    // The cab's back is upright.
    cabin.moveTo(s.cabBack, s.belt - 0.02);
    cabin.lineTo(s.cabBack + 0.02, s.roof - 0.04);
    cabin.quadraticCurveTo(s.cabBack + 0.03, s.roof, s.roofRear + 0.15, s.roof);
  } else {
    cabin.moveTo(s.glassRear, s.deck - 0.02);
    cabin.quadraticCurveTo(s.roofRear - 0.05, s.roof - 0.02, s.roofRear + 0.15, s.roof);
  }
  cabin.lineTo(s.roofFront - 0.1, s.roof);
  cabin.quadraticCurveTo(s.roofFront + 0.1, s.roof - 0.02, s.glassFront, s.belt);
  cabin.lineTo(body === "truck" ? s.cabBack : s.glassRear, (body === "truck" ? s.belt : s.deck) - 0.02);

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
  // Truck: the open bed between the back of the cab and the tailgate.
  if (body === "truck") {
    geos.bedLen = half + s.cabBack - 0.05;
    geos.bedZ = half - geos.bedLen / 2 + 0.05;
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
export function buildCar({ color = "#0080F0", body = "coupe", plate = "", sport = false, spoiler = "lip" }) {
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
  const plateMat = plate
    ? new THREE.MeshStandardMaterial({ map: plateTexture(plate), roughness: 0.4 })
    : new THREE.MeshStandardMaterial({ color: 0xf1f1f1, roughness: 0.5 });
  const addPlate = (y, z) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.114), plateMat);
    p.position.set(0, y, z);
    car.add(p);
  };
  const tip = (x, y, z, r = 0.055) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.18, 20).rotateX(Math.PI / 2), MAT.chrome);
    t.position.set(x, y, z);
    car.add(t);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.76, 18), MAT.hole);
    hole.position.set(x, y, z + 0.095);
    car.add(hole);
  };
  let exhaustY = s.clear + 0.18;
  let rearFace = rear;

  if (body === "truck") {
    // Open bed: painted side walls with dark rail caps, a dark floor.
    const wallH = s.deck - s.floor;
    for (const side of [-1, 1]) {
      const wall = box(0.12, wallH, g.bedLen, paintMat, side * (s.W / 2 - 0.06), s.floor + wallH / 2, g.bedZ);
      wall.castShadow = true;
      car.add(wall, box(0.15, 0.035, g.bedLen, MAT.trim, side * (s.W / 2 - 0.06), s.deck + 0.015, g.bedZ));
    }
    car.add(box(s.W - 0.24, 0.04, g.bedLen, MAT.trim, 0, s.floor + 0.02, g.bedZ));
    // Tailgate with a center handle and a crease.
    const gateTop = s.deck;
    const gateBottom = s.clear + 0.36;
    const gateZ = half + 0.08;
    const gate = box(s.W - 0.02, gateTop - gateBottom, 0.1, paintMat, 0, (gateTop + gateBottom) / 2, gateZ);
    gate.castShadow = true;
    car.add(gate, box(0.26, 0.06, 0.03, MAT.trim, 0, gateTop - 0.09, gateZ + 0.06), box(s.W - 0.4, 0.015, 0.02, MAT.trim, 0, gateTop - 0.32, gateZ + 0.055));
    // Tall corner lights: red with a clear reverse lens.
    const white = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.2, emissive: 0x333333 });
    for (const side of [-1, 1]) {
      car.add(box(0.11, 0.42, 0.06, MAT.tail, side * (s.W / 2 - 0.05), gateTop - 0.25, gateZ + 0.04));
      car.add(box(0.09, 0.08, 0.065, white, side * (s.W / 2 - 0.05), gateTop - 0.38, gateZ + 0.045));
    }
    // Back of the cab: sliding-window frames and a cargo/brake light.
    const cabZ = -s.cabBack + 0.1;
    for (const x of [-0.3, 0.3]) car.add(box(0.04, s.roof - s.belt - 0.2, 0.02, MAT.trim, x, (s.roof + s.belt) / 2, cabZ));
    car.add(box(0.4, 0.04, 0.03, MAT.tail, 0, s.roof - 0.05, cabZ));
    // Chrome step bumper with step pads, the plate and a tow hitch.
    const bumperY = s.clear + 0.24;
    const bumperZ = half + 0.2;
    car.add(box(s.W + 0.04, 0.26, 0.3, MAT.chrome, 0, bumperY, bumperZ));
    for (const side of [-1, 1]) car.add(box(0.4, 0.02, 0.22, MAT.trim, side * 0.72, bumperY + 0.135, bumperZ));
    car.add(box(0.6, 0.15, 0.02, MAT.trim, 0, bumperY, bumperZ + 0.15));
    addPlate(bumperY, bumperZ + 0.165);
    car.add(box(0.1, 0.1, 0.26, MAT.trim, 0, bumperY - 0.2, bumperZ + 0.05));
    rearFace = bumperZ + 0.15;
    exhaustY = s.clear + 0.06;
    if (sport) for (const x of [-0.72, 0.72]) tip(x, exhaustY, rearFace - 0.05, 0.065);
    else tip(0.75, exhaustY, rearFace - 0.05, 0.05);
    // Big towing mirrors.
    for (const side of [-1, 1]) car.add(box(0.12, 0.3, 0.2, MAT.trim, side * (s.W / 2 + 0.12), s.belt + 0.2, -(s.glassFront - 0.3)));
  } else if (body === "suv") {
    // Wide tail lights reaching onto the tailgate, joined by a chrome strip.
    const ty = s.deck - 0.14;
    for (const side of [-1, 1]) {
      car.add(box(0.66, 0.11, 0.05, MAT.tail, side * (s.W / 2 - 0.37), ty, rear));
      car.add(box(0.14, 0.05, 0.055, new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.2 }), side * (s.W / 2 - 0.12), ty - 0.02, rear + 0.002));
    }
    car.add(box(0.62, 0.035, 0.04, MAT.chrome, 0, ty, rear));
    addPlate(s.deck - 0.4, rear + 0.005);
    // Roof spoiler over the glass, and roof rails.
    const roofW = s.W * s.cabinW;
    car.add(box(roofW + 0.04, 0.06, 0.32, sport && spoiler === "wing" ? MAT.carbon : paintMat, 0, s.roof + 0.02, -s.roofRear + 0.06));
    const railLen = s.roofFront - s.roofRear - 0.3;
    for (const side of [-1, 1]) car.add(box(0.05, 0.05, railLen, MAT.rim, side * (roofW / 2 - 0.1), s.roof + 0.08, -(s.roofRear + s.roofFront) / 2));
    // Black arch trim, a dark lower bumper and a silver skid plate.
    for (const side of [-1, 1]) car.add(box(0.1, 0.42, 1.05, MAT.trim, side * (s.W / 2 + 0.02), g.wheelR + 0.12, g.axle));
    const by = s.clear + 0.22;
    car.add(box(s.W - 0.2, 0.28, 0.16, MAT.trim, 0, by, rear - 0.05));
    car.add(box(0.95, 0.1, 0.06, MAT.chrome, 0, by - 0.08, rear + 0.04));
    exhaustY = by;
    if (sport) {
      for (const side of [-1, 1]) {
        car.add(box(0.2, 0.08, 0.04, MAT.chrome, side * 0.62, by, rear + 0.04));
        car.add(box(0.16, 0.04, 0.045, MAT.hole, side * 0.62, by, rear + 0.045));
      }
    }
  } else {
    // German sport style: L-shaped LED lights in smoked housings, the plate
    // on the trunk between them.
    const ty = s.deck - 0.13;
    const smoke = new THREE.MeshPhysicalMaterial({ color: 0x1a0306, roughness: 0.1, clearcoat: 1 });
    for (const side of [-1, 1]) {
      const ox = side * (s.W / 2 - 0.05);
      car.add(box(0.62, 0.17, 0.035, smoke, side * (s.W / 2 - 0.34), ty - 0.02, rear - 0.005));
      car.add(box(0.15, 0.3, 0.035, smoke, ox - side * 0.05, ty - 0.1, rear - 0.005));
      car.add(box(0.52, 0.04, 0.04, MAT.tail, side * (s.W / 2 - 0.34), ty + 0.02, rear + 0.01));
      car.add(box(0.04, 0.24, 0.04, MAT.tail, ox - side * 0.06, ty - 0.09, rear + 0.01));
    }
    addPlate(s.deck - 0.33, rear + 0.005);
    // Bumper crease and reflectors.
    car.add(box(s.W - 0.3, 0.015, 0.02, MAT.trim, 0, s.clear + 0.42, rear - 0.01));
    for (const side of [-1, 1]) car.add(box(0.12, 0.03, 0.02, MAT.tailDim, side * (s.W / 2 - 0.16), s.clear + 0.36, rear - 0.01));
    const by = s.clear + 0.2;
    exhaustY = by - 0.02;
    if (sport) {
      car.add(box(s.W - 0.55, 0.17, 0.2, MAT.carbon, 0, by, rear - 0.05));
      for (let f = -2; f <= 2; f++) car.add(box(0.025, 0.14, 0.24, MAT.trim, f * 0.13, by, rear - 0.03));
      for (const x of [-0.62, -0.48, 0.48, 0.62]) tip(x, exhaustY, rear + 0.04);
    } else {
      car.add(box(s.W - 0.6, 0.12, 0.16, MAT.trim, 0, by, rear - 0.06));
      tip(-0.55, exhaustY, rear + 0.02, 0.04);
    }
    // Third brake light at the top of the rear glass.
    car.add(box(0.36, 0.03, 0.03, MAT.tail, 0, s.roof - 0.06, -s.roofRear + 0.06));
  }

  // Mirrors (the pickup has its own towing mirrors).
  if (body !== "truck") {
    for (const side of [-1, 1]) {
      const m = box(0.16, 0.1, 0.12, paintMat, side * (s.W * s.cabinW) / 2 + side * 0.1, s.belt + 0.1, -(s.glassFront - 0.25));
      m.castShadow = true;
      car.add(m);
    }
  }

  // Spoiler, on sporty cars.
  if (sport && body !== "truck" && body !== "suv") {
    if (spoiler === "wing") {
      const wy = s.deck + 0.32;
      const wz = half - 0.28;
      car.add(box(s.W - 0.1, 0.035, 0.32, MAT.carbon, 0, wy, wz));
      for (const side of [-1, 1]) {
        car.add(box(0.05, 0.3, 0.12, MAT.carbon, side * 0.5, wy - 0.16, wz));
        car.add(box(0.02, 0.16, 0.36, MAT.carbon, side * (s.W / 2 - 0.05), wy + 0.04, wz));
      }
    } else if (spoiler === "lip") {
      if (body === "hatch") car.add(box(s.W * s.cabinW, 0.04, 0.3, MAT.carbon, 0, s.roof + 0.03, -s.roofRear + 0.1));
      else car.add(box(s.W - 0.5, 0.05, 0.12, MAT.carbon, 0, s.deck + 0.05, half - 0.05));
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

  car.userData.rear = rearFace;
  car.userData.exhaustX = body === "truck" ? 0.72 : body === "suv" ? 0.62 : 0.55;
  car.userData.camLift = body === "truck" ? 0.75 : body === "suv" ? 0.45 : 0; // see over tall vehicles
  car.userData.exhaustY = exhaustY;
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

function buildRock(rand, color = 0x9a6a44, big = 1) {
  const m = new THREE.Mesh(
    new THREE.DodecahedronGeometry((0.6 + rand() * 1.4) * big, 0),
    new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true })
  );
  m.scale.y = 0.55;
  m.rotation.y = rand() * 6;
  m.castShadow = true;
  return m;
}

// ---------- scenery for each place ----------

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

function buildPine(rand, snow = false) {
  const g = new THREE.Group();
  const h = 6 + rand() * 5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h * 0.35, 8), mat(0x5a3b22));
  trunk.position.y = h * 0.17;
  g.add(trunk);
  const green = mat(snow ? 0x2f5a3a : 0x2d5a27, { flatShading: true });
  for (let i = 0; i < 3; i++) {
    const r = (1.9 - i * 0.5) * (h / 8);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h * 0.38, 9), green);
    cone.position.y = h * (0.32 + i * 0.2);
    cone.castShadow = true;
    g.add(cone);
    if (snow) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.75, h * 0.16, 9), mat(0xf4f8fb, { flatShading: true }));
      cap.position.y = h * (0.42 + i * 0.2);
      g.add(cap);
    }
  }
  return g;
}

function buildOak(rand) {
  const g = new THREE.Group();
  const h = 3 + rand() * 2.5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, h, 8), mat(0x4e3420));
  trunk.position.y = h / 2;
  g.add(trunk);
  const leaves = mat(0x3f7a2c, { flatShading: true });
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + rand() * 1.1, 0), leaves);
    ball.position.set((rand() - 0.5) * 1.8, h + 0.6 + rand() * 1.2, (rand() - 0.5) * 1.8);
    ball.castShadow = true;
    g.add(ball);
  }
  return g;
}

function buildPalm(rand) {
  const g = new THREE.Group();
  const bark = mat(0x8b6b46);
  const lean = (rand() - 0.5) * 0.5;
  let y = 0;
  let x = 0;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.015, 0.24 - i * 0.015, 1.3, 7), bark);
    x += lean * 0.25 * i * 0.3;
    seg.position.set(x, y + 0.65, 0);
    seg.rotation.z = -lean * 0.3;
    g.add(seg);
    y += 1.25;
  }
  const frond = mat(0x3a7d2c, { side: THREE.DoubleSide, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.4, 4, 1).rotateZ(Math.PI / 2).translate(1.7, 0, 0), frond);
    leaf.scale.set(1, 0.25, 1);
    leaf.position.set(x, y + 0.2, 0);
    leaf.rotation.set(0, (i / 7) * Math.PI * 2, -0.45);
    leaf.castShadow = true;
    g.add(leaf);
  }
  return g;
}

function buildUmbrella(rand) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), mat(0xeeeeee));
  pole.position.y = 1.2;
  const colors = ["#ef4444", "#0080f0", "#facc15", "#10b981"];
  const c = colors[Math.floor(rand() * colors.length)];
  const tex = canvasTexture(128, 16, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#ffffff" : c;
      ctx.fillRect((i * w) / 8, 0, w / 8, h);
    }
  });
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 16, 1, true), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
  top.position.y = 2.45;
  top.castShadow = true;
  const towel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8).rotateX(-Math.PI / 2), mat(c === "#facc15" ? 0x0080f0 : 0xfacc15));
  towel.position.set(1.2, 0.03, 0.4);
  g.add(pole, top, towel);
  return g;
}

function buildDeadTree(rand) {
  const g = new THREE.Group();
  const bark = mat(0x3a3328, { flatShading: true });
  const h = 4 + rand() * 4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, h, 6), bark);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const len = 1 + rand() * 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, len, 5).translate(0, len / 2, 0), bark);
    b.position.y = h * (0.45 + rand() * 0.45);
    b.rotation.set((rand() - 0.5) * 1.2, rand() * 6, 0.7 + rand() * 0.5);
    g.add(b);
  }
  // Hanging moss.
  const moss = mat(0x6b7f4a, { transparent: true, opacity: 0.85 });
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 5), moss);
    m.rotation.x = Math.PI;
    m.position.set((rand() - 0.5) * 1.6, h * 0.75, (rand() - 0.5) * 1.6);
    g.add(m);
  }
  return g;
}

function buildReeds(rand) {
  const g = new THREE.Group();
  const reed = mat(0x8a8a4a);
  for (let i = 0; i < 9; i++) {
    const h = 0.8 + rand() * 1.2;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 4), reed);
    r.position.set((rand() - 0.5) * 1.4, h / 2, (rand() - 0.5) * 1.4);
    r.rotation.z = (rand() - 0.5) * 0.3;
    g.add(r);
  }
  return g;
}

// Still, dark water that mirrors the sky.
function buildPuddle(rand) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(2.5 + rand() * 4, 20).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2a3a26, roughness: 0.08, metalness: 0.4 })
  );
  m.scale.set(1.4, 1, 1);
  m.position.y = 0.03;
  return m;
}

function buildIce(rand) {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.8 + rand() * 1.4, 0),
    new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true })
  );
  m.scale.y = 1.3;
  m.position.y = 0.6;
  m.rotation.y = rand() * 6;
  m.castShadow = true;
  return m;
}

function buildSnowman() {
  const g = new THREE.Group();
  const snow = mat(0xf7fbff);
  [0.65, 0.48, 0.34].reduce((y, r) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), snow);
    b.position.y = y + r;
    b.castShadow = true;
    g.add(b);
    return y + r * 1.8;
  }, 0);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 8).rotateX(Math.PI / 2), mat(0xf97316));
  nose.position.set(0, 2.25, 0.36);
  g.add(nose);
  return g;
}

function buildLavaRock(rand) {
  const g = new THREE.Group();
  g.add(buildRock(rand, 0x26201d, 1.2));
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.8 + rand(), 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a14 }));
  glow.position.set(1.4, 0.05, 0.3);
  g.add(glow);
  return g;
}

function buildCrystal(rand) {
  const g = new THREE.Group();
  const color = rand() < 0.5 ? 0x8b5cf6 : 0x22d3ee;
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.2, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const h = 1 + rand() * 2.4;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), m);
    c.scale.set(1, h, 1);
    c.position.set((rand() - 0.5) * 1.2, h * 0.3, (rand() - 0.5) * 1.2);
    c.rotation.set((rand() - 0.5) * 0.6, rand() * 6, (rand() - 0.5) * 0.6);
    g.add(c);
  }
  return g;
}

function buildStreetLight() {
  const g = new THREE.Group();
  const metal = mat(0x3a3f45, { metalness: 0.6, roughness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 8), metal);
  pole.position.y = 3.5;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.1), metal);
  arm.position.set(-1.0, 6.9, 0);
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.35), new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe08a, emissiveIntensity: 1.4 }));
  lamp.position.set(-2.0, 6.8, 0);
  g.add(pole, arm, lamp);
  g.userData.faceRoad = true; // the arm reaches over the road
  return g;
}

const windowTex = (lit) =>
  canvasTexture(
    64,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = "#2b3038";
      ctx.fillRect(0, 0, w, h);
      for (let y = 4; y < h - 4; y += 8) {
        for (let x = 4; x < w - 4; x += 8) {
          const on = Math.random() < lit;
          ctx.fillStyle = on ? (Math.random() < 0.8 ? "#ffd27a" : "#9fd3ff") : "#3d4552";
          ctx.fillRect(x, y, 4, 5);
        }
      }
    },
    { repeat: [1, 1] }
  );

function buildBuilding(rand, texs) {
  const w = 6 + rand() * 10;
  const h = 10 + rand() * 30;
  const tex = texs[Math.floor(rand() * texs.length)];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.8 + rand() * 0.4)), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2 }));
  m.position.y = h / 2;
  m.castShadow = true;
  m.userData.setBack = 10 + rand() * 18; // keep buildings off the sidewalk
  return m;
}

// What each place looks like in 3D. ground: [base, blotch] for the texture.
// light: tweaks to the day's lighting. backdrop: what's on the horizon.
// props: roadside things and how often each shows up.
const PLACES = {
  desert: { ground: "#d8b27a", blotch: "rgba(120,80,40,0.08)", shoulder: 0x8a7458, hemiGround: 0xc9a06a, envGround: ["#b8946a", "#6e5338"], backdrop: "mesas",
    props: [[(r) => buildCactus(r), 0.6], [(r) => buildRock(r), 0.4]] },
  city: { ground: "#5b5f66", blotch: "rgba(255,255,255,0.05)", grain: 22, shoulder: 0xa3a39c, hemiGround: 0x6b6b6b, envGround: ["#7a7f86", "#3e4248"], fog: 0xb9c2cc, backdrop: "skyline",
    props: [[(r, k) => buildBuilding(r, k.windows), 0.55], [() => buildStreetLight(), 0.3], [(r) => buildOak(r), 0.15]] },
  forest: { ground: "#3f6b2c", blotch: "rgba(20,50,10,0.18)", shoulder: 0x5c4a33, hemiGround: 0x4a6b33, envGround: ["#4d6b3a", "#2c3f22"], fog: 0xa9c0a0, backdrop: "hills",
    props: [[(r) => buildPine(r), 0.55], [(r) => buildOak(r), 0.35], [(r) => buildRock(r, 0x6f6f66), 0.1]] },
  beach: { ground: "#efdcae", blotch: "rgba(200,170,110,0.12)", shoulder: 0xd9c38f, hemiGround: 0xe6d3a3, envGround: ["#9fd0e6", "#d8c08a"], fog: 0xcfe7f2, fogNear: 220, fogFar: 880, backdrop: "ocean",
    props: [[(r) => buildPalm(r), 0.65], [(r) => buildUmbrella(r), 0.35]] },
  mountain: { ground: "#6c8650", blotch: "rgba(40,60,30,0.15)", shoulder: 0x7a6a55, hemiGround: 0x5f7a48, envGround: ["#8aa0b8", "#4f5f44"], fog: 0xc2d0de, backdrop: "peaks",
    props: [[(r) => buildPine(r), 0.6], [(r) => buildRock(r, 0x8a8a84, 1.6), 0.4]] },
  swamp: { ground: "#3d4a2c", blotch: "rgba(20,30,10,0.25)", shoulder: 0x4d4532, hemiGround: 0x3f4a2e, envGround: ["#6d7a5c", "#2a3020"], fog: 0x76836a, fogNear: 50, fogFar: 300, light: { sun: 0.6, sky: 0.85, exposure: 0.95 }, backdrop: "swamp",
    props: [[(r) => buildDeadTree(r), 0.4], [(r) => buildReeds(r), 0.3], [(r) => buildPuddle(r), 0.3]] },
  arctic: { ground: "#eef5fa", blotch: "rgba(150,180,210,0.14)", grain: 12, shoulder: 0xd3e0ea, hemiGround: 0xe6f0f8, envGround: ["#dbe9f4", "#aac2d6"], fog: 0xdce9f4, light: { exposure: 0.8 }, backdrop: "icePeaks",
    props: [[(r) => buildPine(r, true), 0.45], [(r) => buildIce(r), 0.35], [() => buildSnowman(), 0.2]] },
  volcano: { ground: "#2b2522", blotch: "rgba(0,0,0,0.25)", extra: "lava", shoulder: 0x3a2f2a, hemiGround: 0x3a2018, envGround: ["#5a2a1a", "#1a1210"], fog: 0x5b2a1c, fogNear: 80, fogFar: 420, light: { sun: 0.75, exposure: 1.0 }, skyTurbidity: 18, backdrop: "volcano",
    props: [[(r) => buildLavaRock(r), 0.6], [(r) => buildRock(r, 0x1d1917, 1.3), 0.4]] },
  space: { ground: "#6a6585", blotch: "rgba(0,0,0,0.12)", extra: "craters", shoulder: 0x2f2b40, hemiGround: 0x2a2540, envGround: ["#2b2350", "#0d0a1a"], fog: 0x0b0820, fogNear: 160, fogFar: 700, light: { sun: 1.3, sky: 1.6, exposure: 1.25, color: 0xdfe7ff }, noSky: true, backdrop: "planet",
    props: [[(r) => buildCrystal(r), 0.6], [(r) => buildRock(r, 0x6b6880), 0.4]] },
};

// What's on the horizon (doesn't move).
function buildBackdrop(scene, kind, rand, kit) {
  const far = (i) => ({ side: i % 2 ? 1 : -1, x: 90 + rand() * 260, z: -380 - rand() * 320 });
  if (kind === "mesas") {
    const m0 = mat(0xb07a4f, { flatShading: true });
    for (let i = 0; i < 14; i++) {
      const r = 30 + rand() * 60;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * (0.5 + rand() * 0.3), r, 18 + rand() * 40, 7), m0);
      const p = far(i);
      m.position.set(p.side * p.x, 8, p.z);
      scene.add(m);
    }
  } else if (kind === "skyline") {
    for (let i = 0; i < 46; i++) {
      const w = 14 + rand() * 30;
      const h = 30 + rand() * 120;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ map: kit.windows[i % kit.windows.length], roughness: 0.5, metalness: 0.3 }));
      const side = i % 2 ? 1 : -1;
      m.position.set(side * (45 + rand() * 300), h / 2, -200 - rand() * 480);
      scene.add(m);
    }
  } else if (kind === "hills" || kind === "swamp") {
    const m0 = mat(kind === "swamp" ? 0x2f3a24 : 0x2f5a25, { flatShading: true });
    for (let i = 0; i < 16; i++) {
      const r = 50 + rand() * 90;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m0);
      m.scale.y = 0.35 + rand() * 0.3;
      const p = far(i);
      m.position.set(p.side * p.x, 0, p.z);
      scene.add(m);
    }
  } else if (kind === "peaks" || kind === "icePeaks") {
    // Far off, so drawn crisp (no haze), in a blue-grey that reads as distance.
    const rock = mat(kind === "icePeaks" ? 0x8fa9bf : 0x56606b, { flatShading: true, fog: false });
    const snow = mat(0xf6fafd, { flatShading: true, fog: false });
    for (let i = 0; i < 12; i++) {
      const r = 90 + rand() * 80;
      const h = 170 + rand() * 150;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rock);
      const side = i % 2 ? 1 : -1;
      m.position.set(side * (40 + rand() * 360), h / 2 - 6, -640 - rand() * 220);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.42, h * 0.42, 7), snow);
      cap.position.y = h * 0.29 + 0.5;
      m.add(cap);
      scene.add(m);
    }
  } else if (kind === "ocean") {
    // The sea on the right, dunes on the left.
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1600), new THREE.MeshStandardMaterial({ color: 0x0b5f95, roughness: 0.45, metalness: 0, envMapIntensity: 0.35 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(611.5, 0.05, -500); // from just past the shoulder
    // White surf where it meets the sand.
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1600), new THREE.MeshStandardMaterial({ color: 0xf2f8fb, roughness: 0.6 }));
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(12, 0.06, -500);
    scene.add(surf);
    scene.add(sea);
    const dune = mat(0xe3c98f, { flatShading: true });
    for (let i = 0; i < 10; i++) {
      const r = 30 + rand() * 50;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), dune);
      m.scale.y = 0.25;
      m.position.set(-(70 + rand() * 260), 0, -300 - rand() * 400);
      scene.add(m);
    }
  } else if (kind === "volcano") {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(34, 230, 240, 12, 1, true), mat(0x221a16, { flatShading: true, side: THREE.DoubleSide, fog: false }));
    cone.position.set(-90, 118, -840);
    scene.add(cone);
    const crater = new THREE.Mesh(new THREE.CircleGeometry(34, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a1a, fog: false }));
    crater.position.set(-90, 237, -840);
    scene.add(crater);
    // Lava running down the side, and a glow over the top.
    const lava = new THREE.MeshBasicMaterial({ color: 0xff4d0d, fog: false });
    for (let i = 0; i < 4; i++) {
      const flow = new THREE.Mesh(new THREE.PlaneGeometry(6 + rand() * 6, 200), lava);
      flow.position.set(-90 + (rand() - 0.5) * 90, 120, -840 + 120);
      flow.rotation.set(-0.5, 0, (rand() - 0.5) * 0.5);
      scene.add(flow);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.25, fog: false, depthWrite: false }));
    glow.position.set(-90, 250, -840);
    scene.add(glow);
    const m0 = mat(0x1d1714, { flatShading: true });
    for (let i = 0; i < 8; i++) {
      const r = 30 + rand() * 50;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, 40 + rand() * 60, 6), m0);
      const p = far(i);
      m.position.set(p.side * p.x, 20, p.z);
      scene.add(m);
    }
  } else if (kind === "planet") {
    const planet = new THREE.Mesh(new THREE.SphereGeometry(120, 40, 24), new THREE.MeshStandardMaterial({ color: 0xd08a4a, roughness: 0.8, emissive: 0x5a2a10, emissiveIntensity: 0.6, fog: false }));
    planet.position.set(140, 200, -820);
    const ring = new THREE.Mesh(new THREE.RingGeometry(160, 240, 64), new THREE.MeshBasicMaterial({ color: 0xe8c9a0, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false }));
    ring.rotation.set(1.2, 0.3, 0);
    planet.add(ring);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 16), new THREE.MeshStandardMaterial({ color: 0xbfc3d0, emissive: 0x2a2c33, fog: false }));
    moon.position.set(-230, 230, -760);
    scene.add(planet, moon);
    // Stars all around.
    const pts = [];
    for (let i = 0; i < 1500; i++) {
      const v = new THREE.Vector3(rand() - 0.5, rand() * 0.9 + 0.05, rand() - 0.5).normalize().multiplyScalar(1500);
      pts.push(v.x, v.y, v.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false })));
  }
}

// ---------- the scene ----------

// Lighting for each day's look (rushEngine.js THEMES).
const LIGHT = {
  noon: { turbidity: 3.5, rayleigh: 2.6, env: ["#3d78c2", "#a9c8e6", "#f1dcc0"], fog: 0xd9c7a8, sun: 0xfff1d6, sunPower: 2.6, sky: 0.7, exposure: 0.9 },
  golden: { turbidity: 6, rayleigh: 2, env: ["#5a7fb8", "#f6c38a", "#ffd39a"], fog: 0xe6b98d, sun: 0xffbe7a, sunPower: 2.5, sky: 0.6, exposure: 0.85 },
  dusk: { turbidity: 9, rayleigh: 3.5, env: ["#2b2d6b", "#a46a9c", "#f3a6a0"], fog: 0x8f6f8c, sun: 0xff9476, sunPower: 1.7, sky: 0.55, exposure: 0.95 },
};

// Reflections come from a simple painted sky (blue overhead, warm haze at
// the horizon, sand below, a bright sun) rather than the sky shader, whose
// very bright values can break the lighting on some phones.
function paintedSky(renderer, L, sun, on = true, envGround = ["#b8946a", "#6e5338"]) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  if (!on) return { pmrem, envMap: null };
  const envScene = new THREE.Scene();
  const envTex = canvasTexture(16, 256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, L.env[0]);
    grad.addColorStop(0.42, L.env[1]);
    grad.addColorStop(0.5, L.env[2]);
    grad.addColorStop(0.53, envGround[0]);
    grad.addColorStop(1, envGround[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide })));
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.4, 4.5) }));
  sunDisc.position.copy(sun).multiplyScalar(40);
  envScene.add(sunDisc);
  return { pmrem, envMap: pmrem.fromScene(envScene, 0.02).texture };
}

// The garage preview: your car from behind, three-quarter view, in a dark
// studio. show(look) swaps the car.
export function createCarPreview(canvas, W, H) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121212);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(40), THREE.MathUtils.degToRad(140));
  const { pmrem, envMap } = paintedSky(renderer, LIGHT.noon, sun);
  scene.environment = envMap;
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.copy(sun).multiplyScalar(12);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 40 });
  scene.add(key, new THREE.HemisphereLight(0xdde6ff, 0x222222, 0.6));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  let car = null;
  function show(look) {
    if (car) scene.remove(car);
    car = buildCar({ ...look, sport: true });
    scene.add(car);
    const far = look.body === "truck" ? 1.18 : look.body === "suv" ? 1.08 : 1;
    camera.position.set(3.1 * far, 2.0 * far, 7.2 * far);
    camera.lookAt(0, look.body === "truck" || look.body === "suv" ? 0.95 : 0.7, 0.4);
    renderer.render(scene, camera);
  }
  function dispose() {
    renderer.dispose();
    pmrem.dispose();
    envMap?.dispose();
  }
  return { show, dispose };
}


// opts: { reflections, shadows } — both on by default; off is lighter for
// older phones. theme: the day's look. place: the scenery (rushEngine.js
// SCENERY), desert unless unlocked.
export function createRush3D(glCanvas, hudCanvas, W, H, me, art = {}, opts = {}) {
  const { reflections = true, shadows = true, theme = { id: "noon", sun: 58 }, place = "desert" } = opts;
  const P = PLACES[place] || PLACES.desert;
  const base = LIGHT[theme.id] || LIGHT.noon;
  const tweak = P.light || {};
  const L = {
    ...base,
    sunPower: base.sunPower * (tweak.sun ?? 1),
    sky: base.sky * (tweak.sky ?? 1),
    exposure: base.exposure * (tweak.exposure ?? 1),
    fog: P.fog ?? base.fog,
    sun: tweak.color ?? base.sun,
    env: P.noSky ? ["#05010f", "#1e1b4b", "#2b2350"] : base.env,
  };
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

  // The day's sky (space has none: black, stars and a planet), which also
  // lights the paint's reflections.
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - theme.sun), THREE.MathUtils.degToRad(155));
  if (P.noSky) {
    scene.background = new THREE.Color(0x05010f);
  } else {
    const sky = new Sky();
    sky.scale.setScalar(10000);
    sky.material.uniforms.turbidity.value = P.skyTurbidity ?? L.turbidity;
    sky.material.uniforms.rayleigh.value = L.rayleigh;
    sky.material.uniforms.mieCoefficient.value = 0.003;
    sky.material.uniforms.mieDirectionalG.value = 0.82;
    sky.material.uniforms.sunPosition.value.copy(sun);
    scene.add(sky);
  }
  const { pmrem, envMap } = paintedSky(renderer, L, sun, reflections, P.envGround);
  scene.environment = envMap;
  scene.fog = new THREE.Fog(L.fog, P.fogNear ?? 140, P.fogFar ?? 560);

  const sunLight = new THREE.DirectionalLight(L.sun, L.sunPower);
  sunLight.position.copy(sun).multiplyScalar(80);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunLight.shadow.camera, { left: -14, right: 14, top: 40, bottom: -40, near: 1, far: 200 });
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight, sunLight.target);
  scene.add(new THREE.HemisphereLight(P.noSky ? 0x8f8ad8 : 0xbcd6ff, P.hemiGround, L.sky));

  // Road and the ground around it.
  const roadTex = roadTexture();
  const roadLen = 1000;
  roadTex.repeat.set(1, roadLen / ROAD_TILE);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W * 3 + 2.2, roadLen), new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.04, -roadLen / 2 + 30);
  road.receiveShadow = true;
  scene.add(road);
  const shoulderMat = new THREE.MeshStandardMaterial({ color: P.shoulder, roughness: 1 });
  for (const side of [-1, 1]) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, roadLen), shoulderMat);
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(side * (LANE_W * 1.5 + 1.1 + 1.25), 0.02, -roadLen / 2 + 30);
    sh.receiveShadow = true;
    scene.add(sh);
  }
  const sandTex = groundTexture(P);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.z = -500;
  sand.receiveShadow = true;
  scene.add(sand);

  // On the horizon.
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const kit = { windows: P.backdrop === "skyline" ? [windowTex(0.35), windowTex(0.55), windowTex(0.2)] : [] };
  buildBackdrop(scene, P.backdrop, rand, kit);

  // Roadside scenery that loops past.
  const scenery = [];
  const total = P.props.reduce((n, [, w]) => n + w, 0);
  for (let i = 0; i < 26; i++) {
    let pick = rand() * total;
    const [make] = P.props.find(([, w]) => (pick -= w) <= 0) || P.props[0];
    const item = make(rand, kit);
    // The sea's on the right at the beach: keep things on the sand side.
    const side = P.backdrop === "ocean" ? -1 : rand() < 0.5 ? -1 : 1;
    item.position.x = side * (LANE_W * 1.5 + 4 + (item.userData.setBack ?? 0) + rand() * 30);
    if (item.userData.faceRoad) {
      item.position.x = side * (LANE_W * 1.5 + 2.6);
      item.rotation.y = side > 0 ? 0 : Math.PI;
    }
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
      f.position.set(px + Math.sign(f.userData.x) * player.userData.exhaustX, player.userData.exhaustY, rearZ);
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
    // A raised chase view: you, plus plenty of road ahead.
    camera.position.set(camX + shake, 4.1 + player.userData.camLift + shake, PLAYER_Z + 9.6 + player.userData.camLift * 0.6);
    camera.lookAt(camX * 0.6, 0.4, PLAYER_Z - 18);
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
