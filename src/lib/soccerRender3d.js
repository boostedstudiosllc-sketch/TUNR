// Drawing Turbo Ball in 3D (three.js, loaded only for the game): the arena,
// goals, ball, cars, boost pads, trails and goal explosions, with a ball cam
// (the camera keeps the ball in view behind your car) or a car cam.

import * as THREE from "three";
import { canvasTexture, box } from "./f1Render3d.js";
import { FIELD, GOAL, BALL, TEAM_COLORS } from "./soccerEngine.js";

const fwd = (h) => [-Math.sin(h), -Math.cos(h)];
const WALL_H = 16;

// The arena's outline, going round: straight sides and rounded corners,
// with points at the goal posts so the mouths line up.
function perimeter() {
  const { w: W, l: L, corner: R } = FIELD;
  const pts = [];
  const arc = (cx, cz, a0) => {
    for (let k = 0; k <= 8; k++) {
      const a = a0 + (k / 8) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    }
  };
  // Along the -z end (left to right), then round.
  pts.push([-GOAL.w, -L], [GOAL.w, -L]);
  arc(W - R, -L + R, -Math.PI / 2);
  arc(W - R, L - R, 0);
  pts.push([GOAL.w, L], [-GOAL.w, L]);
  arc(-W + R, L - R, Math.PI / 2);
  arc(-W + R, -L + R, Math.PI);
  pts.push([-GOAL.w, -L]);
  return pts;
}

function pitchTexture() {
  return canvasTexture(512, 768, (ctx, w, h) => {
    // Mown stripes, the two halves tinted for their team.
    for (let k = 0; k < 16; k++) {
      ctx.fillStyle = k % 2 ? "#2f7d3a" : "#358a41";
      ctx.fillRect(0, (k * h) / 16, w, h / 16 + 1);
    }
    ctx.fillStyle = "rgba(249,115,22,0.10)";
    ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = "rgba(0,128,240,0.12)";
    ctx.fillRect(0, h / 2, w, h / 2);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 5;
    const sx = w / (FIELD.w * 2);
    const sz = h / (FIELD.l * 2);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 9 * sx, 0, Math.PI * 2);
    ctx.stroke();
    for (const end of [0, h]) {
      const dir = end ? -1 : 1;
      ctx.strokeRect(w / 2 - 15 * sx, end ? end - 14 * sz : 0, 30 * sx, 14 * sz);
      ctx.beginPath();
      ctx.arc(w / 2, end + dir * 14 * sz, 6 * sx, end ? Math.PI : 0, end ? 0 : Math.PI);
      ctx.stroke();
    }
    // TUNR in the middle.
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.font = "900 64px 'Barlow Condensed', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TUNR", w / 2, h / 2);
  });
}

function buildArena(scene) {
  const { w: W, l: L } = FIELD;
  const outline = perimeter();

  // The pitch: the arena's shape, textured end to end.
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ShapeGeometry(shape, 4);
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W) / (2 * W), 1 - (pos.getY(i) + L) / (2 * L));
  geo.rotateX(Math.PI / 2);
  const pitch = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: pitchTexture(), roughness: 0.95, side: THREE.DoubleSide }));
  pitch.receiveShadow = true;
  scene.add(pitch);

  // Walls: tinted glass, with a band of boards along the bottom; open at the
  // goal mouths.
  const boards = canvasTexture(1024, 64, (ctx, w, h) => {
    const words = ["TUNR", "BOOSTED STUDIOS", "TURBO BALL", "BOOSTED STUDIOS"];
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
  const glass = new THREE.MeshStandardMaterial({ color: 0x9cc8ff, transparent: true, opacity: 0.12, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const boardMat = new THREE.MeshStandardMaterial({ map: boards, roughness: 0.6, side: THREE.DoubleSide });
  const rim = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  let run = 0;
  for (let k = 0; k < outline.length - 1; k++) {
    const [x0, z0] = outline[k];
    const [x1, z1] = outline[k + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) continue;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    const inMouth = Math.abs(mx) < GOAL.w && Math.abs(Math.abs(mz) - L) < 0.01;
    const bottom = inMouth ? GOAL.h : 0;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, WALL_H - bottom), glass);
    pane.position.set(mx, bottom + (WALL_H - bottom) / 2, mz);
    pane.rotation.y = yaw;
    scene.add(pane);
    const top = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, 0.12, 0.12), rim);
    top.position.set(mx, WALL_H, mz);
    top.rotation.y = yaw;
    scene.add(top);
    if (!inMouth) {
      const g = new THREE.PlaneGeometry(len, 1.4);
      const u = g.getAttribute("uv");
      for (let i = 0; i < u.count; i++) u.setX(i, (run + u.getX(i) * len) / 40);
      const band = new THREE.Mesh(g, boardMat);
      band.position.set(mx, 0.7, mz);
      band.rotation.y = yaw;
      scene.add(band);
    }
    run += len;
  }

  // Goals: a glowing frame in the team's color, nets on the back, sides and top.
  const net = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 3;
    for (let k = 0; k <= 64; k += 16) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k, h);
      ctx.moveTo(0, k);
      ctx.lineTo(w, k);
      ctx.stroke();
    }
  }, [8, 4]);
  for (const sz of [-1, 1]) {
    const team = sz > 0 ? 0 : 1; // the +z goal is blue's
    const color = new THREE.Color(TEAM_COLORS[team]);
    const frame = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.4 });
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, GOAL.h, 12), frame);
      post.position.set(sx * GOAL.w, GOAL.h / 2, 0);
      g.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, GOAL.w * 2 + 0.6, 12).rotateZ(Math.PI / 2), frame);
    bar.position.set(0, GOAL.h, 0);
    g.add(bar);
    const netMat = new THREE.MeshBasicMaterial({ map: net, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: 0xdde8ff });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.w * 2, GOAL.h), netMat);
    back.position.set(0, GOAL.h / 2, sz * GOAL.depth);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.w * 2, GOAL.depth), netMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, GOAL.h, (sz * GOAL.depth) / 2);
    g.add(back, roof);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.depth, GOAL.h), netMat);
      side.rotation.y = Math.PI / 2;
      side.position.set(sx * GOAL.w, GOAL.h / 2, (sz * GOAL.depth) / 2);
      g.add(side);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.w * 2, GOAL.depth), new THREE.MeshStandardMaterial({ color: 0x1f5e2a, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.01, (sz * GOAL.depth) / 2);
    g.add(floor);
    // A glow on the goal line.
    const line = new THREE.Mesh(new THREE.PlaneGeometry(GOAL.w * 2, 0.4), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.03, 0);
    g.add(line);
    g.position.z = sz * L;
    scene.add(g);
  }

  // The crowd all round, and light towers in the corners.
  const crowd = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#1c2030";
    ctx.fillRect(0, 0, w, h);
    const cols = ["#0080f0", "#f97316", "#facc15", "#f5f5f5", "#e11d2e", "#38bdf8"];
    for (let y = 4; y < h; y += 8) for (let x = 2; x < w; x += 5) {
      ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      ctx.fillRect(x, y, 3, 4);
    }
  }, [4, 1]);
  const standMat = new THREE.MeshStandardMaterial({ map: crowd, roughness: 0.9 });
  for (const [x, z, len, yaw] of [
    [0, -L - 22, W * 2 + 30, 0],
    [0, L + 22, W * 2 + 30, Math.PI],
    [-W - 14, 0, L * 2 + 20, Math.PI / 2],
    [W + 14, 0, L * 2 + 20, -Math.PI / 2],
  ]) {
    const stand = new THREE.Group();
    for (let tier = 0; tier < 6; tier++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(len, 2.4, 3.5), standMat);
      t.position.set(0, 1.2 + tier * 2.4, -tier * 3);
      stand.add(t);
    }
    stand.position.set(x, 0, z);
    stand.rotation.y = yaw;
    scene.add(stand);
  }
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x30343c, metalness: 0.6, roughness: 0.4 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [x, z] of [
    [-W - 12, -L - 12],
    [W + 12, -L - 12],
    [-W - 12, L + 12],
    [W + 12, L + 12],
  ]) {
    scene.add(box(1, 34, 1, towerMat, x, 17, z));
    scene.add(box(6, 3, 0.6, lampMat, x, 35, z));
  }
}

// A chunky little battle car, nose toward -z: big wheels, a wing, and a
// boost nozzle with a flame.
export function buildBallCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Group(); // tips over for flips
  g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0d1a26, metalness: 0.9, roughness: 0.1 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.8, roughness: 0.25 });
  body.add(box(2.0, 0.6, 3.7, paint, 0, 0.75, 0));
  const nose = box(1.9, 0.3, 0.9, paint, 0, 0.98, -1.35);
  nose.rotation.x = -0.25;
  body.add(nose);
  body.add(box(1.5, 0.55, 1.6, glass, 0, 1.32, 0.25));
  body.add(box(1.45, 0.06, 1.3, paint, 0, 1.62, 0.3));
  body.add(box(2.1, 0.12, 0.3, dark, 0, 0.5, -1.9));
  body.add(box(1.9, 0.08, 0.45, dark, 0, 1.55, 1.75)); // wing
  for (const sx of [-1, 1]) body.add(box(0.08, 0.45, 0.4, dark, sx * 0.85, 1.3, 1.7));
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.4, 12).rotateX(Math.PI / 2), dark);
  nozzle.position.set(0, 0.8, 1.95);
  body.add(nozzle);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.3, 12).rotateX(Math.PI / 2), flameMat);
  flame.position.set(0, 0.8, 2.75);
  flame.visible = false;
  body.add(flame);
  const wheels = [];
  const front = [];
  for (const [wx, wz] of [
    [-1.05, -1.2],
    [1.05, -1.2],
    [-1.05, 1.2],
    [1.05, 1.2],
  ]) {
    const holder = new THREE.Group();
    holder.position.set(wx, 0.48, wz);
    const w = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.42, 20).rotateZ(Math.PI / 2), tyre);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.43, 12).rotateZ(Math.PI / 2), rim);
    w.add(t, r);
    holder.add(w);
    body.add(holder);
    wheels.push(w);
    if (wz < 0) front.push(holder);
  }
  body.traverse((o) => o.isMesh && (o.castShadow = true));
  g.userData = { body, wheels, front, flame, flameMat };
  return g;
}

function ballTexture() {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#eef2f7";
    ctx.fillRect(0, 0, w, h);
    // Dark panels in a staggered grid, and a blue band round the middle.
    ctx.fillStyle = "#1f2937";
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 8; col++) {
        const x = (col + (row % 2) * 0.5) * (w / 8);
        const y = (row + 0.5) * (h / 4);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.lineTo(x + Math.cos(a) * 18, y + Math.sin(a) * 14);
        }
        ctx.fill();
      }
    }
    ctx.fillStyle = "#0080f0";
    ctx.fillRect(0, h / 2 - 7, w, 14);
  });
}

export function createSoccerScene(canvas, match, { lowPower = false, ballCam = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = canvasTexture(4, 256, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#050816");
    gr.addColorStop(0.6, "#16224a");
    gr.addColorStop(1, "#2a3a6e");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  });
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x22301f, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -FIELD.w - 4, right: FIELD.w + 4, top: FIELD.l + 10, bottom: -FIELD.l - 10, near: 1, far: 150 });
  sun.position.set(20, 60, 15);
  scene.add(sun, sun.target);
  // The ground beyond the arena.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);
  buildArena(scene);

  // Boost pads: a glowing disc, and a floating orb on the big ones.
  const padOn = new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false });
  const padOff = new THREE.MeshBasicMaterial({ color: 0x4a3a1a });
  const pads = match.pads.map((p) => {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(p.big ? 1.8 : 1, p.big ? 1.8 : 1, 0.12, 24), padOn);
    disc.position.y = 0.06;
    g.add(disc);
    let orb = null;
    if (p.big) {
      orb = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc94d, toneMapped: false }));
      orb.position.y = 1.4;
      g.add(orb);
    }
    g.position.set(p.x, 0, p.z);
    scene.add(g);
    return { disc, orb };
  });

  // The ball and its shadow spot (helps judge where it'll land).
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL.r, 32, 20), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.35, metalness: 0.1, emissive: 0x111827 }));
  ball.castShadow = true;
  scene.add(ball);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(BALL.r, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  spot.rotation.x = -Math.PI / 2;
  scene.add(spot);

  const cars = match.cars.map((c) => {
    const m = buildBallCar(c.color);
    scene.add(m);
    return m;
  });
  // A ring under your car, so you can always find it.
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.75, 32), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);

  // Boost trails and goal bursts: a pool of glowing puffs.
  const puffTex = canvasTexture(64, 64, (ctx, w, h) => {
    const gr = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
  });
  const puffs = [];
  for (let k = 0; k < 90; k++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.visible = false;
    scene.add(sp);
    puffs.push({ sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1 });
  }
  let nextPuff = 0;
  const puff = (x, y, z, color, { vx = 0, vy = 0, vz = 0, size = 1, max = 0.5 } = {}) => {
    const p = puffs[nextPuff];
    nextPuff = (nextPuff + 1) % puffs.length;
    Object.assign(p, { life: 0, max, vx, vy, vz, size });
    p.sp.material.color.set(color);
    p.sp.position.set(x, y, z);
    p.sp.visible = true;
  };

  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1500);
  const cam = { x: match.player.x, y: 4, z: match.player.z + 8, lx: 0, ly: 1, lz: 0, h: match.player.heading };
  let useBallCam = ballCam;
  let lastState = match.state;
  const spinAxis = new THREE.Vector3();
  const spinQ = new THREE.Quaternion();

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render(match, dt) {
    const b = match.ball;
    // A goal: the ball bursts in the scoring team's color.
    if (match.state === "goal" && lastState !== "goal") {
      const team = match.events.find?.((e) => e.kind === "goal")?.team ?? (b.z < 0 ? 0 : 1);
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const s = 8 + Math.random() * 14;
        puff(b.x, b.y, b.z, TEAM_COLORS[team], { vx: Math.cos(a) * Math.sqrt(1 - u * u) * s, vy: Math.abs(u) * s, vz: Math.sin(a) * Math.sqrt(1 - u * u) * s, size: 2.5, max: 1.3 });
      }
    }
    lastState = match.state;
    ball.visible = match.state !== "goal";
    spot.visible = ball.visible;

    ball.position.set(b.x, b.y, b.z);
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0.05 && dt > 0) {
      spinAxis.set(b.vz, 0, -b.vx).normalize();
      spinQ.setFromAxisAngle(spinAxis, (-sp * dt) / BALL.r);
      ball.quaternion.premultiply(spinQ);
    }
    spot.position.set(b.x, 0.03, b.z);
    const sh = Math.max(0.35, 1 - (b.y - BALL.r) / 14);
    spot.scale.set(sh, sh, sh);
    spot.material.opacity = 0.4 * sh;

    match.cars.forEach((c, k) => {
      const m = cars[k];
      const { body, wheels, front, flame, flameMat } = m.userData;
      m.position.set(c.x, c.y, c.z);
      m.rotation.y = c.heading;
      // Flips: a full turn over (or sideways) while the flip lasts.
      const turn = c.flipT > 0 ? (1 - c.flipT / 0.65) * Math.PI * 2 : 0;
      body.rotation.set(-turn * c.flipDir[0], 0, turn * c.flipDir[1]);
      body.position.y = c.flipT > 0 ? Math.sin(turn / 2) * 0.8 : 0;
      for (const f of front) f.rotation.y = c.steer * 0.45;
      for (const w of wheels) w.rotation.x -= (c.speed * dt) / 0.48;
      flame.visible = c.boosting;
      if (c.boosting) {
        const f = 0.8 + Math.random() * 0.5;
        flame.scale.set(f, f, f * 1.3);
        flameMat.color.set(c.team === 0 ? 0x7dd3fc : 0xffb347);
        if (dt > 0 && Math.random() < 0.7) {
          const [hx, hz] = fwd(c.heading);
          puff(c.x - hx * 2.8, c.y + 0.8, c.z - hz * 2.8, c.team === 0 ? 0x38bdf8 : 0xff9a3c, { vy: 0.5, size: 1.1, max: 0.45 });
        }
      }
    });
    const me = match.player;
    ring.position.set(me.x, 0.04, me.z);
    ring.visible = me.onGround;

    match.pads.forEach((p, k) => {
      const on = p.back <= 0;
      pads[k].disc.material = on ? padOn : padOff;
      if (pads[k].orb) {
        pads[k].orb.visible = on;
        pads[k].orb.position.y = 1.4 + Math.sin(match.time * 3 + k) * 0.2;
      }
    });

    for (const p of puffs) {
      if (!p.sp.visible) continue;
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        p.sp.visible = false;
        continue;
      }
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      p.sp.material.opacity = 0.9 * (1 - t);
      const s = p.size * (0.6 + t * 1.4);
      p.sp.scale.set(s, s, 1);
    }

    // Camera: behind your car, looking at the ball (ball cam) or down the
    // car's nose (car cam). Kept inside the arena.
    let dx;
    let dz;
    if (useBallCam && match.state !== "goal") {
      dx = b.x - me.x;
      dz = b.z - me.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;
    } else {
      cam.h += Math.atan2(Math.sin(me.heading - cam.h), Math.cos(me.heading - cam.h)) * Math.min(1, dt * 6 || 1);
      [dx, dz] = fwd(cam.h);
    }
    const tx = Math.max(-FIELD.w + 1, Math.min(FIELD.w - 1, me.x - dx * 9.5));
    const tz = Math.max(-FIELD.l - GOAL.depth + 1, Math.min(FIELD.l + GOAL.depth - 1, me.z - dz * 9.5));
    const ty = me.y + 4.4;
    const k = Math.min(1, dt * 8 || 1);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
    cam.z += (tz - cam.z) * k;
    const look = useBallCam && match.state !== "goal" ? [me.x + (b.x - me.x) * 0.6, Math.min(b.y, 8) * 0.6 + 1, me.z + (b.z - me.z) * 0.6] : [me.x + dx * 8, 1.2, me.z + dz * 8];
    cam.lx += (look[0] - cam.lx) * k;
    cam.ly += (look[1] - cam.ly) * k;
    cam.lz += (look[2] - cam.lz) * k;
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(cam.lx, cam.ly, cam.lz);
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

  return { render, resize, dispose, setBallCam: (on) => (useBallCam = on) };
}
