/**
 * Checks run on the finished workspace before the user downloads it.
 * Errors mean QLC+ would likely reject or misplay the file; warnings mean a
 * look may not show light the way the user expects.
 */
import { shutterValueMeaning, strobeOffValue, type FixtureProfile } from "./fixture";
import { childElements, firstChild, getAttr, textOf, walk } from "./xml";
import type { Workspace } from "./workspace";

export interface Issue {
  level: "error" | "warning";
  message: string;
  functionName?: string;
}

export function checkWorkspace(ws: Workspace, profiles: Map<number, FixtureProfile>, onlyPathPrefix?: string): Issue[] {
  const issues: Issue[] = [];
  const engine = ws.engine;
  const fixtures = new Map(childElements(engine, "Fixture").map((f) => [Number(textOf(firstChild(f, "ID"))), Number(textOf(firstChild(f, "Channels")))]));
  const fnEls = childElements(engine, "Function");
  const ids = new Set<number>();
  for (const f of fnEls) {
    const id = Number(getAttr(f, "ID"));
    if (ids.has(id)) issues.push({ level: "error", message: `Two functions share ID ${id}` });
    ids.add(id);
  }
  const groupIds = new Set(childElements(engine, "FixtureGroup").map((g) => Number(getAttr(g, "ID"))));

  for (const f of fnEls) {
    const name = getAttr(f, "Name") ?? "";
    const path = getAttr(f, "Path") ?? "";
    const ours = !onlyPathPrefix || path === onlyPathPrefix || path.startsWith(onlyPathPrefix + "/");
    if (!ours) continue;
    const type = getAttr(f, "Type");

    for (const s of childElements(f, "Step")) {
      const ref = Number(textOf(s));
      if (!ids.has(ref)) issues.push({ level: "error", message: `"${name}" refers to a function (${ref}) that doesn't exist`, functionName: name });
    }
    if (type === "RGBMatrix") {
      const g = Number(textOf(firstChild(f, "FixtureGroup")));
      if (!groupIds.has(g)) issues.push({ level: "error", message: `"${name}" uses a fixture group that doesn't exist`, functionName: name });
    }
    if (type === "EFX") {
      for (const fx of childElements(f, "Fixture")) {
        const fid = Number(textOf(firstChild(fx, "ID")));
        const p = profiles.get(fid);
        if (p && !p.isMover) issues.push({ level: "warning", message: `"${name}" moves fixture ${fid}, which has no pan/tilt`, functionName: name });
      }
    }
    if (type !== "Scene") continue;

    for (const fv of childElements(f, "FixtureVal")) {
      const fid = Number(getAttr(fv, "ID"));
      const count = fixtures.get(fid);
      if (count === undefined) {
        issues.push({ level: "error", message: `"${name}" sets fixture ${fid}, which isn't in the workspace`, functionName: name });
        continue;
      }
      const nums = textOf(fv).trim() ? textOf(fv).split(",").map((x) => Number(x.trim())) : [];
      if (nums.length % 2) issues.push({ level: "error", message: `"${name}" has a malformed value list for fixture ${fid}`, functionName: name });
      const seen = new Map<number, number>();
      for (let i = 0; i + 1 < nums.length; i += 2) {
        const ch = nums[i]!;
        const v = nums[i + 1]!;
        if (!Number.isInteger(ch) || ch < 0 || ch >= count) issues.push({ level: "error", message: `"${name}" sets channel ${ch + 1} on fixture ${fid}, which only has ${count} channels`, functionName: name });
        if (!Number.isInteger(v) || v < 0 || v > 255) issues.push({ level: "error", message: `"${name}" has value ${v} (must be 0-255)`, functionName: name });
        if (seen.has(ch)) issues.push({ level: "error", message: `"${name}" sets channel ${ch + 1} on fixture ${fid} twice`, functionName: name });
        seen.set(ch, v);
      }
      const p = profiles.get(fid);
      if (!p) continue;
      for (const sh of p.shutters) {
        // Channels defined only by a preset carry no capability list; QLC+ fills
        // those in itself, so only explicit capability lists are judged here.
        if (!seen.has(sh.channel) || sh.capabilities.length === 0) continue;
        const value = seen.get(sh.channel)!;
        const meaning = shutterValueMeaning(sh, value);
        // The value that stops a strobe ("No function" on many heads' strobe
        // channels, where the light then shines normally) is written on purpose
        // in sections without a strobe, so a strobe from earlier doesn't carry on.
        if (meaning === "unknown" && value === strobeOffValue(p, sh.channel)) continue;
        if (meaning === "closed" || meaning === "unknown") {
          issues.push({
            level: "warning",
            message: `"${name}" sets "${sh.name}" to ${seen.get(sh.channel)} on fixture ${fid}. The definition doesn't say that value opens the shutter, so the fixture may stay dark in QLC+.`,
            functionName: name,
          });
        }
      }
      const colorSet = p.heads.some((h) => [h.red, h.green, h.blue, h.white].some((c) => c !== undefined && (seen.get(c) ?? 0) > 0));
      if (colorSet && p.masterDimmer !== undefined && seen.has(p.masterDimmer) && seen.get(p.masterDimmer) === 0) {
        issues.push({ level: "warning", message: `"${name}" sets a color on fixture ${fid} but its dimmer is at 0`, functionName: name });
      }
    }
  }

  // Virtual Console buttons must point at real functions.
  if (ws.virtualConsole) {
    for (const e of walk(ws.virtualConsole)) {
      if (e.name !== "Function") continue;
      const id = Number(getAttr(e, "ID"));
      if (!ids.has(id)) issues.push({ level: "warning", message: `A Virtual Console widget points at function ${id}, which doesn't exist` });
    }
  }
  return issues;
}
