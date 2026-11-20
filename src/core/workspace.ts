/**
 * Reading a QLC+ workspace (.qxw) and merging generated content back into it.
 */
import {
  childElements,
  childText,
  el,
  firstChild,
  getAttr,
  parseXml,
  serializeXml,
  setAttr,
  walk,
  type XmlDocument,
  type XmlElement,
} from "./xml";

export interface WsFixture {
  id: number;
  name: string;
  manufacturer: string;
  model: string;
  mode: string;
  universe: number;
  address: number; // 0-based
  channels: number;
  /**
   * How high the fixture hangs, as a share of the stage height (0 = floor,
   * 1 = top), from QLC+'s 3D view. Missing when the show has no 3D layout.
   */
  height?: number;
  /** Where it is in QLC+'s 3D view. Missing when the show has no 3D layout. */
  place?: Placement;
}

/**
 * A fixture's place in QLC+'s 3D view, as shares of the stage: x runs from
 * stage right to stage left (left to right, seen from the audience), y from
 * the back wall to the front edge (past 1 is in front of the stage), and
 * height from the floor to the top of the stage.
 */
export interface Placement {
  x: number;
  y: number;
  height: number;
  /** The fixture's long side stands up (a bar on its end), from its rotation. */
  upright: boolean;
  /**
   * A moving head turned to face the back of the stage. QLC+ shows this with
   * "Invert pan" on the fixture in its 3D view.
   */
  facesBack: boolean;
}

/** The stage size in QLC+'s 3D view, in metres. */
export interface StageSize {
  width: number;
  depth: number;
  height: number;
  /** QLC+ shows this stage in feet. */
  feet: boolean;
}

export interface WsFunction {
  id: number;
  type: string;
  name: string;
  path?: string;
}

export interface Workspace {
  doc: XmlDocument;
  engine: XmlElement;
  virtualConsole?: XmlElement;
  fixtures: WsFixture[];
  functions: WsFunction[];
  groups: { id: number; name: string }[];
  /** The stage in QLC+'s 3D view; missing when the show has no 3D layout. */
  stage?: StageSize;
  /** Inputs patched in QLC+ (Inputs/Outputs): which device feeds which universe. */
  inputs: InputPatch[];
}

export interface InputPatch {
  /** As QLC+ numbers universes for people: 1 = "Universe 1" (stored as ID 0). */
  universe: number;
  universeName: string;
  plugin: string;
  /** The device, as the computer names it ("H4MIDI-WC"). */
  device: string;
}

/** The inputs patched in the show file. */
export function inputPatchesOf(doc: XmlDocument): InputPatch[] {
  const engine = firstChild(doc.root, "Engine");
  const io = engine ? firstChild(engine, "InputOutputMap") : undefined;
  if (!io) return [];
  return childElements(io, "Universe").flatMap((u) => {
    const input = firstChild(u, "Input");
    if (!input) return [];
    const id = Number(getAttr(u, "ID") ?? 0);
    return [{ universe: id + 1, universeName: getAttr(u, "Name") ?? `Universe ${id + 1}`, plugin: getAttr(input, "Plugin") ?? "", device: getAttr(input, "Name") ?? getAttr(input, "UID") ?? "" }];
  });
}

/**
 * Set which MIDI channel QLC+ listens to on an input: 1-16, or "any" (QLC+
 * calls it Omni and stores 16). Written as a plugin parameter on the patch,
 * which QLC+ applies when it opens the show. False when nothing is patched there.
 */
export function setMidiListen(ws: Workspace, universe: number, channel: number | "any"): boolean {
  const io = firstChild(ws.engine, "InputOutputMap");
  const u = io ? childElements(io, "Universe").find((x) => Number(getAttr(x, "ID") ?? -1) === universe - 1) : undefined;
  const input = u ? firstChild(u, "Input") : undefined;
  if (!input || getAttr(input, "Plugin") !== "MIDI") return false;
  let params = firstChild(input, "PluginParameters");
  if (!params) {
    params = el("PluginParameters", {}, []);
    input.children.push(params);
  }
  const value = String(channel === "any" ? 16 : Math.max(1, Math.min(16, channel)) - 1);
  params.attrs = [...params.attrs.filter(([k]) => k !== "midichannel"), ["midichannel", value]];
  return true;
}

export function parseWorkspace(xml: string): Workspace {
  const doc = parseXml(xml);
  if (doc.root.name !== "Workspace") throw new Error("Not a QLC+ workspace (.qxw)");
  const engine = firstChild(doc.root, "Engine");
  if (!engine) throw new Error("Workspace has no <Engine> section");
  const fixtures: WsFixture[] = childElements(engine, "Fixture").map((f) => ({
    id: Number(childText(f, "ID")),
    name: childText(f, "Name") ?? "",
    manufacturer: childText(f, "Manufacturer") ?? "",
    model: childText(f, "Model") ?? "",
    mode: childText(f, "Mode") ?? "",
    universe: Number(childText(f, "Universe") ?? 0),
    address: Number(childText(f, "Address") ?? 0),
    channels: Number(childText(f, "Channels") ?? 0),
  }));
  const functions: WsFunction[] = childElements(engine, "Function").map((f) => ({
    id: Number(getAttr(f, "ID")),
    type: getAttr(f, "Type") ?? "",
    name: getAttr(f, "Name") ?? "",
    path: getAttr(f, "Path"),
  }));
  const groups = childElements(engine, "FixtureGroup").map((g) => ({ id: Number(getAttr(g, "ID")), name: childText(g, "Name") ?? "" }));
  const stage = readStage(doc, fixtures);
  return { doc, engine, virtualConsole: firstChild(doc.root, "VirtualConsole"), fixtures, functions, groups, stage, inputs: inputPatchesOf(doc) };
}

export function serializeWorkspace(ws: Workspace): string {
  return serializeXml(ws.doc);
}

/** Next free function ID. */
export function nextFunctionId(engine: XmlElement): number {
  return Math.max(-1, ...childElements(engine, "Function").map((f) => Number(getAttr(f, "ID")))) + 1;
}

export function nextGroupId(engine: XmlElement): number {
  return Math.max(-1, ...childElements(engine, "FixtureGroup").map((f) => Number(getAttr(f, "ID")))) + 1;
}

const VC_WIDGETS = new Set(["Frame", "SoloFrame", "Button", "Slider", "Knob", "Label", "CueList", "SpeedDial", "XYPad", "AudioTriggers", "Clock", "Matrix", "Animation"]);

export function nextWidgetId(vc: XmlElement): number {
  let max = -1;
  for (const e of walk(vc)) if (VC_WIDGETS.has(e.name)) max = Math.max(max, Number(getAttr(e, "ID") ?? -1));
  return max + 1;
}

/** Insert `items` after the last child named one of `after`, else before the first named `before`, else at the end. */
export function insertChildren(parent: XmlElement, items: XmlElement[], after: string[], before: string[] = []): void {
  let idx = -1;
  parent.children.forEach((c, i) => {
    if (typeof c !== "string" && after.includes(c.name)) idx = i;
  });
  if (idx < 0) {
    const b = parent.children.findIndex((c) => typeof c !== "string" && before.includes(c.name));
    idx = b < 0 ? parent.children.length - 1 : b - 1;
  }
  parent.children.splice(idx + 1, 0, ...items);
}

/** Remove matching elements anywhere below `root`. Returns how many were removed. */
export function removeWhere(root: XmlElement, pred: (e: XmlElement) => boolean): number {
  let n = 0;
  const visit = (e: XmlElement) => {
    const before = e.children.length;
    e.children = e.children.filter((c) => typeof c === "string" || !pred(c));
    n += before - e.children.length;
    for (const c of e.children) if (typeof c !== "string") visit(c);
  };
  visit(root);
  return n;
}

/** QLC+'s 3D view, where it has one: the <Monitor> element. */
export function monitorOf(doc: XmlDocument): XmlElement | undefined {
  const engine = firstChild(doc.root, "Engine");
  return (engine && firstChild(engine, "Monitor")) ?? firstChild(doc.root, "Monitor");
}

/**
 * Read QLC+ 5's 3D view: <Monitor><Grid Width Height Depth Units/><FxItem ID
 * XPos YPos ZPos XRot YRot ZRot/>. Positions are in millimetres; the grid is
 * in metres (Units 0) or feet (Units 1). Seen from the audience, X runs to
 * stage left, Y is the height and Z comes forward from the back wall. QLC+ 4's
 * 2D view has no Depth and means something else by its positions, so it's skipped.
 */
function readStage(doc: XmlDocument, fixtures: WsFixture[]): StageSize | undefined {
  const monitor = monitorOf(doc);
  const grid = monitor ? firstChild(monitor, "Grid") : undefined;
  if (!monitor || !grid || getAttr(grid, "Depth") === undefined) return undefined;
  const feet = getAttr(grid, "Units") === "1";
  const unit = feet ? 0.3048 : 1;
  const stage: StageSize = {
    width: Number(getAttr(grid, "Width") ?? 5) * unit,
    height: Number(getAttr(grid, "Height") ?? 3) * unit,
    depth: Number(getAttr(grid, "Depth") ?? 5) * unit,
    feet,
  };
  if (!(stage.width > 0 && stage.height > 0 && stage.depth > 0)) return undefined;
  const num = (it: XmlElement, a: string) => {
    const v = Number(getAttr(it, a) ?? 0);
    return Number.isFinite(v) ? v : 0;
  };
  const items = new Map(childElements(monitor, "FxItem").map((it) => [Number(getAttr(it, "ID")), it]));
  for (const f of fixtures) {
    const it = items.get(f.id);
    if (!it) continue;
    const share = (mm: number, m: number) => mm / 1000 / m;
    const height = Math.max(0, Math.min(1, share(num(it, "YPos"), stage.height)));
    f.height = height;
    f.place = {
      x: Math.max(0, Math.min(1, share(num(it, "XPos"), stage.width))),
      y: Math.max(0, Math.min(1.25, share(num(it, "ZPos"), stage.depth))),
      height,
      upright: standsUp(num(it, "YRot"), num(it, "ZRot")),
      facesBack: getAttr(it, "InvertedPan") === "True",
    };
  }
  return stage;
}

/**
 * Whether a fixture's long side (its width, along X in QLC+) points up after
 * its rotation. QLC+ turns about X, then Y, then Z, so only the Y and Z turns
 * can stand a bar on its end.
 */
export function standsUp(yRot: number, zRot: number): boolean {
  const rad = Math.PI / 180;
  return Math.abs(Math.cos(yRot * rad) * Math.sin(zRot * rad)) > 0.7;
}

/** Write fixtures' places back into QLC+'s 3D view, so both apps show the same stage. */
export function writePlaces(ws: Workspace, places: Map<number, Omit<Placement, "upright" | "facesBack"> & { upright?: boolean; facesBack?: boolean }>): number {
  const monitor = monitorOf(ws.doc);
  if (!monitor || !ws.stage || !places.size) return 0;
  const items = new Map(childElements(monitor, "FxItem").map((it) => [Number(getAttr(it, "ID")), it]));
  const mm = (share: number, m: number) => String(Math.round(share * m * 1000 * 100) / 100);
  let n = 0;
  for (const [id, p] of places) {
    let it = items.get(id);
    if (!it) {
      it = el("FxItem", { ID: id });
      insertChildren(monitor, [it], ["FxItem", "StageItem", "Grid"]);
    }
    setAttr(it, "XPos", mm(p.x, ws.stage.width));
    setAttr(it, "YPos", mm(p.height, ws.stage.height));
    setAttr(it, "ZPos", mm(p.y, ws.stage.depth));
    // Stand a bar up, or lay it down, only when QLC+ has it the other way.
    const yRot = Number(getAttr(it, "YRot") ?? 0);
    if (p.upright !== undefined && standsUp(yRot, Number(getAttr(it, "ZRot") ?? 0)) !== p.upright) setAttr(it, "ZRot", p.upright ? 270 : 0);
    if (p.facesBack !== undefined) {
      if (p.facesBack) setAttr(it, "InvertedPan", "True");
      else it.attrs = it.attrs.filter(([k]) => k !== "InvertedPan");
    }
    n++;
  }
  return n;
}
