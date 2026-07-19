import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
// Vite-bundled assets → correct paths inside asar
import heroArt from "./assets/hero-art.png";
import bgArt from "./assets/bg-art.png";

document.documentElement.style.setProperty("--hero-art", `url("${heroArt}")`);
document.documentElement.style.setProperty("--bg-art", `url("${bgArt}")`);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
