/**
 * Matching workspace fixtures to definitions, and a first guess at how each
 * fixture is used on stage. The user corrects the guess in the Rig step.
 */
import { buildProfile, fixtureKey, type FixtureDef, type FixtureProfile } from "./fixture";
import { sideFromX, sitsOut, type Rig, type RigFixture, type Role, type Section, type Side } from "./model";
import type { EffectId } from "./presets";
import type { Placement, StageSize, WsFixture } from "./workspace";

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

/**
 * A first guess at a light's job, from what it can do and where it is.
 * Moving heads are moving heads wherever they are; bars are the backdrop;
 * a light in front of the stage (QLC+'s 3D view puts it past the front edge)
 * lights the band from the front; anything else washes the stage with color.
 */
export function guessRole(p: FixtureProfile, place?: Pick<Placement, "y">): Role {
  if (p.isMover) return "mover";
  if (p.heads.length === 0) return "ignore";
  const type = p.def.type.toLowerCase();
  if (p.heads.length >= 4 || type.includes("bar") || type.includes("pixel")) return "backdrop";
  if (place && place.y > 1.02) return "front";
  return "side";
}

/** Bars and pixel strips: the lights that can stand on their end. */
export function isBar(p: FixtureProfile | undefined): boolean {
  if (!p) return false;
  const type = p.def.type.toLowerCase();
  return !p.isMover && (p.heads.length >= 4 || type.includes("bar") || type.includes("pixel"));
}

/**
 * The rig for a workspace. Where each light is comes from QLC+'s 3D view,
 * unless it was moved in Lightsmith since the show was loaded. Its job is
 * guessed until the user sets one. Lights with no 3D position get a tidy
 * automatic place.
 */
export function guessRig(fixtures: WsFixture[], profiles: Map<number, FixtureProfile>, previous?: Rig, stage?: StageSize): Rig {
  const before = new Map(previous?.fixtures.map((f) => [f.fixtureId, f]));
  const out: RigFixture[] = [];
  for (const f of fixtures) {
    const old = before.get(f.id);
    const p = profiles.get(f.id);
    const kept = old?.userSet ? old : undefined;
    const role = kept?.role ?? (p ? guessRole(p, f.place) : "ignore");
    const rf: RigFixture = kept ? { ...kept } : { fixtureId: f.id, role, side: "C", order: 0 };
    if (role === "mover") rf.home = rf.home ?? { pan: 128, tilt: 128 };
    if (old?.moved) {
      rf.pos = old.pos;
      rf.height = old.height;
      rf.upright = old.upright;
      rf.moved = true;
    } else if (f.place) {
      rf.pos = { x: f.place.x, y: f.place.y };
      rf.height = f.place.height;
      rf.upright = isBar(p) ? f.place.upright : undefined;
      delete rf.moved;
    } else if (old?.pos) {
      rf.pos = old.pos;
      rf.height = old.height ?? (old.mount === "truss" ? 0.9 : undefined);
      rf.upright = old.upright;
    } else {
      rf.pos = undefined;
      rf.height = undefined;
    }
    if (rf.upright === undefined && isBar(p)) rf.upright = true;
    delete rf.mount;
    out.push(rf);
  }
  // Lights QLC+ hasn't placed: spread each job's lights across the stage.
  const roles = new Set(out.map((f) => f.role));
  for (const role of roles) {
    if (role === "ignore") continue;
    const unplaced = out.filter((f) => f.role === role && !f.pos);
    unplaced.forEach((f, i) => (f.pos = defaultPosition(role, "C", i, unplaced.length)));
  }
  const rig = settleRig({ fixtures: out });
  return stage ? { ...rig, stage: { width: stage.width, depth: stage.depth, height: stage.height, feet: stage.feet } } : rig;
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
  if (count === 1) return { x: side === "SL" ? 0.8 : side === "SR" ? 0.2 : 0.5, y };
  // Spread lights of the same job evenly across their lane, stage left first,
  // so none starts hidden behind another however many there are.
  return { x: 0.88 - (0.76 * idx) / (count - 1), y };
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
  return { ...rig, fixtures };
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
export function effectTargets(section: Pick<Section, "effectTargets" | "lights">, effect: EffectId, rig: Rig): number[] {
  const inUse = new Set(rig.fixtures.filter((f) => f.role !== "ignore").map((f) => f.fixtureId));
  const ids = section.effectTargets?.[effect] ?? defaultEffectTargets(effect, rig);
  return ids.filter((id) => inUse.has(id) && !sitsOut(section, id, "effects"));
}

/** The lights a section's pattern runs on: the user's pick, or the backdrop. */
export function patternTargets(section: Pick<Section, "patternTargets" | "lights">, rig: Rig): number[] {
  const inUse = new Set(rig.fixtures.filter((f) => f.role !== "ignore").map((f) => f.fixtureId));
  const ids = section.patternTargets ?? rig.fixtures.filter((f) => f.role === "backdrop").map((f) => f.fixtureId);
  // Lights that are off, or holding their own color, sit the pattern out.
  return ids.filter((id) => inUse.has(id) && !sitsOut(section, id, "pattern"));
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
