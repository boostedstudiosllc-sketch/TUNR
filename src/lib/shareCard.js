// Share cards: a branded picture of a meet, a car or a part for sale, made
// on the phone (canvas), for the Share sheet (ShareSheet.jsx): Save, Copy
// Image, Copy Link, Share to… cardContent() is plain data, so it's
// unit-tested (test/shareCard.test.js); drawCard() paints it.

const stamp = (now) => {
  const d = new Date(now);
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `${day} @ ${time}`;
};
const money = (c) => (c == null ? "Make an offer" : c === 0 ? "Free" : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: c % 100 ? 2 : 0, minimumFractionDigits: c % 100 ? 2 : 0 })}`);

// → { kicker, title, sub, lines[], chips[], image, link, accent, footer }
export function cardContent(kind, data, { origin = "", now = Date.now() } = {}) {
  const footer = stamp(now);
  if (kind === "meet") {
    const e = data;
    const going = Number(e.goingCount ?? e.going ?? 0);
    return {
      kicker: e.promoted ? "⭐ PROMOTED MEET" : "CAR MEET",
      title: e.title,
      sub: [e.when, e.city].filter(Boolean).join(" · "),
      lines: [e.location ? `📍 ${e.location}` : "", e.host ? `Hosted by ${e.host.startsWith("@") ? e.host : `@${e.host}`}` : ""].filter(Boolean),
      chips: [e.vibe, going > 0 ? `${going} going` : "", e.verified ? "✓ Verified host" : ""].filter(Boolean),
      image: e.photoUrl || e.flyerUrl || null,
      link: `${origin}/m/${e.slug || e.id}`,
      accent: "#0080F0",
      footer,
    };
  }
  if (kind === "car") {
    const c = data;
    const name = [c.year, c.make, c.model].filter(Boolean).join(" ");
    return {
      kicker: "MY BUILD",
      title: c.nickname || name,
      sub: c.nickname ? name : [c.trim, c.owner?.username ? `@${c.owner.username}` : ""].filter(Boolean).join(" · "),
      lines: [c.engine ? `⚙️ ${c.engine}` : "", c.horsepower ? `${c.horsepower} hp${c.torque ? ` · ${c.torque} lb-ft` : ""}` : "", c.stage ? `Stage: ${c.stage}` : ""].filter(Boolean),
      chips: [c.drivetrain, c.transmission, Array.isArray(c.mods) && c.mods.length ? `${c.mods.length} mod${c.mods.length === 1 ? "" : "s"}` : ""].filter(Boolean),
      image: c.photo_url || null,
      link: `${origin}/?car=${c.id}`,
      accent: "#A855F7",
      footer,
    };
  }
  if (kind === "listing") {
    const l = data;
    return {
      kicker: "FOR SALE ON TUNR",
      title: l.title,
      sub: [money(l.price_cents), l.city].filter(Boolean).join(" · "),
      lines: [l.fitLabel ? `🚗 Fits ${l.fitLabel}` : "", l.part_number ? `Part # ${l.part_number}` : ""].filter(Boolean),
      chips: [l.conditionLabel, l.categoryLabel].filter(Boolean),
      image: l.photos?.[0] || null,
      link: `${origin}/?open=listing:${l.id}`,
      accent: "#16A34A",
      footer,
    };
  }
  throw new Error(`Unknown share card: ${kind}`);
}

// Splits text into lines that fit a width.
function wrap(ctx, text, width, max = 2) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = `${lines[max - 1].replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}

function loadImage(src) {
  return new Promise((ok) => {
    if (!src) return ok(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => ok(img);
    img.onerror = () => ok(null); // the card still works without its photo
    img.src = src;
    setTimeout(() => ok(null), 6000);
  });
}

const W = 1080;
const H = 1350;

// Paints a card → a PNG Blob.
export async function drawCard(card) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  try {
    await document.fonts?.ready;
  } catch {
    // fonts are nice to have
  }
  ctx.fillStyle = "#0D0F14";
  ctx.fillRect(0, 0, W, H);

  // Photo (or a colour wash), darker at the bottom.
  const img = await loadImage(card.image);
  const photoH = 640;
  if (img) {
    const s = Math.max(W / img.width, photoH / img.height);
    const w = img.width * s;
    const h = img.height * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, photoH);
    ctx.clip();
    try {
      ctx.drawImage(img, (W - w) / 2, (photoH - h) / 2, w, h);
    } catch {
      // a photo the browser won't let us paint: skip it
    }
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, 0, W, photoH);
    g.addColorStop(0, card.accent);
    g.addColorStop(1, "#0D0F14");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, photoH);
    ctx.font = "900 220px 'Barlow Condensed', Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillText("TUNR", 70, 420);
  }
  const fade = ctx.createLinearGradient(0, photoH - 260, 0, photoH);
  fade.addColorStop(0, "rgba(13,15,20,0)");
  fade.addColorStop(1, "rgba(13,15,20,1)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, photoH - 260, W, 260);

  // Brand + kicker on top.
  ctx.font = "900 48px 'Barlow Condensed', Arial, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(48, 44, ctx.measureText("TUNR").width + 72, 76, 38);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fillText("TUN", 84, 99);
  ctx.fillStyle = "#3CABFD";
  ctx.fillText("R", 84 + ctx.measureText("TUN").width, 99);

  let y = photoH + 10;
  ctx.fillStyle = card.accent;
  ctx.font = "900 34px 'Barlow Condensed', Arial, sans-serif";
  ctx.fillText(card.kicker, 72, y);
  y += 84;
  ctx.fillStyle = "#fff";
  ctx.font = "900 84px 'Barlow Condensed', Arial, sans-serif";
  for (const line of wrap(ctx, card.title, W - 144, 2)) {
    ctx.fillText(line, 72, y);
    y += 86;
  }
  if (card.sub) {
    ctx.fillStyle = "#CBD5E1";
    ctx.font = "700 40px 'Barlow', Arial, sans-serif";
    ctx.fillText(wrap(ctx, card.sub, W - 144, 1)[0], 72, y + 4);
    y += 66;
  }
  ctx.font = "600 36px 'Barlow', Arial, sans-serif";
  ctx.fillStyle = "#E5E7EB";
  for (const line of card.lines.slice(0, 3)) {
    ctx.fillText(wrap(ctx, line, W - 144, 1)[0], 72, y + 4);
    y += 54;
  }
  // Chips.
  let x = 72;
  y += 18;
  ctx.font = "800 30px 'Barlow Condensed', Arial, sans-serif";
  for (const chip of card.chips.slice(0, 4)) {
    const w = ctx.measureText(chip).width + 44;
    if (x + w > W - 72) break;
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y - 38, w, 56, 28);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(chip, x + 22, y);
    x += w + 14;
  }

  // Where to find it (people see screenshots without the link).
  ctx.fillStyle = "#94A3B8";
  ctx.font = "600 30px 'Barlow', Arial, sans-serif";
  const shown = card.link.replace(/^https?:\/\//, "");
  ctx.fillText(`🔗 ${wrap(ctx, shown, W - 190, 1)[0]}`, 72, H - 170);

  // Footer, like a receipt.
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(48, H - 130, W - 96, 2);
  ctx.fillStyle = "#fff";
  ctx.font = "900 44px 'Barlow Condensed', Arial, sans-serif";
  ctx.fillText("TUN", 72, H - 62);
  ctx.fillStyle = "#3CABFD";
  ctx.fillText("R", 72 + ctx.measureText("TUN").width, H - 62);
  ctx.fillStyle = "#94A3B8";
  ctx.font = "600 30px 'Barlow', Arial, sans-serif";
  const f = card.footer;
  ctx.fillText(f, W - 72 - ctx.measureText(f).width, H - 64);

  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("the picture couldn't be made"))), "image/png"));
}
