// The demo project loads as a real show would: every light found in QLC+'s
// library, every light given a job, and every song exporting cleanly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fixtureKey, generateSet, guessRig, matchProfiles, parseFixtureDef, parseWorkspace, readProjectFile, type FixtureDef } from "../src/core";

const pub = (p: string) => new URL(`../public/${p}`, import.meta.url);
const demo = readProjectFile(readFileSync(pub("demo.lightsmith"), "utf8"));
// The library is fetched by `npm run sync-fixtures` (CI does this first).
const hasLibrary = existsSync(pub("fixtures/index.json"));

test("the demo's lights are all in QLC+'s library, and each gets a job", { skip: !hasLibrary && "run npm run sync-fixtures first" }, () => {
  const index = JSON.parse(readFileSync(pub("fixtures/index.json"), "utf8")) as { fixtures: Record<string, string> };
  assert.ok(demo.project.demo);
  assert.ok(demo.showFile);
  const ws = parseWorkspace(demo.showFile!.xml);
  assert.equal(ws.fixtures.length, 10);
  const defs = new Map<string, FixtureDef>();
  for (const f of ws.fixtures) {
    const path = index.fixtures[fixtureKey(f.manufacturer, f.model)];
    assert.ok(path, `${f.manufacturer} ${f.model} is in the library`);
    defs.set(fixtureKey(f.manufacturer, f.model), parseFixtureDef(readFileSync(pub(`fixtures/${path}`), "utf8")));
  }
  const { profiles, missing } = matchProfiles(ws.fixtures, defs);
  assert.equal(missing.length, 0);
  const rig = guessRig(ws.fixtures, profiles, undefined, ws.stage);
  const count = (role: string) => rig.fixtures.filter((f) => f.role === role).length;
  assert.equal(count("ignore"), 0);
  assert.equal(count("mover"), 2);
  assert.equal(count("backdrop"), 4);
  assert.equal(count("side"), 2);
  assert.equal(count("front"), 2);
  assert.equal(demo.project.songs.length, 3);
  for (const s of demo.project.songs) assert.ok(s.sections.length >= 6, s.title);
  const out = generateSet({ ws, profiles, rig, songs: demo.project.songs });
  assert.ok(out);
});
