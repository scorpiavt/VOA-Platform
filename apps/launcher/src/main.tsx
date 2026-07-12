import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
// Bundled by Vite → correct path inside asar (CSS url(./hero-art.png) was broken from assets/)
import heroArt from "./assets/hero-art.png";

document.documentElement.style.setProperty("--hero-art", `url("${heroArt}")`);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
