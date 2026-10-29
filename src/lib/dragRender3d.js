// Drag Race in 3D: a night strip under the lights, the Christmas tree on
// the start line, your garage car in the left lane and the rival in the
// right. The race itself is dragEngine.js; this only draws it.

import * as THREE from "three";
import { buildCar } from "./rush3d.js";
import { QUARTER, treeLights } from "./dragEngine.js";

const LANE = 2.4; // m from the centre line to each lane's middle
const HALF_CAR = 2.15;

const at = (mesh, x, y, z) => {
  mesh.position.set(x, y, z);
  return mesh;
};

function canvasTexture(w, h, draw, repeat = null) {
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

// Reflections for the paint: a dark box with light strips, like the
// strip's lights overhead.
function nightEnv(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x05070d);
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of [-10, 10]) {
    for (let z = -30; z <= 30; z += 15) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), glow);
      p.position.set(x, 9, z);
      p.lookAt(0, 0, z);
      env.add(p);
    }
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: 0x111318 }));
  floor.rotation.x = -Math.PI / 2;
  env.add(floor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const map = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return map;
}

function buildStrip(scene) {
  const len = QUARTER + 140;
  // The racing surface: concrete launch pad with rubber laid down, then
  // asphalt, lane lines, a yellow centre line.
  const surface = canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#3b3e45";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 45 + Math.random() * 35;
      ctx.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // Rubber in the tyre tracks.
    ctx.fillStyle = "rgba(8,8,10,0.55)";
    for (const cx of [0.13, 0.37, 0.63, 0.87]) ctx.fillRect(cx * w - 18, 0, 36, h);
    ctx.fillStyle = "#e9e9e9";
    ctx.fillRect(0, 0, 6, h);
    ctx.fillRect(w - 6, 0, 6, h);
    ctx.fillStyle = "#facc15";
    ctx.fillRect(w / 2 - 4, 0, 8, h);
  }, [1, len / 40]);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 4, len), new THREE.MeshStandardMaterial({ map: surface, roughness: 0.85, metalness: 0.05 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, -len / 2 + 60);
  scene.add(road);

  const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, len + 400), new THREE.MeshStandardMaterial({ color: 0x0c1410, roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0, -len / 2 + 60);
  scene.add(grass);

  // Start line, and the chequered finish.
  const white = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  const start = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 4, 0.3), white);
  start.rotation.x = -Math.PI / 2;
  start.position.set(0, 0.02, 0);
  scene.add(start);
  const checker = canvasTexture(256, 32, (ctx, w, h) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? "#111" : "#f5f5f5";
      ctx.fillRect(i * 16, j * 16, 16, 16);
    }
  });
  const fin = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 4, 1.2), new THREE.MeshBasicMaterial({ map: checker }));
  fin.rotation.x = -Math.PI / 2;
  fin.position.set(0, 0.02, -QUARTER);
  scene.add(fin);

  // Concrete walls with signs.
  const wallTex = canvasTexture(1024, 64, (ctx, w, h) => {
    ctx.fillStyle = "#c9cdd3";
    ctx.fillRect(0, 0, w, h);
    const ads = [["TUNR", "#0080F0"], ["BOOSTED STUDIOS", "#111827"], ["GEORGIA CAR MEETS", "#DC2626"], ["TUNR", "#0080F0"]];
    ads.forEach(([t, c], i) => {
      ctx.fillStyle = c;
      ctx.fillRect(i * 256 + 8, 8, 240, h - 16);
      ctx.fillStyle = "#fff";
      ctx.font = "900 34px 'Barlow Condensed', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t, i * 256 + 128, h / 2 + 2, 220);
    });
  }, [len / 40, 1]);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, len), wallMat);
    wall.position.set(side * (LANE * 2 + 0.6), 0.45, -len / 2 + 60);
    scene.add(wall);
  }

  // Light poles down both sides.
  const pole = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6, metalness: 0.5 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6dd });
  for (let z = 40; z > -QUARTER - 120; z -= 55) {
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 13, 8), pole);
      p.position.set(side * 9.5, 6.5, z);
      scene.add(p);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.9), lamp);
      head.position.set(side * 8.8, 13, z);
      scene.add(head);
    }
  }

  // Grandstand by the start, with a crowd.
  const crowd = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#1b1f27";
    ctx.fillRect(0, 0, w, h);
    const tones = ["#f5d0a9", "#8d5524", "#c68642", "#e0ac69", "#3b82f6", "#ef4444", "#fafafa", "#22c55e"];
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = tones[(Math.random() * tones.length) | 0];
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 4);
    }
  }, [6, 1]);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2a2f38 }));
  for (let i = 0; i < 6; i++) {
    const step = stand.clone();
    step.scale.set(2, 0.9, 150);
    step.position.set(LANE * 2 + 3 + i * 1.6, 0.45 + i * 0.9, -40);
    scene.add(step);
    const people = new THREE.Mesh(new THREE.PlaneGeometry(150, 0.9), new THREE.MeshBasicMaterial({ map: crowd }));
    people.rotation.y = -Math.PI / 2;
    people.position.set(LANE * 2 + 2.05 + i * 1.6, 1.25 + i * 0.9, -40);
    scene.add(people);
  }

  // Distance boards.
  const board = (text, z) => {
    const tex = canvasTexture(256, 96, (ctx, w, h) => {
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#facc15";
      ctx.font = "900 54px 'Barlow Condensed', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, h / 2 + 3);
    });
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshBasicMaterial({ map: tex }));
      b.position.set(side * (LANE * 2 + 0.6), 1.4, z);
      b.rotation.y = side * -Math.PI / 2;
      scene.add(b);
    }
  };
  board("60 FT", -18.3);
  board("330 FT", -100.6);
  board("1/8 MI", -201.2);
  board("1000 FT", -304.8);
  board("FINISH", -QUARTER);

  // The finish gantry.
  const gantry = new THREE.Group();
  for (const side of [-1, 1]) gantry.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 6, 0.3), pole), side * (LANE * 2 + 1), 3, 0));
  const sign = canvasTexture(512, 96, (ctx, w, h) => {
    ctx.fillStyle = "#0b0f19";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#0080F0";
    ctx.font = "900 70px 'Barlow Condensed', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TUNR  FINISH", w / 2, h / 2 + 4);
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(LANE * 4 + 2.6, 1, 0.3), new THREE.MeshBasicMaterial({ map: sign }));
  top.position.set(0, 6, 0);
  gantry.add(top);
  gantry.position.z = -QUARTER;
  scene.add(gantry);
}

// The tree: a column of lamps for each lane on a pole between them.
function buildTree(scene) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.5, metalness: 0.4 });
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 3, 0.12), dark), 0, 1.5, 0));
  g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.9, 0.18), dark), 0, 2.75, 0));
  const lamps = { stage: [], amber: [[], [], []], green: [], red: [] };
  const make = (color, x, y) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(color), emissiveIntensity: 0, roughness: 0.3 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m);
    s.position.set(x, y, 0.1);
    g.add(s);
    return m;
  };
  for (const x of [-0.2, 0.2]) {
    lamps.stage.push(make(0xffffff, x, 3.55));
    for (let i = 0; i < 3; i++) lamps.amber[i].push(make(0xffa000, x, 3.2 - i * 0.3));
    lamps.green.push(make(0x22ff55, x, 2.25));
    lamps.red.push(make(0xff1a1a, x, 1.95));
  }
  // Faces the drivers (they look down -z, so the lamps face +z).
  g.position.set(0, 0, -1.2);
  scene.add(g);
  return lamps;
}

function nitroFlame(car) {
  // Points backwards out of the exhaust (the car faces -z).
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.75, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = Math.PI / 2;
  m.position.set(0, (car.userData.exhaustY ?? 0.35) + 0.02, (car.userData.rear ?? HALF_CAR) + 0.4);
  m.visible = false;
  car.add(m);
  return m;
}

export function createDrag3D(canvas, { me, rival }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a14);
  scene.fog = new THREE.Fog(0x070a14, 60, 340);
  scene.environment = nightEnv(renderer);
  // The strip's floodlights, broadly: a cool fill and two warm keys.
  scene.add(new THREE.HemisphereLight(0x9fb3d8, 0x1a1c22, 2.1));
  const key = new THREE.DirectionalLight(0xfff3dc, 1.8);
  key.position.set(-6, 14, 8);
  scene.add(key);
  const key2 = new THREE.DirectionalLight(0xfff3dc, 0.9);
  key2.position.set(8, 12, -20);
  scene.add(key2);

  buildStrip(scene);
  const tree = buildTree(scene);

  const mine = buildCar({ ...me, sport: true });
  const theirs = buildCar({ color: rival.color, body: rival.body, spoiler: "wing", rims: "black", height: "lowered", sport: true, plate: rival.plate || "" });
  mine.position.x = -LANE;
  theirs.position.x = LANE;
  scene.add(mine, theirs);
  const flames = [nitroFlame(mine), nitroFlame(theirs)];

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 800);
  const look = new THREE.Vector3();
  let shake = 0;
  let launchT = null;

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const setLamp = (m, on) => (m.emissiveIntensity = on ? 3.2 : 0.02);

  function update(race, dt) {
    const L = treeLights(race);
    tree.stage.forEach((m) => setLamp(m, true));
    tree.amber.forEach((row, i) => row.forEach((m) => setLamp(m, L.ambers > i && !L.green && !L.red)));
    tree.green.forEach((m) => setLamp(m, L.green && race.t < 4.5));
    tree.red.forEach((m) => setLamp(m, L.red));

    const z = (d) => HALF_CAR - 0.3 - d.x;
    mine.position.z = z(race.me);
    theirs.position.z = z(race.them);
    // A little squat at launch and nose-up under power.
    mine.rotation.x = race.me.launchedAt != null ? Math.min(0.035, race.me.v * 0.004) * (race.me.shiftLag > 0 ? 0.2 : 1) : 0;
    theirs.rotation.x = race.them.launchedAt != null ? Math.min(0.035, race.them.v * 0.004) * (race.them.shiftLag > 0 ? 0.2 : 1) : 0;
    flames[0].visible = race.me.nitroOn;
    flames[1].visible = race.them.nitroOn;
    for (const f of flames) if (f.visible) f.scale.set(1, 0.8 + Math.random() * 0.5, 1);

    // Camera: a low shot of the line and tree while staged, then a chase
    // cam behind your car that pulls back and widens with speed.
    if (race.me.launchedAt != null && launchT == null) launchT = race.t;
    const k = launchT == null ? 0 : Math.min(1, (race.t - launchT) / 0.8);
    const ease = k * k * (3 - 2 * k);
    const v = race.me.v;
    const cz = mine.position.z;
    // Staged: up behind both cars, the tree lit up ahead between them.
    const stagePos = new THREE.Vector3(-0.6, 2.6, cz + 9.5);
    const stageLook = new THREE.Vector3(0, 2.1, -3);
    const chasePos = new THREE.Vector3(-LANE + 0.9, 2.0 + v * 0.008, cz + 7.6 + v * 0.03);
    const chaseLook = new THREE.Vector3(-LANE + 0.4, 1.0, cz - 18);
    camera.position.lerpVectors(stagePos, chasePos, ease);
    look.lerpVectors(stageLook, chaseLook, ease);
    shake = race.me.shiftLag > 0 ? 0.05 : Math.max(0, shake - dt);
    if (v > 20) {
      camera.position.x += (Math.random() - 0.5) * 0.02 * (v / 50);
      camera.position.y += (Math.random() - 0.5) * 0.02 * (v / 50) + shake * 0.3;
    }
    camera.lookAt(look);
    const fov = 58 + Math.min(16, v * 0.28) + (race.me.nitroOn ? 4 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) for (const m of [].concat(o.material)) {
        m.map?.dispose();
        m.dispose();
      }
    });
  }

  return { update, resize, dispose };
}
