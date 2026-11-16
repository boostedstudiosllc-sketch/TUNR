import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Writes dist/precache.json: every file of this build (about 2 MB), so the
// service worker (public/sw.js) can keep them on the phone and the games,
// the parked-car card and saved meets work offline. The page itself is
// always fetched fresh when online, so a deploy shows up straight away.
function precacheList() {
  const publicFiles = (dir, base = dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? publicFiles(p, base) : ["/" + relative(base, p).split("\\").join("/")];
    });
  return {
    name: "tunr-precache-list",
    apply: "build",
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).map((f) => "/" + f);
      const extra = publicFiles("public").filter((f) => !/(^\/sw\.js|robots\.txt|sitemap\.xml)$/.test(f));
      const files = [...new Set([...built, ...extra])].filter((f) => f !== "/index.html").sort();
      this.emitFile({ type: "asset", fileName: "precache.json", source: JSON.stringify({ files }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), precacheList()],
});
