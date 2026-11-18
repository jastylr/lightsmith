/**
 * Reading a QLC+ workspace (.qxw) and merging generated content back into it.
 */
import {
  childElements,
  childText,
  firstChild,
  getAttr,
  parseXml,
  serializeXml,
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
  // QLC+ 5's 3D view: <Monitor><Grid Height=… Depth=… Units=…/><FxItem ID YPos …/>.
  // YPos is the height in millimetres; the grid is in metres (Units 0) or feet (1).
  // QLC+ 4's 2D view has no Depth, and its YPos means something else, so skip it.
  const monitor = firstChild(engine, "Monitor") ?? firstChild(doc.root, "Monitor");
  const grid = monitor ? firstChild(monitor, "Grid") : undefined;
  if (monitor && grid && getAttr(grid, "Depth") !== undefined) {
    const stageMm = Number(getAttr(grid, "Height") ?? 0) * (getAttr(grid, "Units") === "1" ? 304.8 : 1000);
    if (stageMm > 0) {
      const heights = new Map(childElements(monitor, "FxItem").map((it) => [Number(getAttr(it, "ID")), Number(getAttr(it, "YPos") ?? 0) / stageMm]));
      for (const f of fixtures) {
        const h = heights.get(f.id);
        if (h !== undefined && Number.isFinite(h)) f.height = Math.max(0, Math.min(1, h));
      }
    }
  }
  return { doc, engine, virtualConsole: firstChild(doc.root, "VirtualConsole"), fixtures, functions, groups };
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
