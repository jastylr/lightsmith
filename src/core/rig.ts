/**
 * Matching workspace fixtures to definitions, and a first guess at how each
 * fixture is used on stage. The user corrects the guess in the Rig step.
 */
import { buildProfile, fixtureKey, type FixtureDef, type FixtureProfile } from "./fixture";
import { sideFromX, type Rig, type RigFixture, type Role, type Section, type Side } from "./model";
import type { EffectId } from "./presets";
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
      out.push({ ...kept });
      continue;
    }
    const role = roles.get(f.id)!;
    const peers = byRole.get(role)!;
    const idx = peers.indexOf(f);
    const side: Side = peers.length === 1 ? "C" : idx < peers.length / 2 ? "SL" : "SR";
    const rf: RigFixture = { fixtureId: f.id, role, side: peers.length % 2 === 1 && idx === (peers.length - 1) / 2 ? "C" : side, order: idx };
    if (role === "mover") rf.home = { pan: 128, tilt: 128 };
    rf.pos = defaultPosition(role, rf.side, idx, peers.length);
    out.push(rf);
  }
  // Older projects (and kept fixtures) may not have a stage position yet.
  for (const f of out) {
    if (f.pos || f.role === "ignore") continue;
    const peers = out.filter((p) => p.role === f.role).sort((a, b) => a.order - b.order);
    f.pos = defaultPosition(f.role, f.side, peers.indexOf(f), peers.length);
  }
  return { fixtures: out };
}

export function fixturesWithRole(rig: Rig, role: Role): RigFixture[] {
  return rig.fixtures.filter((f) => f.role === role).sort((a, b) => a.order - b.order);
}

/** Row on the stage plan for each job (0 = back wall, 1 = front edge). */
export const ROLE_ROW: Record<Role, number> = { backdrop: 0.14, mover: 0.42, side: 0.66, front: 0.9, ignore: 0.9 };

/**
 * A first placement on the stage plan, seen from the audience: stage left is
 * on the right, and "order" runs from stage left.
 */
export function defaultPosition(role: Role, side: Side, idx: number, count: number): { x: number; y: number } | undefined {
  if (role === "ignore") return undefined;
  const y = ROLE_ROW[role];
  if (role === "backdrop" || count === 1) {
    const x = count === 1 ? (side === "SL" ? 0.8 : side === "SR" ? 0.2 : 0.5) : 0.85 - (0.7 * idx) / (count - 1);
    return { x, y };
  }
  const x = side === "SL" ? 0.82 - 0.06 * (idx % 2) : side === "SR" ? 0.18 + 0.06 * (idx % 2) : 0.5;
  return { x, y };
}

/** After fixtures move on the plan: work out each side and the stage-left-first order. */
export function settleRig(rig: Rig): Rig {
  const fixtures = rig.fixtures.map((f) => (f.pos && f.role !== "ignore" ? { ...f, side: sideFromX(f.pos.x) } : { ...f }));
  const roles = new Set(fixtures.map((f) => f.role));
  for (const role of roles) {
    fixtures
      .filter((f) => f.role === role)
      .sort((a, b) => (b.pos?.x ?? -1) - (a.pos?.x ?? -1) || a.order - b.order)
      .forEach((f, i) => (f.order = i));
  }
  return { fixtures };
}

/** Stage left first, by plan position (then by order). */
export function stageOrder(a: RigFixture, b: RigFixture): number {
  return (b.pos?.x ?? 0) - (a.pos?.x ?? 0) || a.order - b.order;
}

/** Effects drawn by an RGB matrix only work on lights with red, green and blue. */
export const MATRIX_EFFECTS: EffectId[] = ["sparkle", "strobe"];

/** The lights an effect uses unless the user picks others. */
export function defaultEffectTargets(effect: EffectId, rig: Rig): number[] {
  const roles: Role[] =
    effect === "sparkle" || effect === "strobe"
      ? ["backdrop"]
      : effect === "beatPulse"
        ? ["side", "front"]
        : ["backdrop", "side", "front", "mover"];
  return rig.fixtures.filter((f) => roles.includes(f.role)).map((f) => f.fixtureId);
}

/** The lights a section's effect will use: the user's pick or the default, limited to lights in use. */
export function effectTargets(section: Pick<Section, "effectTargets">, effect: EffectId, rig: Rig): number[] {
  const inUse = new Set(rig.fixtures.filter((f) => f.role !== "ignore").map((f) => f.fixtureId));
  const ids = section.effectTargets?.[effect] ?? defaultEffectTargets(effect, rig);
  return ids.filter((id) => inUse.has(id));
}

/** The lights a section's pattern runs on: the user's pick, or the backdrop. */
export function patternTargets(section: Pick<Section, "patternTargets">, rig: Rig): number[] {
  const inUse = new Set(rig.fixtures.filter((f) => f.role !== "ignore").map((f) => f.fixtureId));
  const ids = section.patternTargets ?? rig.fixtures.filter((f) => f.role === "backdrop").map((f) => f.fixtureId);
  return ids.filter((id) => inUse.has(id));
}

/**
 * The lights that put one side of the stage in the spotlight. Side and front
 * lights on that side are best; without them, moving heads on that side; as
 * a last resort, backdrop lights on that side.
 */
export function focusLights(rig: Rig, side: Side): number[] {
  const on = (roles: Role[]) => rig.fixtures.filter((f) => roles.includes(f.role) && f.side === side).map((f) => f.fixtureId);
  for (const roles of [["side", "front"], ["mover"], ["backdrop"]] as Role[][]) {
    const ids = on(roles);
    if (ids.length) return ids;
  }
  return [];
}
