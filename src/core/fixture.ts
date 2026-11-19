/**
 * QLC+ fixture definitions (.qxf) and the "profile" Lightsmith derives from
 * one mode of a definition: which channels carry dimmer, color, pan/tilt and
 * shutter, grouped into heads.
 */
import { childElements, childText, firstChild, getAttr, parseXml, textOf, type XmlElement } from "./xml";

export type ChannelKind =
  | "masterDimmer"
  | "dimmer"
  | "red"
  | "green"
  | "blue"
  | "white"
  | "amber"
  | "uv"
  | "cyan"
  | "magenta"
  | "yellow"
  | "lime"
  | "indigo"
  | "pan"
  | "panFine"
  | "tilt"
  | "tiltFine"
  | "ptSpeed"
  | "shutter"
  | "fine"
  | "other";

export interface Capability {
  min: number;
  max: number;
  name: string;
  preset?: string;
}

export interface ChannelDef {
  name: string;
  preset?: string;
  group?: string;
  byte: number;
  color?: string;
  capabilities: Capability[];
  kind: ChannelKind;
  /** For pan/tilt speed channels: true when 0 = fastest. */
  speedFastIsLow?: boolean;
}

export interface ModeDef {
  name: string;
  channels: string[]; // channel names, by DMX offset
  heads: number[][]; // channel offsets per head
  /** This mode's own physical size, when it has one. */
  size?: FixtureSize;
}

/** A fixture's physical size in millimetres, from <Physical><Dimensions/>. */
export interface FixtureSize {
  width: number;
  height: number;
  depth: number;
}

/** Read <Physical><Dimensions Width Height Depth/> below `e`; sizes of 0 count as unknown. */
function sizeIn(e: XmlElement): FixtureSize | undefined {
  const physical = firstChild(e, "Physical");
  const dims = physical ? firstChild(physical, "Dimensions") : undefined;
  if (!dims) return undefined;
  const mm = (a: string) => Math.max(0, Number(getAttr(dims, a) ?? 0) || 0);
  const size = { width: mm("Width"), height: mm("Height"), depth: mm("Depth") };
  return size.width || size.height || size.depth ? size : undefined;
}

export interface FixtureDef {
  manufacturer: string;
  model: string;
  type: string;
  channels: Map<string, ChannelDef>;
  modes: ModeDef[];
  /** The physical size most modes share. */
  size?: FixtureSize;
}

const COLOR_KINDS: Record<string, ChannelKind> = {
  red: "red",
  green: "green",
  blue: "blue",
  white: "white",
  amber: "amber",
  uv: "uv",
  cyan: "cyan",
  magenta: "magenta",
  yellow: "yellow",
  lime: "lime",
  indigo: "indigo",
};

/** Map a QLC+ channel preset (or group/color) to what Lightsmith cares about. */
export function classifyChannel(preset: string | undefined, group: string | undefined, byte: number, color: string | undefined): {
  kind: ChannelKind;
  speedFastIsLow?: boolean;
} {
  if (preset) {
    if (preset.endsWith("Fine")) {
      if (preset === "PositionPanFine") return { kind: "panFine" };
      if (preset === "PositionTiltFine") return { kind: "tiltFine" };
      return { kind: "fine" };
    }
    if (preset === "IntensityMasterDimmer") return { kind: "masterDimmer" };
    if (preset === "IntensityDimmer") return { kind: "dimmer" };
    if (preset.startsWith("Intensity")) {
      const c = COLOR_KINDS[preset.slice("Intensity".length).toLowerCase()];
      return { kind: c ?? "other" };
    }
    if (preset === "PositionPan" || preset === "PositionXAxis") return { kind: "pan" };
    if (preset === "PositionTilt" || preset === "PositionYAxis") return { kind: "tilt" };
    if (preset.startsWith("SpeedPanTilt")) return { kind: "ptSpeed", speedFastIsLow: preset.endsWith("FastSlow") };
    if (preset.startsWith("Shutter")) return { kind: "shutter" };
    return { kind: "other" };
  }
  switch (group) {
    case "Intensity": {
      if (byte === 1) return { kind: "fine" };
      if (color) return { kind: COLOR_KINDS[color.toLowerCase()] ?? "other" };
      return { kind: "dimmer" };
    }
    case "Pan":
      return { kind: byte === 1 ? "panFine" : "pan" };
    case "Tilt":
      return { kind: byte === 1 ? "tiltFine" : "tilt" };
    case "Shutter":
      return { kind: "shutter" };
    default:
      return { kind: "other" };
  }
}

export function parseFixtureDef(xml: string): FixtureDef {
  const root = parseXml(xml).root;
  if (root.name !== "FixtureDefinition") throw new Error("Not a QLC+ fixture definition (.qxf)");
  const channels = new Map<string, ChannelDef>();
  for (const ch of childElements(root, "Channel")) {
    const name = getAttr(ch, "Name") ?? "";
    const preset = getAttr(ch, "Preset");
    const groupEl = firstChild(ch, "Group");
    const group = groupEl ? textOf(groupEl).trim() : undefined;
    const byte = groupEl ? Number(getAttr(groupEl, "Byte") ?? 0) : 0;
    // QLC+ spells this element "Colour".
    const color = childText(ch, "Colour");
    const capabilities: Capability[] = childElements(ch, "Capability").map((c) => ({
      min: Number(getAttr(c, "Min") ?? 0),
      max: Number(getAttr(c, "Max") ?? 255),
      name: textOf(c).trim(),
      preset: getAttr(c, "Preset"),
    }));
    const cls = classifyChannel(preset, group, byte, color);
    channels.set(name, { name, preset, group, byte, color, capabilities, ...cls });
  }
  const modes: ModeDef[] = childElements(root, "Mode").map((m) => {
    const chs: string[] = [];
    for (const c of childElements(m, "Channel")) chs[Number(getAttr(c, "Number") ?? chs.length)] = textOf(c).trim();
    const heads = childElements(m, "Head").map((h) => childElements(h, "Channel").map((c) => Number(textOf(c))));
    return { name: getAttr(m, "Name") ?? "", channels: chs, heads, size: sizeIn(m) };
  });
  return {
    manufacturer: childText(root, "Manufacturer") ?? "",
    model: childText(root, "Model") ?? "",
    type: childText(root, "Type") ?? "",
    channels,
    modes,
    size: sizeIn(root),
  };
}

export function fixtureKey(manufacturer: string, model: string): string {
  return `${manufacturer.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
}

// ---------------------------------------------------------------- profile

export interface HeadProfile {
  dimmer?: number;
  red?: number;
  green?: number;
  blue?: number;
  white?: number;
  amber?: number;
  uv?: number;
}

export interface ShutterInfo {
  channel: number;
  name: string;
  capabilities: Capability[];
}

export interface FixtureProfile {
  def: FixtureDef;
  mode: ModeDef;
  channelCount: number;
  masterDimmer?: number;
  /** Heads that can show color or white light. */
  heads: HeadProfile[];
  pan?: number;
  panFine?: number;
  tilt?: number;
  tiltFine?: number;
  ptSpeed?: { channel: number; fastIsLow: boolean };
  shutters: ShutterInfo[];
  isMover: boolean;
  /** At least one head has red, green and blue. */
  hasRgb: boolean;
}

export function buildProfile(def: FixtureDef, modeName: string): FixtureProfile {
  const mode = def.modes.find((m) => m.name === modeName) ?? def.modes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
  if (!mode) throw new Error(`Mode "${modeName}" not found in ${def.manufacturer} ${def.model}`);
  const kindAt = (i: number): ChannelDef | undefined => {
    const n = mode.channels[i];
    return n === undefined ? undefined : def.channels.get(n);
  };
  const count = mode.channels.length;
  const inAnyHead = new Set(mode.heads.flat());

  const profile: FixtureProfile = { def, mode, channelCount: count, heads: [], shutters: [], isMover: false, hasRgb: false };

  for (let i = 0; i < count; i++) {
    const ch = kindAt(i);
    if (!ch) continue;
    switch (ch.kind) {
      case "masterDimmer":
        profile.masterDimmer ??= i;
        break;
      case "dimmer":
        if (!inAnyHead.has(i)) profile.masterDimmer ??= i;
        break;
      case "pan":
        profile.pan ??= i;
        break;
      case "panFine":
        profile.panFine ??= i;
        break;
      case "tilt":
        profile.tilt ??= i;
        break;
      case "tiltFine":
        profile.tiltFine ??= i;
        break;
      case "ptSpeed":
        profile.ptSpeed ??= { channel: i, fastIsLow: !!ch.speedFastIsLow };
        break;
      case "shutter":
        profile.shutters.push({ channel: i, name: ch.name, capabilities: ch.capabilities });
        break;
    }
  }

  // Heads: as defined, or the whole mode when the definition declares none.
  const headLists = mode.heads.length ? mode.heads : [Array.from({ length: count }, (_, i) => i)];
  for (const list of headLists) {
    const head: HeadProfile = {};
    for (const i of list) {
      const ch = kindAt(i);
      if (!ch) continue;
      const k = ch.kind;
      if (k === "dimmer" && head.dimmer === undefined && mode.heads.length) head.dimmer = i;
      if ((k === "red" || k === "green" || k === "blue" || k === "white" || k === "amber" || k === "uv") && head[k] === undefined) head[k] = i;
    }
    if (head.red !== undefined || head.green !== undefined || head.blue !== undefined || head.white !== undefined) profile.heads.push(head);
  }
  profile.hasRgb = profile.heads.some((h) => h.red !== undefined && h.green !== undefined && h.blue !== undefined);
  profile.isMover = profile.pan !== undefined && profile.tilt !== undefined;
  return profile;
}

/**
 * Is it safe for a scene to write `value` to this shutter channel?
 * Only when the definition explicitly says that value opens the shutter, or
 * the value is a deliberate strobe. Writing a value the definition calls
 * "No function" can leave QLC+'s visualizer (and some fixtures) dark.
 */
export function shutterValueMeaning(sh: ShutterInfo, value: number): "open" | "closed" | "strobe" | "unknown" {
  const cap = sh.capabilities.find((c) => value >= c.min && value <= c.max);
  if (!cap) return "unknown";
  const p = cap.preset ?? "";
  if (p === "ShutterOpen") return "open";
  if (p === "ShutterClose") return "closed";
  if (p.startsWith("Strobe") || p.startsWith("Pulse") || /strobe/i.test(cap.name)) return "strobe";
  return "unknown";
}
