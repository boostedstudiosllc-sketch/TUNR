// Light mode: swaps the dark theme's hard-coded greys in the app's screens
// for CSS variables, and writes src/theme.css, which gives each one its
// dark value (unchanged) and a light-mode value.
//
//   node scripts/theme-colors.mjs        (npm run theme)
//
// Run it again after adding screens: it's safe to repeat (already-swapped
// colours are left alone) and rebuilds theme.css from every variable in use.
//
// What it changes: neutral greys (#0A0A0A, #1a1a1a, #888, #F0F0F0, …) and
// white overlays (rgba(255,255,255,a)) in string literals of the screens.
// What it leaves: brand and accent colours (blue, gold, red, …); text on an
// accent background (white on blue stays white); canvas and SVG drawing
// colours; and the games and 3D screens, which stay dark by design.

import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DARK_ONLY = new Set([
  "Arcade.jsx", "CarSoccer.jsx", "DragFriend.jsx", "DragRace.jsx", "DriftKing.jsx", "EggHaul.jsx", "GuessCar.jsx", "KartGame.jsx",
  "ParkUp.jsx", "Showroom.jsx", "TunrRush.jsx", "Welcome.jsx", "Wrapped.jsx",
]);
const files = [path.join(ROOT, "src/App.jsx"), ...fs.readdirSync(path.join(ROOT, "src/components")).filter((f) => /\.jsx?$/.test(f) && !DARK_ONLY.has(f)).map((f) => path.join(ROOT, "src/components", f))];

const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const WHITE_A = /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,/g;
// rgba(10,10,10,a)-style surfaces; pure black (dimmers, photo viewers) stays.
const NEAR_BLACK = /rgba\(\s*(1?\d|20)\s*,\s*(1?\d|20)\s*,\s*(1?\d|20)\s*,\s*(0|0?\.\d+|1)\s*\)/g;
const SVG_ATTRS = new Set(["fill", "stroke", "stopColor", "floodColor", "lightingColor"]);
const CANVAS_PROPS = new Set(["fillStyle", "strokeStyle", "shadowColor"]);

const norm = (h) => {
  h = h.slice(1).toLowerCase();
  return h.length === 3 ? h.replace(/./g, "$&$&") : h;
};
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// A grey (or a blue-grey): little difference between the channels.
const isNeutral = (h) => {
  const [r, g, b] = rgb(h);
  return Math.max(r, g, b) - Math.min(r, g, b) <= 0.12;
};
const lightness = (h) => {
  const [r, g, b] = rgb(h);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};
// Swapped for a light-mode value: greys, and very dark tinted surfaces
// (the dark green "done" rows, navy panels) which become light tints.
const themeable = (h) => isNeutral(h) || lightness(h) < 0.2;
// Bright accent text (gold, mint, sky blue) that's made for a dark
// background: darkened in light mode so it can be read on white.
const brightText = (h) => !themeable(h) && lightness(h) > 0.55;
const hex = (ch) => "#" + ch.map((c) => Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, "0")).join("");

export function darkTextFor(h) {
  const [r, g, b] = rgb(h);
  const l = lightness(h);
  // Same hue, pulled down to a readable lightness.
  const k = 0.36 / l;
  return hex([r, g, b].map((c) => c * k));
}

// The light-mode value for a dark-mode grey. Darkest (the page) becomes a
// soft light grey, raised surfaces become white, borders light grey, dim
// text mid grey, and light text dark.
const hexOf = (r, g, b) => [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

export function lightFor(h) {
  const [r, g, b] = rgb(h);
  const l = lightness(h);
  let to;
  if (l <= 0.05) to = 0.955;
  else if (l <= 0.13) to = 1;
  else if (l <= 0.25) to = 0.9 - (l - 0.13) * 0.5;
  else if (l <= 0.45) to = 0.72 - (l - 0.25) * 0.6;
  else if (l <= 0.7) to = 0.42 - (l - 0.45) * 0.4;
  else to = 0.08 + (1 - l) * 0.5;
  // Keep the tint: blue-greys stay blue-grey, a dark green row turns pale green.
  const tint = [r - l, g - l, b - l].map((d) => d * (isNeutral(hexOf(r, g, b)) ? 0.6 : 1.4));
  return hex(tint.map((d) => to + d));
}

// Walks the AST, keeping each node's parents.
function walk(node, parents, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node, parents);
  const next = [...parents, node];
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "extra") continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => walk(c, next, visit));
    else if (v && typeof v.type === "string") walk(v, next, visit);
  }
}

const keyName = (p) => p.key?.name ?? p.key?.value;
const isAccentBackground = (src, obj) =>
  obj.properties.some((p) => {
    if (p.type !== "ObjectProperty" || !/^background(Color)?$/.test(keyName(p) || "")) return false;
    const text = src.slice(p.value.start, p.value.end);
    return (text.match(HEX) || []).some((h) => !themeable(norm(h)));
  });

const used = new Set();
const accents = new Set();
let changed = 0;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (/getContext|THREE\.|fillStyle/.test(src)) {
    console.warn(`skipped (draws on a canvas): ${path.relative(ROOT, file)}`);
    continue;
  }
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const edits = [];
  walk(ast.program, [], (node, parents) => {
    if (node.type !== "StringLiteral" && node.type !== "TemplateElement") return;
    // SVG attributes and canvas colours can't use CSS variables.
    for (const p of parents) {
      if (p.type === "JSXAttribute" && SVG_ATTRS.has(p.name.name)) return;
      if (p.type === "AssignmentExpression" && CANVAS_PROPS.has(p.left.property?.name)) return;
      if (p.type === "CallExpression" && /^(addColorStop|fillText|setAttribute)$/.test(p.callee.property?.name || "")) return;
    }
    // Text colour on an accent background stays as it is.
    const prop = [...parents].reverse().find((p) => p.type === "ObjectProperty");
    const obj = [...parents].reverse().find((p) => p.type === "ObjectExpression");
    if (prop && /^(color|caretColor)$/.test(keyName(prop) || "") && obj && isAccentBackground(src, obj)) return;
    const start = node.start + (node.type === "StringLiteral" ? 1 : 0);
    const text = node.type === "StringLiteral" ? node.value : src.slice(node.start, node.end);
    const isText = prop && /^(color|caretColor)$/.test(keyName(prop) || "");
    let out = text.replace(HEX, (h) => {
      const n = norm(h);
      if (themeable(n)) {
        used.add(n);
        return `var(--n-${n})`;
      }
      if (isText && brightText(n)) {
        accents.add(n);
        return `var(--a-${n})`;
      }
      return h;
    });
    out = out.replace(WHITE_A, "rgba(var(--ink),");
    // Near-black see-through surfaces (the bottom bar, fades into the page).
    out = out.replace(NEAR_BLACK, (m, r, g, b, a) => (r + g + b !== "000" && (Number(a) >= 0.9 || Number(a) === 0) ? `rgba(var(--base),${a})` : m));
    if (out !== text) edits.push([start, start + text.length, out]);
  });
  if (!edits.length) continue;
  let next = src;
  for (const [s, e, t] of edits.sort((a, b) => b[0] - a[0])) next = next.slice(0, s) + t + next.slice(e);
  fs.writeFileSync(file, next);
  changed += edits.length;
}

// Every variable in use anywhere (this run's and earlier ones').
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const m of text.matchAll(/var\(--n-([0-9a-f]{6})\)/g)) used.add(m[1]);
  for (const m of text.matchAll(/var\(--a-([0-9a-f]{6})\)/g)) accents.add(m[1]);
}
const list = [...used].sort();
const alist = [...accents].sort();
const css = `/* Made by scripts/theme-colors.mjs (npm run theme). Don't edit by hand:
   change lightFor() there and run it again. */
:root {
  --ink: 255, 255, 255;
  --base: 10, 10, 10;
${list.map((h) => `  --n-${h}: #${h};`).join("\n")}
${alist.map((h) => `  --a-${h}: #${h};`).join("\n")}
}
:root[data-theme="light"] {
  --ink: 15, 23, 42;
  --base: 244, 244, 244;
${list.map((h) => `  --n-${h}: ${lightFor(h)};`).join("\n")}
${alist.map((h) => `  --a-${h}: ${darkTextFor(h)};`).join("\n")}
}
`;
fs.writeFileSync(path.join(ROOT, "src/theme.css"), css);
console.log(`${changed} strings changed, ${list.length} greys and ${alist.length} text accents in src/theme.css`);
