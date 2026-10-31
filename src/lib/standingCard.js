import { initials } from "./standingText.js";

// The "Top X%" share image (1080×1350, for an Instagram post or story): the
// member's initials in a ring with a checkered-flag burst, TOP X% in big
// outlined letters, the city, the line, and TUNR with their @. Kept out of
// the component so the screen can be themed (scripts/theme-colors.mjs skips
// files that draw on a canvas).

function burst(ctx, x, y, r, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * 0.72 : r;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function wrap(ctx, text, x, y, width, lineH) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineH;
    } else line = next;
  }
  ctx.fillText(line, x, y);
}

export async function standingCard({ top, area, line, username }) {
  try {
    await document.fonts?.load?.("900 100px 'Barlow Condensed'");
  } catch (e) {
    console.warn("Font not ready for the card:", e.message);
  }
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 1350);
  g.addColorStop(0, "#0B1E3F");
  g.addColorStop(0.55, "#0A4F9C");
  g.addColorStop(1, "#06152E");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1080, 1350);
  // Speed lines.
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 6;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(-100, 120 + i * 95);
    ctx.lineTo(1180, 20 + i * 95);
    ctx.stroke();
  }
  ctx.textAlign = "center";
  // Ring with initials.
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(540, 430, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = "900 150px 'Barlow Condensed', sans-serif";
  ctx.fillText(initials(username), 540, 485);
  // The burst.
  ctx.fillStyle = "#FACC15";
  burst(ctx, 690, 290, 95, 12);
  ctx.fill();
  ctx.font = "80px sans-serif";
  ctx.fillText("🏁", 690, 318);
  // TOP X%.
  ctx.font = "900 230px 'Barlow Condensed', sans-serif";
  ctx.lineJoin = "round";
  ctx.lineWidth = 34;
  ctx.strokeStyle = "#0080F0";
  ctx.strokeText(`TOP ${top}%`, 540, 820);
  ctx.fillStyle = "#fff";
  ctx.fillText(`TOP ${top}%`, 540, 820);
  ctx.font = "900 96px 'Barlow Condensed', sans-serif";
  ctx.lineWidth = 20;
  ctx.strokeText(String(area || "TUNR").toUpperCase(), 540, 935);
  ctx.fillText(String(area || "TUNR").toUpperCase(), 540, 935);
  // The line.
  ctx.font = "500 44px 'Barlow', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  wrap(ctx, line, 540, 1040, 860, 58);
  // TUNR and the @.
  ctx.font = "900 96px 'Barlow Condensed', sans-serif";
  ctx.fillStyle = "#fff";
  ctx.fillText("TUN", 512, 1250);
  ctx.fillStyle = "#3CABFD";
  ctx.textAlign = "left";
  ctx.fillText("R", 512 + ctx.measureText("TUN").width / 2, 1250);
  ctx.textAlign = "center";
  ctx.font = "600 38px 'Barlow', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(`@${username}`, 540, 1305);
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("the picture couldn't be made"))), "image/png"));
}
