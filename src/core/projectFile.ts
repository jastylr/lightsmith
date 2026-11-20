/**
 * The .lightsmith project file: one file with everything needed to carry on
 * on another computer. It's plain JSON (open it in any text editor): a header
 * naming the format and its version, the project (stage, songs, set, show
 * control), the QLC+ show file it was built on, and the fixture definitions
 * you added yourself (ones from QLC+'s library are fetched again).
 */
import { normalizeProject, type Project } from "./model";

export const PROJECT_EXT = ".lightsmith";
export const PROJECT_FORMAT = "lightsmith";
export const PROJECT_FORMAT_VERSION = 1;

export interface ProjectBundle {
  format: typeof PROJECT_FORMAT;
  formatVersion: number;
  /** When it was saved, ISO 8601. */
  saved: string;
  project: Project;
  showFile: { name: string; xml: string } | null;
  fixtureDefinitions: { name: string; xml: string }[];
}

export function bundleProject(project: Project, showFile: { name: string; xml: string } | null, defs: { name: string; xml: string }[], now = new Date()): string {
  const bundle: ProjectBundle = { format: PROJECT_FORMAT, formatVersion: PROJECT_FORMAT_VERSION, saved: now.toISOString(), project, showFile, fixtureDefinitions: defs };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Read a .lightsmith file, or a project .json from before there was one
 * (just the project). Throws with a plain reason when it's neither.
 */
export function readProjectFile(text: string): { project: Project; showFile: { name: string; xml: string } | null; fixtureDefinitions: { name: string; xml: string }[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("It isn't a Lightsmith project file (it couldn't be read as one).");
  }
  const d = data as Partial<ProjectBundle> & Partial<Project>;
  if (d.format === PROJECT_FORMAT) {
    if ((d.formatVersion ?? 0) > PROJECT_FORMAT_VERSION) throw new Error("It was saved by a newer Lightsmith. Reload the page to get the latest version, then try again.");
    if (!d.project || !Array.isArray(d.project.songs)) throw new Error("The project inside it is missing or damaged.");
    return { project: normalizeProject(d.project), showFile: d.showFile ?? null, fixtureDefinitions: d.fixtureDefinitions ?? [] };
  }
  if (d.version === 1 && Array.isArray(d.songs)) return { project: normalizeProject(d as Project), showFile: null, fixtureDefinitions: [] };
  throw new Error("It isn't a Lightsmith project file.");
}

/** A file name for the project: the show file's name, or "Lightsmith project". */
export function projectFileName(showFileName: string | undefined): string {
  const base = (showFileName ?? "").replace(/\.qxw$/i, "").trim() || "Lightsmith project";
  return `${base.replace(/[\\/:*?"<>|]/g, "-")}${PROJECT_EXT}`;
}
