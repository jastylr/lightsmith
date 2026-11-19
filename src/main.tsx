import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/archivo";
import { App } from "./ui/App";
import { LevelProvider } from "./ui/level";
import "./ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LevelProvider>
      <App />
    </LevelProvider>
  </StrictMode>,
);
