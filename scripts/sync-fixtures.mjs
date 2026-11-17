#!/usr/bin/env node
/**
 * Copies QLC+'s fixture library into public/fixtures and builds an index the
 * app uses to find definitions automatically.
 *
 *   npm run sync-fixtures                 # clone QLC+ (sparse) and copy the library
 *   QLC_SRC=/path/to/qlcplus npm run sync-fixtures   # use an existing checkout
 *
 * The QLC+ fixture library is licensed under the Apache License 2.0 by the QLC+
 * project; see public/fixtures/LICENSE-QLCPLUS.txt and NOTICE.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = "https://github.com/mcallegari/qlcplus.git";
const out = join(process.cwd(), "public", "fixtures");

let src = process.env.QLC_SRC;
let cleanup = null;
if (!src) {
  const tmp = mkdtempSync(join(tmpdir(), "qlcplus-"));
  cleanup = tmp;
  src = join(tmp, "qlcplus");
  console.log("Fetching the QLC+ fixture library…");
  execFileSync("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", REPO, src], { stdio: "inherit" });
  execFileSync("git", ["sparse-checkout", "set", "resources/fixtures"], { cwd: src, stdio: "inherit" });
}

const libDir = join(src, "resources", "fixtures");
if (!existsSync(libDir)) {
  console.error(`No fixture library at ${libDir}`);
  process.exit(1);
}
let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: src }).toString().trim();
} catch {
  /* not a git checkout */
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const tag = (xml, name) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() ?? "";
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const key = (m, n) => `${m.trim().toLowerCase()}|${n.trim().toLowerCase()}`;

const fixtures = {};
let count = 0;
for (const dir of readdirSync(libDir, { withFileTypes: true })) {
  if (!dir.isDirectory() || dir.name === "scripts") continue;
  for (const file of readdirSync(join(libDir, dir.name))) {
    if (!file.endsWith(".qxf")) continue;
    const xml = readFileSync(join(libDir, dir.name, file), "utf8");
    const manufacturer = decode(tag(xml, "Manufacturer"));
    const model = decode(tag(xml, "Model"));
    if (!manufacturer || !model) continue;
    mkdirSync(join(out, dir.name), { recursive: true });
    cpSync(join(libDir, dir.name, file), join(out, dir.name, file));
    fixtures[key(manufacturer, model)] = `${dir.name}/${file}`;
    count++;
  }
}

for (const lic of ["COPYING", "LICENSE"]) {
  if (existsSync(join(src, lic))) {
    cpSync(join(src, lic), join(out, "LICENSE-QLCPLUS.txt"));
    break;
  }
}
writeFileSync(
  join(out, "index.json"),
  JSON.stringify({ source: `${REPO}@${commit}`, generated: new Date().toISOString(), count, fixtures }),
);
console.log(`Copied ${count} fixture definitions (QLC+ ${commit.slice(0, 10)}) to public/fixtures`);
if (cleanup) rmSync(cleanup, { recursive: true, force: true });
