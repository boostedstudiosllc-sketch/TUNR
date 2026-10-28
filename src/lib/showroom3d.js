// The garage showroom in 3D (three.js, loaded only when it's shown): a dark
// garage with light strips on the ceiling, a lit turntable, and your car
// slowly turning on it. Drag to spin it yourself. show(look) swaps the car
// with a little drop onto the turntable. Uses TUNR Rush's car model
// (rush3d.js), so the car looks the same here and in the game.

import * as THREE from "three";
import { buildCar, paintedSky, LIGHT } from "./rush3d.js";

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

function buildGarage(scene) {
  // Polished concrete.
  const concrete = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#24262b";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = Math.random() * 30 - 15;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, w, h);
  }, [10, 10]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: concrete, roughness: 0.45, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Walls: pale panels behind and to the sides, with a roller door and the
  // TUNR mark on the back wall.
  const panels = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#c9ccd2";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b3b7bf";
    ctx.fillRect(0, h - 6, w, 6);
    ctx.fillRect(w - 4, 0, 4, h);
  }, [6, 2]);
  const wallMat = new THREE.MeshStandardMaterial({ map: panels, roughness: 0.8 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 9), wallMat);
  back.position.set(0, 4.5, -11);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-12, 4.5, 2);
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.x = 12;
  scene.add(back, left, right);
  const door = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#8d9199";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#7a7e86";
    for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 3);
  });
  const roller = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.2), new THREE.MeshStandardMaterial({ map: door, roughness: 0.6, metalness: 0.4 }));
  roller.position.set(-5, 2.6, -10.98);
  scene.add(roller);
  const mark = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = "900 110px 'Barlow Condensed', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#16181d";
    ctx.fillText("TUN", w / 2 - 28, h / 2 + 6);
    ctx.fillStyle = "#0080F0";
    ctx.fillText("R", w / 2 + 92, h / 2 + 6);
  });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: mark, transparent: true }));
  logo.position.set(4.5, 5.2, -10.97);
  scene.add(logo);

  // Ceiling light strips.
  const strip = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of [-6, -2, 2, 6]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 16), strip);
    s.position.set(x, 8.6, 0);
    scene.add(s);
  }

  // The turntable, ringed with TUNR blue.
  const table = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.7, 0.14, 64), new THREE.MeshStandardMaterial({ color: 0x15181e, roughness: 0.22, metalness: 0.7 }));
  table.position.y = 0.07;
  table.receiveShadow = true;
  scene.add(table);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.66, 0.035, 8, 96), new THREE.MeshBasicMaterial({ color: 0x0080f0, toneMapped: false }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.14;
  scene.add(ring);
  // A soft pool of light on the floor round it.
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(6, 48),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(128, 128, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, "rgba(255,255,255,0.22)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.01;
  scene.add(glow);
  return table;
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
  scene.background = new THREE.Color(0x0c0e12);
  scene.fog = new THREE.Fog(0x0c0e12, 18, 40);
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(35), THREE.MathUtils.degToRad(140));
  const { pmrem, envMap } = paintedSky(renderer, LIGHT.noon, sun);
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xe6ecff, 0x1a1a1a, 0.5));
  const spot = new THREE.SpotLight(0xffffff, 140, 30, Math.PI / 5, 0.5, 1.6);
  spot.position.set(1.5, 9, 3);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = !lowPower;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot, spot.target);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.6);
  fill.position.set(-6, 4, 6);
  scene.add(fill);
  const table = buildGarage(scene);

  const holder = new THREE.Group();
  holder.position.y = 0.14;
  scene.add(holder);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  let car = null;
  let look = null;
  let drop = 0;
  let angle = Math.PI - 0.6; // nose toward the camera, three-quarters on
  let spin = 0.25; // rad/s
  let dragging = null;
  let raf = 0;
  let last = 0;
  let w = 1;
  let h = 1;

  function frame() {
    // Wide stage: from the front three-quarters. Tall: further back.
    const aspect = w / h;
    const far = (look?.body === "truck" ? 1.15 : look?.body === "suv" ? 1.08 : 1) * (aspect < 1.3 ? 1.35 : 1);
    camera.aspect = aspect;
    camera.position.set(4.6 * far, 2.3 * far, 6.4 * far);
    camera.lookAt(0, look?.body === "truck" || look?.body === "suv" ? 0.85 : 0.65, 0);
    camera.updateProjectionMatrix();
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
    holder.position.y = 0.14 + Math.sin((drop / 0.35) * Math.PI) * 0.25 * (drop > 0 ? 1 : 0);
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
    renderer.dispose();
    pmrem.dispose();
    envMap?.dispose();
  }

  return { show, resize, dispose };
}

// Small pictures of cars for the cards under the showroom: each look drawn
// once, from the front three-quarters, on a dark floor. Returns data URLs
// in the same order. One short-lived renderer for all of them.
const thumbCache = new Map();
export function carThumbs(looks, W = 240, H = 140) {
  const key = (l) => JSON.stringify([l.color, l.body, l.spoiler, l.rims, l.height]);
  const missing = looks.filter((l) => !thumbCache.has(key(l)));
  if (missing.length) {
    const canvas = document.createElement("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1d23);
    const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(35), THREE.MathUtils.degToRad(140));
    const { pmrem, envMap } = paintedSky(renderer, LIGHT.noon, sun);
    scene.environment = envMap;
    scene.environmentIntensity = 0.7;
    const key1 = new THREE.DirectionalLight(0xffffff, 2);
    key1.position.set(3, 6, 4);
    scene.add(key1, new THREE.HemisphereLight(0xe6ecff, 0x222222, 0.6));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    for (const l of missing) {
      const car = buildCar({ ...l, sport: true });
      car.rotation.y = Math.PI - 0.6;
      scene.add(car);
      const far = l.body === "truck" ? 1.15 : l.body === "suv" ? 1.08 : 1;
      camera.position.set(4.4 * far, 1.9 * far, 6 * far);
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
