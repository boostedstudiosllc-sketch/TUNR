#!/usr/bin/env node
// Checks the meet finder's file (data/found-meets/latest.json) before it's
// committed or loaded: { "found_at": "...", "meets": [ ... ] }. Prints what's
// wrong and exits 1, so a bad file never reaches the database.
//
//   node scripts/check-found-meets.mjs data/found-meets/latest.json
import { readFileSync } from "node:fs";

export const KINDS = ["meet", "show", "cruise", "track", "other"];
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// → a list of problems (empty when the file is fine).
export function checkFoundMeets(data) {
  const problems = [];
  if (!data || typeof data !== "object" || !Array.isArray(data.meets)) return ["The file needs a \"meets\" list."];
  if (data.meets.length > 300) problems.push("More than 300 meets in one file.");
  data.meets.forEach((m, i) => {
    const at = `Meet ${i + 1} (${m?.title || "no title"})`;
    if (!m || typeof m !== "object") return problems.push(`${at}: not an object.`);
    if (typeof m.title !== "string" || m.title.trim().length < 3 || m.title.length > 120) problems.push(`${at}: title must be 3–120 characters.`);
    if (!LOCAL.test(m.starts_local || "")) problems.push(`${at}: starts_local must look like 2026-12-05T18:00.`);
    if (m.ends_local && !LOCAL.test(m.ends_local)) problems.push(`${at}: ends_local must look like 2026-12-05T21:00.`);
    if (typeof m.location !== "string" || m.location.trim().length < 3) problems.push(`${at}: needs a location.`);
    if (!/^https:\/\//.test(m.source_url || "")) problems.push(`${at}: source_url must be an https link.`);
    if (m.kind && !KINDS.includes(m.kind)) problems.push(`${at}: kind must be one of ${KINDS.join(", ")}.`);
    if (m.instagram && !/^@?[A-Za-z0-9._]{1,30}$/.test(m.instagram)) problems.push(`${at}: instagram must be a handle like @ga.meets.`);
  });
  return problems;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const file = process.argv[2] || "data/found-meets/latest.json";
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Couldn't read ${file}: ${e.message}`);
    process.exit(1);
  }
  const problems = checkFoundMeets(data);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`${file}: ${data.meets.length} meets, all fine.`);
}
