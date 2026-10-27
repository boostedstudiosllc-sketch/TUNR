// Drawing Boosted Karts in 3D (three.js, loaded only for the game). The
// track, walls, gantry and scenery come from Drift King's drawing code; this
// adds the karts, boost pads, obstacles, drift sparks and nitro flames, and
// a low chase camera.

import * as THREE from "three";
import { canvasTexture, speckle, LOOKS, box, buildCircuit, buildSurroundings } from "./f1Render3d.js";
import { PAD, TRACK_W } from "./kartEngine.js";
import { locate } from "./f1Engine.js";

const fwd = (h) => [-Math.sin(h), -Math.cos(h)];

// A go-kart with its driver, nose toward -z. Returns the group with its
// front wheels (to steer), all wheels (to spin), the two exhaust flames and
// the two drift-spark sprites.
export function buildKart(color, accent = "#F5F5F5") {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.35 });
  const trim = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.9, roughness: 0.3 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.7, roughness: 0.3 });

  g.add(box(1.05, 0.07, 1.9, dark, 0, 0.13, 0)); // frame
  g.add(box(0.95, 0.22, 0.45, paint, 0, 0.26, -0.82)); // nose
  g.add(box(1.3, 0.09, 0.14, dark, 0, 0.17, -1.06)); // front bumper
  g.add(box(0.5, 0.05, 0.3, trim, 0, 0.38, -0.82)); // number panel
  for (const sx of [-1, 1]) g.add(box(0.22, 0.2, 0.95, paint, sx * 0.56, 0.24, 0.05)); // side pods
  g.add(box(0.5, 0.12, 0.5, dark, 0, 0.26, 0.28)); // seat base
  g.add(box(0.5, 0.46, 0.1, dark, 0, 0.48, 0.5)); // seat back
  g.add(box(0.42, 0.3, 0.36, metal, 0.24, 0.34, 0.82)); // engine
  g.add(box(1.3, 0.11, 0.12, dark, 0, 0.2, 1.06)); // rear bumper
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 10).rotateX(Math.PI / 2), metal);
  pipe.position.set(-0.22, 0.38, 0.98);
  g.add(pipe);
  // Steering column and wheel.
  const col = box(0.05, 0.05, 0.5, dark, 0, 0.42, -0.4);
  col.rotation.x = -0.6;
  g.add(col);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 20), dark);
  sw.position.set(0, 0.6, -0.2);
  sw.rotation.x = -0.9;
  g.add(sw);
  // The driver.
  const suit = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6 });
  g.add(box(0.44, 0.44, 0.3, suit, 0, 0.6, 0.3)); // body
  for (const sx of [-1, 1]) {
    const arm = box(0.1, 0.1, 0.45, suit, sx * 0.2, 0.66, 0.05);
    arm.rotation.x = 0.35;
    g.add(arm);
    g.add(box(0.12, 0.12, 0.55, suit, sx * 0.13, 0.36, -0.25)); // legs
  }
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.25 }));
  helmet.position.set(0, 1.0, 0.27);
  helmet.castShadow = true;
  g.add(helmet);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.1), new THREE.MeshStandardMaterial({ color: 0x0b0b0b, metalness: 0.9, roughness: 0.1 }));
  visor.position.set(0, 1.01, 0.1);
  g.add(visor);

  const wheels = [];
  const front = [];
  for (const [wx, wz, r, w] of [
    [-0.63, -0.68, 0.2, 0.18],
    [0.63, -0.68, 0.2, 0.18],
    [-0.65, 0.7, 0.24, 0.26],
    [0.65, 0.7, 0.24, 0.26],
  ]) {
    const holder = new THREE.Group();
    holder.position.set(wx, r, wz);
    const wheel = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20).rotateZ(Math.PI / 2), tyre);
    t.castShadow = true;
    const rm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.01, 12).rotateZ(Math.PI / 2), rim);
    wheel.add(t, rm);
    holder.add(wheel);
    g.add(holder);
    wheels.push(wheel);
    if (wz < 0) front.push(holder);
  }

  // Nitro and boost flames out of the pipe.
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.9, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.7, 10).rotateX(Math.PI / 2), flameMat);
  flame.position.set(-0.22, 0.38, 1.5);
  flame.visible = false;
  g.add(flame);

  // Drift sparks at the back wheels.
  const sparks = [-0.65, 0.65].map((sx) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(sx, 0.18, 1.0);
    sp.visible = false;
    g.add(sp);
    return sp;
  });
  g.userData = { wheels, front, flame, flameMat, sparks };
  return g;
}

let sparkTexture = null;
function sparkTex() {
  if (!sparkTexture) {
    sparkTexture = canvasTexture(64, 64, (ctx, w, h) => {
      const gr = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.3, "rgba(255,255,255,0.8)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
    });
  }
  return sparkTexture;
}

function buildObstacle(o) {
  const g = new THREE.Group();
  if (o.kind === "barrel") {
    const tex = canvasTexture(64, 64, (ctx, w, h) => {
      for (let y = 0; y < 4; y++) {
        ctx.fillStyle = y % 2 ? "#f5f5f5" : "#f97316";
        ctx.fillRect(0, (y * h) / 4, w, h / 4);
      }
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    m.position.y = 0.6;
    m.castShadow = true;
    g.add(m);
  } else if (o.kind === "crate") {
    const tex = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = "#a16207";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#713f12";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.beginPath();
      ctx.moveTo(3, 3);
      ctx.lineTo(w - 3, h - 3);
      ctx.stroke();
    });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 1.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    m.position.y = 0.65;
    m.rotation.y = o.s;
    m.castShadow = true;
    g.add(m);
  } else if (o.kind === "cone") {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 14), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5 }));
    m.position.y = 0.4;
    m.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    band.position.y = 0.45;
    const base = box(0.62, 0.05, 0.62, new THREE.MeshStandardMaterial({ color: 0xff6a00 }), 0, 0.025, 0);
    g.add(m, band, base);
  } else {
    // Oil: a dark, glossy puddle.
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(o.r, 24),
      new THREE.MeshStandardMaterial({ color: 0x050505, metalness: 0.4, roughness: 0.05, transparent: true, opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.04;
    m.scale.set(1, 0.75, 1);
    g.add(m);
  }
  g.position.set(o.x, 0, o.z);
  return g;
}

export function createKartScene(canvas, race, { lowPower = false } = {}) {
  const track = race.track;
  const look = LOOKS[track.look] || LOOKS.day;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = look.night ? 1.15 : 0.95;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = canvasTexture(4, 256, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, look.sky[0]);
    gr.addColorStop(0.5, look.sky[1]);
    gr.addColorStop(1, look.sky[1]);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(new THREE.Color(look.sky[1]), 200, 900);
  scene.add(new THREE.HemisphereLight(look.night ? 0x8a93c8 : 0xdbe8ff, look.night ? 0x202028 : 0x5a5040, look.night ? 1.4 : 1.1));
  const sun = new THREE.DirectionalLight(look.night ? 0xe8eeff : 0xfff2dd, look.night ? 1.2 : 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 150 });
  scene.add(sun, sun.target);

  const groundTex = canvasTexture(256, 256, (ctx, w, h) => speckle(ctx, w, h, look.ground, 26, 9000, 2), [200, 200]);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const { lightMats } = buildCircuit(scene, track, look);
  buildSurroundings(scene, track, look);

  // Boost pads: glowing chevrons that scroll forward.
  const padTex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#003a75";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 16;
    ctx.lineJoin = "round";
    for (const y of [20, 84]) {
      ctx.beginPath();
      ctx.moveTo(18, y + 34);
      ctx.lineTo(w / 2, y);
      ctx.lineTo(w - 18, y + 34);
      ctx.stroke();
    }
  }, [1, 2]);
  const padMat = new THREE.MeshBasicMaterial({ map: padTex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  for (const p of race.pads) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(PAD.width, PAD.length), padMat);
    m.rotation.set(-Math.PI / 2, p.heading, 0, "YXZ");
    m.position.set(p.x, 0.05, p.z);
    scene.add(m);
  }

  const obstacles = race.obstacles.map((o) => {
    const m = buildObstacle(o);
    scene.add(m);
    return m;
  });

  const karts = race.cars.map((c) => {
    const m = buildKart(c.color, c.accent || "#F5F5F5");
    m.traverse((o) => o.isMesh && (o.castShadow = true));
    scene.add(m);
    return m;
  });
  const me = race.cars.indexOf(race.player);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
  const cam = { h: race.player.heading, fov: 70 };
  let time = 0;
  let hop = 0;
  let wasDrifting = false;

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render(race, dt) {
    time += dt;
    const p = race.player;
    if (p.drifting && !wasDrifting) hop = 0.25;
    wasDrifting = p.drifting;
    hop = Math.max(0, hop - dt);

    race.cars.forEach((c, k) => {
      const m = karts[k];
      const speed = c.ai ? c.v : c.speed;
      m.position.set(c.x, k === me ? Math.sin((hop / 0.25) * Math.PI) * 0.35 : 0, c.z);
      m.rotation.y = c.heading + (c.ai ? 0 : c.yawOff);
      for (const f of m.userData.front) f.rotation.y = c.ai ? 0 : c.steer * 0.45;
      for (const w of m.userData.wheels) w.rotation.x -= (speed * dt) / 0.22;
      // Flames while boosting: blue-white for nitro, orange otherwise.
      const boosting = c.boost > 0;
      const { flame, flameMat, sparks } = m.userData;
      flame.visible = boosting;
      if (boosting) {
        flameMat.color.set(c.boostKind === "nitro" ? 0x7dd3fc : 0xffa94d);
        const f = 0.8 + Math.random() * 0.5 + (c.boostKind === "nitro" ? 0.6 : 0);
        flame.scale.set(f, f, f * 1.4);
      }
      // Sparks: white while it charges, then blue, then orange.
      const level = c.ai ? (c.drifting ? 0 : -1) : c.drifting ? c.driftLevel : -1;
      for (const sp of sparks) {
        sp.visible = level >= 0;
        if (level >= 0) {
          sp.material.color.set(level === 2 ? 0xfb923c : level === 1 ? 0x38bdf8 : 0xe5e7eb);
          const s = (level === 0 ? 0.35 : 0.6) * (0.7 + Math.random() * 0.6);
          sp.scale.set(s, s, 1);
        }
      }
    });

    // Knocked cones are gone until your next lap.
    race.obstacles.forEach((o, k) => (obstacles[k].visible = o.goneLap !== p.lap));
    padTex.offset.y = (time * 1.5) % 1;

    // Start lights.
    const lit = race.state === "countdown" ? Math.min(5, Math.floor((race.time + 3) / 0.55) + 1) : 0;
    lightMats.forEach((m, k) => {
      const on = k < lit;
      m.color.set(on ? 0xff1a1a : 0x220000);
      m.emissive.set(on ? 0xff0000 : 0x000000);
      m.emissiveIntensity = on ? 2.5 : 0;
    });

    // Camera: low behind the kart, trailing its heading a little so drifts
    // show; widens with a boost.
    const aimH = p.spin > 0 ? p.slide : p.heading;
    cam.h += Math.atan2(Math.sin(aimH - cam.h), Math.cos(aimH - cam.h)) * Math.min(1, dt * 5 || 1);
    const [cx, cz] = fwd(cam.h);
    // Kept on the track side of the tyre walls, so it never looks through one.
    let camX = p.x - cx * 5.4;
    let camZ = p.z - cz * 5.4;
    const at = locate(track, camX, camZ, p.idx);
    const room = TRACK_W / 2 + (at.side > 0 ? track.roL[at.i] : track.roR[at.i]) - 0.4;
    if (Math.abs(at.side) > room) {
      const [tx, tz] = fwd(track.heading[at.i]);
      const back = (Math.abs(at.side) - room) * Math.sign(at.side);
      camX -= tz * back;
      camZ += tx * back;
    }
    camera.position.set(camX, 2.4, camZ);
    camera.lookAt(p.x + cx * 7, 0.7, p.z + cz * 7);
    const want = 68 + Math.min(8, Math.abs(p.speed) * 0.25) + (p.boost > 0 ? (p.boostKind === "nitro" ? 14 : 8) : 0);
    cam.fov += (want - cam.fov) * Math.min(1, dt * 5 || 1);
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
    sun.target.position.set(p.x, 0, p.z);
    sun.position.set(p.x + 30, 60, p.z + 20);
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

  return { render, resize, dispose };
}
