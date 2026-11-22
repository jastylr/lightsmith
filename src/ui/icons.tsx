/** A small, consistent icon set (24px grid, 1.75 stroke). */
const PATHS = {
  file: "M7 3h7l5 5v13H7zM14 3v5h5",
  stage: "M3 17h18M5 17V9l7-4l7 4v8M9 17v-4h6v4",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0z",
  download: "M12 4v11M7 10l5 5l5-5M5 20h14",
  upload: "M12 20V9M7 14l5-5l5 5M5 4h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  boxEmpty: "M6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4z",
  boxChecked: "M6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4zM8.5 12.2l2.4 2.4l4.6-4.8",
  boxSome: "M6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4zM8.5 12h7",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0z",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  alert: "M12 8v5M12 16.5v.5M10.3 4l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  popout: "M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  dock: "M4 5h16v14H4zM4 15h16",
  undo: "M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5l-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  copy: "M9 9h11v11H9zM5 15V4h11",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  chevronDown: "M6 9l6 6l6-6",
  chevronUp: "M6 15l6-6l6 6",
  chevronRight: "M9 6l6 6l-6 6",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  rain: "M7 13v4M12 15v4M17 13v4M7 11a5 5 0 1 1 9.6-2A3.5 3.5 0 1 1 17 11z",
  bolt: "M13 3L5 14h6l-1 7l8-11h-6z",
  strobe: "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z",
  sun: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z",
  pulse: "M3 12h4l2-6l4 12l2-6h6",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  palette: "M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.2-1.6c-.4-1 .3-2.4 1.6-2.4H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01",
  wheel: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4",
  info: "M12 11v6M12 7.5v.5M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z",
  reset: "M4 4v6h6M4.5 15a8 8 0 1 0 1.9-8.3L4 10",
  backdrop: "M5 4v16M9.7 4v16M14.3 4v16M19 4v16",
  par: "M8 6h8l-1.5 6h-5zM12 12v6M8 20h8",
  mover: "M6 20h12M12 20v-4M7 6h10v6a5 5 0 0 1-10 0zM5 9v4M19 9v4",
  front: "M4 17h16M6 17l2-8h8l2 8M10 9V6h4v3",
  hidden: "M3 3l18 18M10.6 6.2A9.7 9.7 0 0 1 12 6c5 0 8.5 4.2 9.5 6c-.4.8-1.3 2.1-2.6 3.3M6.6 6.6C4.4 8 3 10.2 2.5 12c1 1.8 4.5 6 9.5 6a9.4 9.4 0 0 0 4.4-1.1",
  focus: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6z",
  play: "M7 4l12 8l-12 8z",
  pause: "M7 5h3v14H7zM14 5h3v14h-3z",
  skipBack: "M18 5L8 12l10 7zM6 5v14",
  midi: "M5 4h5.5v5.5H5zM13.5 4H19v5.5h-5.5zM5 14.5h5.5V20H5zM13.5 14.5H19V20h-5.5z",
  printer: "M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  stack: "M4 5h16M4 10h16M4 15h16M4 20h16",
  ear: "M7 10a5 5 0 0 1 10 0c0 3-2.5 3.5-3 6a2.5 2.5 0 0 1-5 .5M10 10a2 2 0 0 1 4 0",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className ? `icon ${className}` : "icon"}>
      <path d={PATHS[name]} />
    </svg>
  );
}
