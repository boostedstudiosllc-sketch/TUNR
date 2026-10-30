// Drawing for a scratch card's silver layer (ScratchCards.jsx), kept apart
// so the screen itself can follow light mode (scripts/theme-colors.mjs skips
// files that draw on a canvas).

// Silver foil with "SCRATCH HERE", sized for the screen.
export function drawFoil(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const g = ctx.createLinearGradient(0, 0, r.width, r.height);
  g.addColorStop(0, "#d1d5db");
  g.addColorStop(0.5, "#9ca3af");
  g.addColorStop(1, "#e5e7eb");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, r.width, r.height);
  ctx.fillStyle = "rgba(55,65,81,0.55)";
  ctx.font = "900 22px 'Barlow Condensed', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SCRATCH HERE", r.width / 2, r.height / 2 + 8);
}

// Rubs off a finger-wide line from `from` (or a dot) to (x, y).
export function rub(canvas, from, x, y) {
  const ctx = canvas.getContext("2d");
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = 44;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(from?.x ?? x, from?.y ?? y);
  ctx.lineTo(x + 0.01, y);
  ctx.stroke();
}

// How much of the foil is gone, 0–1 (sampled).
export function rubbedOff(canvas) {
  const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  let clear = 0;
  let n = 0;
  for (let i = 3; i < data.length; i += 4 * 40) {
    n++;
    if (data[i] === 0) clear++;
  }
  return n ? clear / n : 0;
}
