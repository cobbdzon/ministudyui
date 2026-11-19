// Composition root for the Electrobun desktop shell (Phase 1 spike).
// T10 proof of life: open a window on a bundled blank page.
import { BrowserWindow } from "electrobun/main";

const mainWindow = new BrowserWindow({
  title: "ministudyui",
  url: "views://mainview/index.html",
  frame: { width: 1000, height: 720, x: 160, y: 120 },
});

console.log("ministudyui desktop started");
void mainWindow;
