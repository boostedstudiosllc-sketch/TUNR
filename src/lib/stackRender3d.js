// Car Stack in 3D: a city lot with buildings around it (so you can feel
// the height), a flatbed to build on, the tower of cars swaying a little,
// the crane's cable with the next car on it, and cars that miss tumbling
// off. The sky goes from day to dusk to night to space as you climb.
// The game itself is stackEngine.js.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildCar } from "./rush3d.js";
import { CAR_H, DROP_H, topY, hookX, swayOf } from "./stackEngine.js";

const KEEP = 36; // cars kept on screen below the top

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Sky by height: day blue, dusk, night, then space.
const SKY = [
  [0, new THREE.Color("#7cc4f5")],
  [40, new THREE.Color("#f59e6b")],
  [80, new THREE.Color("#2b2a5c")],
  [130, new THREE.Color("#05060f")],
];
function skyAt(y, out) {
  for (let i = 1; i < SKY.length; i++) {
    if (y <= SKY[i][0]) return out.copy(SKY[i - 1][1]).lerp(SKY[i][1], (y - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]));
  }
  return out.copy(SKY[SKY.length - 1][1]);
}

function buildCity(scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const windows = canvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 10)
      for (let x = 4; x < w; x += 10) {
        ctx.fillStyle = Math.random() < 0.45 ? "#fde68a" : "#334155";
        ctx.fillRect(x, y, 6, 6);
      }
  });
  windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
  const rand = (() => {
    let s = 7;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  })();
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + rand() * 0.1;
    const d = 45 + rand() * 60;
    // Leave the view behind the camera open (it looks in from +z).
    if (Math.sin(a) > 0.55 && d < 70) continue;
    const h = 10 + rand() * (i % 5 === 0 ? 120 : 50);
    const w = 8 + rand() * 10;
    const tex = windows.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, w / 6), Math.max(1, h / 12));
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.8 }));
    b.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d - 10);
    scene.add(b);
  }
}

function stars() {
  const g = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * 0.9 + 0.05;
    const r = 500;
    pts.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0, depthWrite: false, fog: false }));
}

export function createStack3D(canvas, { myLook = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const sky = new THREE.Color("#7cc4f5");
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 80, 260);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xdbeafe, 0x334155, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(-20, 60, 30);
  scene.add(sun);
  const sunTarget = new THREE.Object3D();
  scene.add(sunTarget);
  sun.target = sunTarget;
  buildCity(scene);
  const starField = stars();
  scene.add(starField);

  // The flatbed the tower stands on.
  const bed = new THREE.Group();
  bed.add(new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.5, 3), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6, metalness: 0.3 })));
  bed.children[0].position.y = 0.25;
  scene.add(bed);

  // The tower sways from its base.
  const tower = new THREE.Group();
  scene.add(tower);

  // The crane: a beam overhead and a cable down to the hanging car.
  const steel = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5, metalness: 0.5 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(18, 0.5, 0.5), steel);
  scene.add(beam);
  const cableMat = new THREE.LineBasicMaterial({ color: 0x111111 });
  const cableGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const cable = new THREE.Line(cableGeo, cableMat);
  scene.add(cable);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1500);
  const cam = { y: 6 };
  const meshes = new Map(); // tower index → mesh
  let hangingMesh = null;
  let hangingCar = null;
  let fallingMesh = null;
  const dropMeshes = new Map();

  // A car lying across the tower (its length side to side).
  function carMesh(car) {
    const m = car.mine && myLook ? buildCar({ ...myLook, sport: true }) : buildCar({ color: car.color || "#1D4ED8", body: car.body || "coupe" });
    const holder = new THREE.Group();
    m.rotation.y = Math.PI / 2;
    m.position.y = -0.08;
    holder.add(m);
    return holder;
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let hop = 0;
  function render(g, dt, landed = false) {
    const top = topY(g);
    if (landed) hop = 0.18;
    hop = Math.max(0, hop - dt);

    // The tower: add new floors, drop ones far below.
    g.tower.forEach((c, i) => {
      if (i === 0 || meshes.has(i) || i < g.tower.length - KEEP) return;
      const m = carMesh(c);
      m.position.set(c.x, 0.5 + (i - 1) * CAR_H + CAR_H * 0.05, 0);
      tower.add(m);
      meshes.set(i, m);
    });
    for (const [i, m] of meshes) {
      if (i >= g.tower.length || i < g.tower.length - KEEP) {
        tower.remove(m);
        meshes.delete(i);
      }
    }
    // A little squash on the car that just landed.
    const last = meshes.get(g.tower.length - 1);
    if (last) last.scale.y = 1 - Math.sin((hop / 0.18) * Math.PI) * 0.12;
    tower.rotation.z = swayOf(g);

    // The hanging car (a new mesh whenever the next car changes).
    if (hangingCar !== g.hanging) {
      if (hangingMesh) scene.remove(hangingMesh);
      hangingMesh = carMesh(g.hanging);
      hangingCar = g.hanging;
      scene.add(hangingMesh);
    }
    const hookY = top + DROP_H + 0.5;
    const pivotY = hookY + 7;
    hangingMesh.visible = !g.falling && g.state === "play";
    const hx = hookX(g);
    hangingMesh.position.set(hx, hookY, 0);
    hangingMesh.rotation.z = -hx * 0.04;
    beam.position.set(0, pivotY, 0);
    const pts = cable.geometry.attributes.position;
    pts.setXYZ(0, 0, pivotY, 0);
    pts.setXYZ(1, g.falling ? 0 : hx, g.falling ? pivotY - 2 : hookY + 0.9, 0);
    pts.needsUpdate = true;

    // The falling car.
    if (g.falling) {
      if (!fallingMesh) {
        fallingMesh = hangingMesh;
        hangingMesh = null;
        hangingCar = null;
      }
      fallingMesh.visible = true;
      fallingMesh.position.set(g.falling.x, g.falling.y, 0);
    } else if (fallingMesh) {
      scene.remove(fallingMesh);
      fallingMesh = null;
    }

    // Cars that missed, tumbling away.
    for (const d of g.dropping) {
      let m = dropMeshes.get(d);
      if (!m) {
        m = carMesh(d.car);
        scene.add(m);
        dropMeshes.set(d, m);
      }
      m.position.set(d.x, d.y, 0);
      m.rotation.z = d.spin;
    }
    for (const [d, m] of dropMeshes)
      if (!g.dropping.includes(d)) {
        scene.remove(m);
        dropMeshes.delete(d);
      }

    // Camera: rises with the tower, a bit further out as it gets taller.
    cam.y += (top + 3 - cam.y) * Math.min(1, dt * 2.5);
    const back = 26 + Math.min(10, top * 0.04);
    camera.position.set(6, cam.y + 5, back);
    camera.lookAt(0, cam.y + 2.5, 0);
    sun.position.set(-20, cam.y + 50, 30);
    sunTarget.position.set(0, cam.y, 0);

    // The sky, by height.
    skyAt(cam.y, sky);
    scene.fog.color.copy(sky);
    starField.material.opacity = Math.max(0, Math.min(1, (cam.y - 70) / 50));
    starField.position.y = cam.y;
    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) for (const m of [].concat(o.material)) m.dispose();
    });
  }

  return { render, resize, dispose };
}
