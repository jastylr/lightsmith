import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * How much of the app shows. Levels only hide controls; they never change
 * the show. Saved per browser.
 */
export type Level = "simple" | "standard" | "pro";
export const LEVELS: { value: Level; label: string; title: string }[] = [
  { value: "simple", label: "Simple", title: "The essentials: mood, colors, pattern, where the heads point, effects" },
  { value: "standard", label: "Standard", title: "Everything for most bands" },
  { value: "pro", label: "Pro", title: "Precise controls, with QLC+'s own names" },
];
const RANK: Record<Level, number> = { simple: 0, standard: 1, pro: 2 };
export const atLeast = (level: Level, min: Level) => RANK[level] >= RANK[min];

const KEY = "lightsmith.level.v1";
const LevelContext = createContext<{ level: Level; setLevel: (l: Level) => void }>({ level: "standard", setLevel: () => undefined });

/** New users start on Simple; anyone who already has songs starts on Standard, so nothing disappears. */
function initialLevel(): Level {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "simple" || saved === "standard" || saved === "pro") return saved;
    const project = localStorage.getItem("lightsmith.project.v1");
    return project && /"sections":\s*\[\s*\{/.test(project) ? "standard" : "simple";
  } catch {
    return "standard";
  }
}

export function LevelProvider({ children }: { children: ReactNode }) {
  const [level, setLevelState] = useState<Level>(initialLevel);
  const setLevel = (l: Level) => {
    setLevelState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* not remembered; fine */
    }
  };
  return <LevelContext.Provider value={{ level, setLevel }}>{children}</LevelContext.Provider>;
}

export const useLevel = () => useContext(LevelContext);
