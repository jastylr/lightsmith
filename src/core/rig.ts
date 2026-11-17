/**
 * Matching workspace fixtures to definitions, and a first guess at how each
 * fixture is used on stage. The user corrects the guess in the Rig step.
 */
import { buildProfile, fixtureKey, type FixtureDef, type FixtureProfile } from "./fixture";
import type { Rig, RigFixture, Role, Side } from "./model";
import type { WsFixture } from "./workspace";

export interface ProfileResult {
  profiles: Map<number, FixtureProfile>;
  /** Fixtures whose definition we don't have (or whose mode is missing). */
  missing: { fixture: WsFixture; reason: string }[];
}

export function matchProfiles(fixtures: WsFixture[], defs: Map<string, FixtureDef>): ProfileResult {
  const profiles = new Map<number, FixtureProfile>();
  const missing: ProfileResult["missing"] = [];
  for (const f of fixtures) {
    const def = defs.get(fixtureKey(f.manufacturer, f.model));
    if (!def) {
      missing.push({ fixture: f, reason: "No fixture definition loaded" });
      continue;
    }
    try {
      const p = buildProfile(def, f.mode);
      if (p.channelCount !== f.channels && f.channels > 0) {
        missing.push({ fixture: f, reason: `Definition mode has ${p.channelCount} channels, workspace says ${f.channels}` });
        continue;
      }
      profiles.set(f.id, p);
    } catch (e) {
      missing.push({ fixture: f, reason: (e as Error).message });
    }
  }
  return { profiles, missing };
}

export function guessRole(p: FixtureProfile): Role {
  if (p.isMover) return "mover";
  if (p.heads.length === 0) return "ignore";
  const type = p.def.type.toLowerCase();
  if (p.heads.length >= 4 || type.includes("bar") || type.includes("pixel")) return "backdrop";
  return "side";
}

export function guessRig(fixtures: WsFixture[], profiles: Map<number, FixtureProfile>, previous?: Rig): Rig {
  // Only keep what the user actually set; guesses are redone as definitions arrive.
  const prev = new Map(previous?.fixtures.filter((f) => f.userSet).map((f) => [f.fixtureId, f]));
  const byRole = new Map<Role, WsFixture[]>();
  const roles = new Map<number, Role>();
  for (const f of fixtures) {
    const p = profiles.get(f.id);
    const role = prev.get(f.id)?.role ?? (p ? guessRole(p) : "ignore");
    roles.set(f.id, role);
    byRole.set(role, [...(byRole.get(role) ?? []), f]);
  }
  const out: RigFixture[] = [];
  for (const f of fixtures) {
    const kept = prev.get(f.id);
    if (kept) {
      out.push(kept);
      continue;
    }
    const role = roles.get(f.id)!;
    const peers = byRole.get(role)!;
    const idx = peers.indexOf(f);
    const side: Side = peers.length === 1 ? "C" : idx < peers.length / 2 ? "SL" : "SR";
    const rf: RigFixture = { fixtureId: f.id, role, side: peers.length % 2 === 1 && idx === (peers.length - 1) / 2 ? "C" : side, order: idx };
    if (role === "mover") rf.home = { pan: 128, tilt: 128 };
    out.push(rf);
  }
  return { fixtures: out };
}

export function fixturesWithRole(rig: Rig, role: Role): RigFixture[] {
  return rig.fixtures.filter((f) => f.role === role).sort((a, b) => a.order - b.order);
}
