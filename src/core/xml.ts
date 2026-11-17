/**
 * A small, dependency-free XML reader/writer.
 *
 * QLC+ files are plain XML (elements, attributes, text, a DOCTYPE). We parse
 * into a simple tree that keeps element and attribute order, so a workspace we
 * read and write back stays as close as possible to what QLC+ produced. It runs
 * the same in the browser and in Node (tests), with no DOMParser needed.
 */

export interface XmlElement {
  name: string;
  attrs: [string, string][];
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

export interface XmlDocument {
  declaration: string | null; // e.g. <?xml version="1.0" encoding="UTF-8"?>
  doctype: string | null; // e.g. <!DOCTYPE Workspace>
  root: XmlElement;
}

export class XmlParseError extends Error {}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

export function parseXml(src: string): XmlDocument {
  let i = 0;
  let declaration: string | null = null;
  let doctype: string | null = null;
  if (src.charCodeAt(0) === 0xfeff) i = 1; // BOM

  const fail = (msg: string): never => {
    const line = src.slice(0, i).split("\n").length;
    throw new XmlParseError(`${msg} (line ${line})`);
  };

  const skipWs = () => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };

  // Prolog: declaration, doctype, comments
  for (;;) {
    skipWs();
    if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i);
      if (end < 0) fail("Unterminated processing instruction");
      const pi = src.slice(i, end + 2);
      if (pi.startsWith("<?xml")) declaration = pi;
      i = end + 2;
    } else if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i);
      if (end < 0) fail("Unterminated comment");
      i = end + 3;
    } else if (src.startsWith("<!DOCTYPE", i)) {
      let depth = 0;
      const start = i;
      for (; i < src.length; i++) {
        if (src[i] === "[") depth++;
        else if (src[i] === "]") depth--;
        else if (src[i] === ">" && depth === 0) break;
      }
      doctype = src.slice(start, i + 1);
      i++;
    } else break;
  }

  const parseName = (): string => {
    const start = i;
    while (i < src.length && /[^\s/>=]/.test(src[i]!)) i++;
    if (i === start) fail("Expected a name");
    return src.slice(start, i);
  };

  const parseElement = (): XmlElement => {
    if (src[i] !== "<") fail("Expected '<'");
    i++;
    const name = parseName();
    const attrs: [string, string][] = [];
    for (;;) {
      skipWs();
      if (src.startsWith("/>", i)) {
        i += 2;
        return { name, attrs, children: [] };
      }
      if (src[i] === ">") {
        i++;
        break;
      }
      const an = parseName();
      skipWs();
      if (src[i] !== "=") fail(`Expected '=' after attribute ${an}`);
      i++;
      skipWs();
      const q = src[i];
      if (q !== '"' && q !== "'") fail("Expected quoted attribute value");
      const end = src.indexOf(q!, i + 1);
      if (end < 0) fail("Unterminated attribute value");
      attrs.push([an, decodeEntities(src.slice(i + 1, end))]);
      i = end + 1;
    }
    const children: XmlNode[] = [];
    for (;;) {
      if (i >= src.length) fail(`Unclosed element <${name}>`);
      if (src.startsWith("</", i)) {
        i += 2;
        const close = parseName();
        if (close !== name) fail(`Mismatched </${close}>, expected </${name}>`);
        skipWs();
        if (src[i] !== ">") fail("Expected '>'");
        i++;
        return { name, attrs, children: normalizeChildren(children) };
      }
      if (src.startsWith("<!--", i)) {
        const end = src.indexOf("-->", i);
        if (end < 0) fail("Unterminated comment");
        i = end + 3;
        continue;
      }
      if (src.startsWith("<![CDATA[", i)) {
        const end = src.indexOf("]]>", i);
        if (end < 0) fail("Unterminated CDATA");
        children.push(src.slice(i + 9, end));
        i = end + 3;
        continue;
      }
      if (src[i] === "<") {
        children.push(parseElement());
        continue;
      }
      const end = src.indexOf("<", i);
      const raw = src.slice(i, end < 0 ? src.length : end);
      children.push(decodeEntities(raw));
      i = end < 0 ? src.length : end;
    }
  };

  skipWs();
  const root = parseElement();
  return { declaration, doctype, root };
}

/** Drop whitespace-only text between elements (we re-indent on write). */
function normalizeChildren(children: XmlNode[]): XmlNode[] {
  const hasElements = children.some((c) => typeof c !== "string");
  if (!hasElements) {
    const text = children.join("");
    return text.length ? [text] : [];
  }
  return children.filter((c) => typeof c !== "string" || c.trim().length > 0);
}

export function serializeXml(doc: XmlDocument, indent = " "): string {
  const out: string[] = [];
  if (doc.declaration) out.push(doc.declaration);
  if (doc.doctype) out.push(doc.doctype);
  const write = (el: XmlElement, depth: number) => {
    const pad = indent.repeat(depth);
    const attrs = el.attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join("");
    if (el.children.length === 0) {
      out.push(`${pad}<${el.name}${attrs}/>`);
      return;
    }
    const allText = el.children.every((c) => typeof c === "string");
    if (allText) {
      out.push(`${pad}<${el.name}${attrs}>${escapeText((el.children as string[]).join(""))}</${el.name}>`);
      return;
    }
    out.push(`${pad}<${el.name}${attrs}>`);
    for (const c of el.children) {
      if (typeof c === "string") out.push(`${pad}${indent}${escapeText(c.trim())}`);
      else write(c, depth + 1);
    }
    out.push(`${pad}</${el.name}>`);
  };
  write(doc.root, 0);
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------- helpers

export function el(name: string, attrs: Record<string, string | number> = {}, children: XmlNode[] = []): XmlElement {
  return { name, attrs: Object.entries(attrs).map(([k, v]) => [k, String(v)]), children };
}

export function textEl(name: string, text: string | number, attrs: Record<string, string | number> = {}): XmlElement {
  return el(name, attrs, [String(text)]);
}

export function getAttr(e: XmlElement, name: string): string | undefined {
  return e.attrs.find(([k]) => k === name)?.[1];
}

export function setAttr(e: XmlElement, name: string, value: string | number): void {
  const a = e.attrs.find(([k]) => k === name);
  if (a) a[1] = String(value);
  else e.attrs.push([name, String(value)]);
}

export function childElements(e: XmlElement, name?: string): XmlElement[] {
  return e.children.filter((c): c is XmlElement => typeof c !== "string" && (!name || c.name === name));
}

export function firstChild(e: XmlElement, name: string): XmlElement | undefined {
  return childElements(e, name)[0];
}

export function textOf(e: XmlElement | undefined): string {
  if (!e) return "";
  return e.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
}

export function childText(e: XmlElement, name: string): string | undefined {
  const c = firstChild(e, name);
  return c ? textOf(c).trim() : undefined;
}

/** Depth-first walk over every element. */
export function* walk(e: XmlElement): Generator<XmlElement> {
  yield e;
  for (const c of e.children) if (typeof c !== "string") yield* walk(c);
}
