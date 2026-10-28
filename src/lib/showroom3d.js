// The garage showroom in 3D (three.js, loaded only when it's shown): a
// bright studio garage with a glossy floor, a turntable, and your car
// slowly turning on it. Drag to spin it yourself. show(look) swaps the car
// with a little drop onto the turntable. Uses TUNR Rush's car model
// (rush3d.js), so the car looks the same here and in the game.

import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { buildCar } from "./rush3d.js";

function canvasTexture(w, h, draw, repeat = null) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

// What the car's paint and glass reflect: a big studio with soft light
// boxes overhead and tall strips down the sides, so the bodywork picks up
// long clean highlights like a real car under showroom lights.
function studioEnv(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x9aa0a8, side: THREE.BackSide }));
  room.position.y = 6;
  env.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x80858d }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.9;
  env.add(floor);
  const light = (w, h, strength, x, y, z, rx = 0, ry = 0) => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    m.color.setScalar(strength);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(x, y, z);
    p.rotation.set(rx, ry, 0);
    env.add(p);
  };
  for (const x of [-4, 0, 4]) light(2.2, 18, 9, x, 12.5, 0, Math.PI / 2);
  for (const side of [-1, 1]) {
    light(18, 1.4, 6, side * 14.5, 6, 0, 0, Math.PI / 2);
    light(18, 0.5, 4, side * 14.5, 2.5, 0, 0, Math.PI / 2);
  }
  light(16, 1.2, 5, 0, 7, -14.5);
  light(16, 1.2, 4, 0, 7, 14.5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(env, 0.03).texture;
  env.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return { pmrem, envMap };
}

// A bright, clean garage: white panelled walls, light strips, a glossy
// floor that mirrors the car (reflect: a real reflection; off on slow
// phones), and a low turntable with a glowing edge.
function buildGarage(scene, { reflect = true, w = 512, h = 512 } = {}) {
  let mirror = null;
  if (reflect) {
    mirror = new Reflector(new THREE.PlaneGeometry(60, 60), { textureWidth: w, textureHeight: h, color: 0x9a9da3, clipBias: 0.003 });
    mirror.rotation.x = -Math.PI / 2;
    scene.add(mirror);
  }
  // Polished floor tiles, see-through enough to show the reflection under it.
  const tiles = canvasTexture(256, 256, (ctx, tw, th) => {
    ctx.fillStyle = "#b4b9c1";
    ctx.fillRect(0, 0, tw, th);
    for (let i = 0; i < 4000; i++) {
      const v = Math.random() * 14 - 7;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
      ctx.fillRect(Math.random() * tw, Math.random() * th, 2, 2);
    }
    ctx.strokeStyle = "rgba(90,96,106,0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, tw, th);
  }, [12, 12]);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.32, metalness: 0.05, transparent: reflect, opacity: reflect ? 0.72 : 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.003;
  floor.receiveShadow = true;
  scene.add(floor);

  // White panelled walls with a long light strip across the back.
  const panels = canvasTexture(256, 512, (ctx, tw, th) => {
    ctx.fillStyle = "#e4e7eb";
    ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = "#cdd1d7";
    ctx.fillRect(tw - 3, 0, 3, th);
    ctx.fillRect(0, th - 40, tw, 40);
  }, [10, 1]);
  const wallMat = new THREE.MeshStandardMaterial({ map: panels, roughness: 0.75 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), wallMat);
  back.position.set(0, 4.5, -11);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-12, 4.5, 2);
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.x = 12;
  scene.add(back, left, right);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const band = new THREE.Mesh(new THREE.PlaneGeometry(36, 0.22), glowMat);
  band.position.set(0, 3.2, -10.98);
  scene.add(band);
  for (const side of [-1, 1]) {
    const sideBand = new THREE.Mesh(new THREE.PlaneGeometry(28, 0.22), glowMat);
    sideBand.rotation.y = -side * (Math.PI / 2);
    sideBand.position.set(side * 11.98, 3.2, 2);
    scene.add(sideBand);
  }
  const mark = canvasTexture(512, 128, (ctx, tw, th) => {
    ctx.clearRect(0, 0, tw, th);
    ctx.font = "900 110px 'Barlow Condensed', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#1b1e24";
    ctx.fillText("TUN", tw / 2 - 28, th / 2 + 6);
    ctx.fillStyle = "#0080F0";
    ctx.fillText("R", tw / 2 + 92, th / 2 + 6);
  });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshBasicMaterial({ map: mark, transparent: true }));
  logo.position.set(0, 5.2, -10.97);
  scene.add(logo);

  // Ceiling light panels.
  for (const x of [-5, 0, 5]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 14), glowMat);
    s.position.set(x, 8.6, 0);
    scene.add(s);
  }

  // The turntable: a low glossy disc with a glowing TUNR-blue edge.
  const table = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.45, 0.06, 72),
    new THREE.MeshPhysicalMaterial({ color: 0xe4e7eb, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, transparent: reflect, opacity: reflect ? 0.72 : 1 })
  );
  table.position.y = 0.03;
  table.receiveShadow = true;
  scene.add(table);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.43, 0.022, 8, 120), new THREE.MeshBasicMaterial({ color: 0x3aa0ff, toneMapped: false }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.045;
  scene.add(ring);
  if (mirror) {
    // The floor and turntable sit just above the mirror: hide them while it
    // draws the reflection, or they'd cover it.
    const draw = mirror.onBeforeRender;
    mirror.onBeforeRender = (...args) => {
      floor.visible = table.visible = false;
      draw(...args);
      floor.visible = table.visible = true;
    };
  }
  return { table, mirror };
}

// opts.interactive: drag to spin (and it turns by itself when left alone).
export function createShowroom(canvas, { lowPower = false, interactive = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9ecf0);
  scene.fog = new THREE.Fog(0xe9ecf0, 20, 42);
  const { pmrem, envMap } = studioEnv(renderer);
  scene.environment = envMap;
  scene.environmentIntensity = 1;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f98, 0.6));
  const spot = new THREE.SpotLight(0xffffff, 90, 30, Math.PI / 5, 0.6, 1.6);
  spot.position.set(1.5, 9, 3);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = !lowPower;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.radius = 6;
  scene.add(spot, spot.target);
  const reflectSize = lowPower ? 0 : Math.min(1024, Math.round(Math.max(canvas.clientWidth, 320) * Math.min(window.devicePixelRatio || 1, 2) * 0.6));
  const { table, mirror } = buildGarage(scene, { reflect: !lowPower, w: reflectSize, h: reflectSize });

  const holder = new THREE.Group();
  holder.position.y = 0.06;
  scene.add(holder);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  let car = null;
  let look = null;
  let drop = 0;
  let angle = Math.PI + 0.25; // nose toward the camera, three-quarters on
  let spin = 0.25; // rad/s
  let dragging = null;
  let raf = 0;
  let last = 0;
  let w = 1;
  let h = 1;
  let inset = { top: 0, bottom: 0, right: 0 };
  const REACH = { coupe: 2.6, sedan: 2.7, hatch: 2.45, suv: 2.8, truck: 3.2 };

  function frame() {
    // From the front three-quarters, far enough back that the whole car
    // fits in the part of the screen the menus don't cover, and centered
    // in it.
    const vw = Math.max(160, w - inset.right);
    const vh = Math.max(140, h - inset.top - inset.bottom);
    camera.aspect = w / h;
    // A tall phone gets a wider lens, so the car isn't miles away.
    camera.fov = Math.max(30, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(13)) * (h / vw))));
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const r = REACH[look?.body] || REACH.coupe;
    const d = Math.max(r / (t * (vw / h)), (0.75 * r) / (t * (vh / h))) * 1.2;
    const dir = new THREE.Vector3(4.7, 1.55, 6.5).normalize();
    camera.position.copy(dir.multiplyScalar(d));
    camera.lookAt(0, look?.body === "truck" || look?.body === "suv" ? 0.8 : 0.6, 0);
    camera.setViewOffset(w, h, inset.right / 2, (inset.bottom - inset.top) / 2, w, h);
    camera.updateProjectionMatrix();
  }

  // How much of the stage the menus cover (px), so the car sits in the rest.
  function setInsets(next) {
    inset = { top: 0, bottom: 0, right: 0, ...next };
    frame();
  }

  function show(next) {
    look = next;
    if (car) holder.remove(car);
    car = buildCar({ ...next, sport: true });
    car.traverse((o) => o.isMesh && (o.castShadow = true));
    holder.add(car);
    drop = 0.35;
    frame();
  }

  function resize(nw, nh) {
    w = Math.max(1, nw);
    h = Math.max(1, nh);
    renderer.setSize(w, h, false);
    frame();
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
    last = now;
    if (!dragging) {
      angle += spin * dt;
      // Settle back to a slow turn after a flick.
      spin += (0.25 - spin) * Math.min(1, dt * 1.5);
    }
    holder.rotation.y = angle;
    table.rotation.y = angle;
    drop = Math.max(0, drop - dt);
    holder.position.y = 0.06 + Math.sin((drop / 0.35) * Math.PI) * 0.25 * (drop > 0 ? 1 : 0);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(loop);

  // Drag to spin; let go to flick.
  const down = (e) => {
    dragging = { x: e.clientX, t: performance.now() };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.x;
    const now = performance.now();
    const step = (dx / Math.max(200, w)) * Math.PI * 1.6;
    angle += step;
    spin = step / Math.max(0.016, (now - dragging.t) / 1000);
    dragging = { x: e.clientX, t: now };
  };
  const up = () => {
    dragging = null;
    spin = Math.max(-6, Math.min(6, spin));
  };
  if (interactive) {
    canvas.style.touchAction = "pan-y";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  function dispose() {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    mirror?.dispose();
    renderer.dispose();
    pmrem.dispose();
    envMap?.dispose();
  }

  return { show, resize, setInsets, dispose };
}

// Small pictures of cars for the cards under the showroom: each look drawn
// once, from the front three-quarters (angle: the car's turn), in the studio. Returns data URLs
// in the same order. One short-lived renderer for all of them.
const thumbCache = new Map();
export function carThumbs(looks, W = 240, H = 140, angle = Math.PI + 0.25) {
  const key = (l) => JSON.stringify([l.color, l.body, l.spoiler, l.rims, l.height, l.brand, angle, W, H]);
  const missing = looks.filter((l) => !thumbCache.has(key(l)));
  if (missing.length) {
    const canvas = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe3e8);
    const { pmrem, envMap } = studioEnv(renderer);
    scene.environment = envMap;
    const key1 = new THREE.DirectionalLight(0xffffff, 1.2);
    key1.position.set(3, 6, 4);
    scene.add(key1, new THREE.HemisphereLight(0xffffff, 0x8a8f98, 0.5));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0xc9cdd3, roughness: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    for (const l of missing) {
      const car = buildCar({ ...l, sport: true });
      car.rotation.y = angle; // nose toward the camera, three-quarters on
      scene.add(car);
      const far = l.body === "truck" ? 1.15 : l.body === "suv" ? 1.08 : 1;
      camera.position.set(4.4 * far, 1.6 * far, 6 * far);
      camera.lookAt(0, 0.6, 0);
      renderer.render(scene, camera);
      thumbCache.set(key(l), canvas.toDataURL("image/jpeg", 0.85));
      scene.remove(car);
    }
    renderer.dispose();
    pmrem.dispose();
    envMap?.dispose();
    renderer.forceContextLoss?.();
  }
  return looks.map((l) => thumbCache.get(key(l)));
}
