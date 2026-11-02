import { classOf, classLine, positionLine, sinceShort, slipRows, slipNumber, barcode } from "./standingText.js";

// The time slip as a share image (1080×1350, an Instagram post or story):
// the printed slip, a little crooked, on asphalt, with the class stamped in
// red. Same content as StandingCard.jsx. Kept out of the component because
// the theme script skips files that draw on a canvas.

const PAPER = "#F4EFE2";
const INK = "#1D1B18";
const STAMP = "#C81E2C";
const MONO = "'Space Mono', 'Courier New', monospace";

function wrap(ctx, text, x, y, width, lineH) {
  let line = "";
  for (const w of text.split(" ")) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineH;
    } else line = next;
  }
  ctx.fillText(line, x, y);
  return y + lineH;
}

// The slip's outline with torn (zig-zag) top and bottom edges.
function slipPath(ctx, x, y, w, h, tooth = 22) {
  ctx.beginPath();
  ctx.moveTo(x, y + tooth / 2);
  for (let i = 0; i < w / tooth; i++) {
    ctx.lineTo(x + i * tooth + tooth / 2, y);
    ctx.lineTo(x + (i + 1) * tooth, y + tooth / 2);
  }
  ctx.lineTo(x + w, y + h - tooth / 2);
  for (let i = Math.ceil(w / tooth); i > 0; i--) {
    ctx.lineTo(x + i * tooth - tooth / 2, y + h);
    ctx.lineTo(x + (i - 1) * tooth, y + h - tooth / 2);
  }
  ctx.closePath();
}

function dashed(ctx, x1, x2, y) {
  ctx.save();
  ctx.strokeStyle = "rgba(29,27,24,0.4)";
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

export async function timeSlipImage({ st, activity = null, username }) {
  try {
    await Promise.all([document.fonts?.load?.("900 100px 'Barlow Condensed'"), document.fonts?.load?.("700 30px 'Space Mono'"), document.fonts?.load?.("400 30px 'Space Mono'")]);
  } catch (e) {
    console.warn("Fonts not ready for the slip:", e.message);
  }
  const cls = classOf(st);
  const area = String(st.area || "TUNR").toUpperCase();
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const ctx = c.getContext("2d");

  // Asphalt and the lane stripes.
  const g = ctx.createRadialGradient(300, 260, 50, 540, 675, 1000);
  g.addColorStop(0, "#2A2A2A");
  g.addColorStop(1, "#101010");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "rgba(250,204,21,0.08)";
  ctx.fillRect(140, 0, 14, 1350);
  ctx.fillRect(926, 0, 14, 1350);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 1080, Math.random() * 1350, 2, 2);
  }

  // The slip.
  const W = 700, H = 1210, X = (1080 - W) / 2, Y = 70;
  ctx.save();
  ctx.translate(540, 675);
  ctx.rotate(-0.026);
  ctx.translate(-540, -675);
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 24;
  slipPath(ctx, X, Y, W, H);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.shadowColor = "transparent";

  const L = X + 50, R = X + W - 50, CX = 540;
  let y = Y + 100;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = "900 92px 'Barlow Condensed', sans-serif";
  ctx.fillText("T U N R", CX, y);
  y += 46;
  ctx.font = `400 25px ${MONO}`;
  ctx.fillText(`OFFICIAL TIME SLIP · ${area}`, CX, y);
  y += 34;
  ctx.globalAlpha = 0.6;
  ctx.fillText(`${slipNumber(username)} · LAST 12 MONTHS`, CX, y);
  ctx.globalAlpha = 1;
  y += 30;
  dashed(ctx, L, R, y);
  y += 52;

  // Rows: label left, dot leaders, value right.
  const row = (label, value, bold = false) => {
    ctx.font = `${bold ? 700 : 400} 29px ${MONO}`;
    ctx.textAlign = "left";
    ctx.fillText(label, L, y);
    ctx.textAlign = "right";
    ctx.fillText(String(value), R, y);
    const from = L + ctx.measureText(label).width + 16;
    const to = R - ctx.measureText(String(value)).width - 16;
    ctx.textAlign = "left";
    ctx.globalAlpha = 0.45;
    if (to > from) ctx.fillText(".".repeat(Math.floor((to - from) / ctx.measureText(".").width)), from, y);
    ctx.globalAlpha = 1;
    y += 41;
  };
  row("DRIVER", `@${username}`);
  if (st.member_since) row("SINCE", sinceShort(st.member_since));
  row("LANE", area);
  y -= 14;
  dashed(ctx, L, R, y);
  y += 52;
  for (const [label, value] of slipRows(st, activity)) row(label, value, label === "POSITION");
  y -= 14;
  dashed(ctx, L, R, y);

  // The class stamp.
  y += 40;
  const sw = 470, sh = 176;
  ctx.save();
  ctx.translate(CX, y + sh / 2);
  ctx.rotate(-0.09);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = STAMP;
  ctx.lineWidth = 7;
  ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
  ctx.lineWidth = 3;
  ctx.strokeRect(-sw / 2 + 12, -sh / 2 + 12, sw - 24, sh - 24);
  ctx.fillStyle = STAMP;
  ctx.textAlign = "center";
  ctx.font = `700 24px ${MONO}`;
  ctx.fillText("C L A S S", 0, -sh / 2 + 44);
  ctx.font = `900 ${cls.name.length > 9 ? 78 : 88}px 'Barlow Condensed', sans-serif`;
  ctx.fillText(cls.name, 0, 38);
  ctx.font = `700 24px ${MONO}`;
  ctx.fillText(`TOP ${cls.top}% · ${area}`, 0, sh / 2 - 22);
  ctx.restore();
  y += sh + 56;

  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = "500 30px 'Barlow', sans-serif";
  y = wrap(ctx, classLine(st), CX, y, W - 110, 40);
  if (positionLine(st)) {
    ctx.font = `400 23px ${MONO}`;
    ctx.globalAlpha = 0.7;
    ctx.fillText(positionLine(st).toUpperCase(), CX, y);
    ctx.globalAlpha = 1;
    y += 24;
  }

  // Barcode at the foot of the slip.
  const bars = barcode(username);
  const unit = 5, gap = 4;
  const total = bars.reduce((n, w) => n + w * unit + gap, 0);
  let bx = CX - total / 2;
  // Under the text, or nearer the foot when the slip is short (someone else's).
  const by = Math.max(y + 10, Y + H - 260);
  bars.forEach((w, i) => {
    if (i % 2 === 0) ctx.fillRect(bx, by, w * unit, 64);
    bx += w * unit + gap;
  });
  ctx.restore();

  // The one line off the slip: where it's from.
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "700 28px 'Barlow Condensed', sans-serif";
  ctx.fillText("ATLANTA CAR MEETS · TUNR", CX, 1325);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("the picture couldn't be made"))), "image/png"));
}
