/**
 * DukaPOS Electron main process.
 * Spawns FastAPI backend (server.exe when packaged, python main.py in dev).
 * Database: userData/data/pos.db when packaged.
 * Port: finds free port 8000, 8001, ... and passes to backend; injects port to renderer.
 * Child process killed on window-all-closed.
 */
import { app, BrowserWindow, Menu } from "electron";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as net from "net";

const PORT_START = 8000;
const PORT_END = 8010;
const HEALTH_TIMEOUT_MS = 15000;

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
/** Port the backend is running on (set after start); injected to renderer. */
let backendPort = PORT_START;

/** Repo root in dev: dist-main -> electron -> repo root. */
function getRepoRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

/** Path to backend exe when packaged (extraResources). */
function getPackagedBackendPath(): string {
  const resourcesPath = process.resourcesPath;
  const isWin = process.platform === "win32";
  const exeName = isWin ? "server.exe" : "server";
  return path.join(resourcesPath, exeName);
}

/** Path to backend main.py in dev. */
function getBackendMainPath(): string {
  return path.join(getRepoRoot(), "backend", "main.py");
}

/** Check if a port is free (TCP connect fails = free). */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.destroy();
      resolve(false); // connected = in use
    });
    socket.on("error", () => resolve(true)); // error = free
  });
}

/** Find first free port in [start, end]. */
async function findFreePort(start: number, end: number): Promise<number> {
  for (let p = start; p <= end; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`No free port in range ${start}-${end}`);
}

/** Wait until backend responds on port (TCP connect). */
function waitForBackend(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("Backend health timeout"));
        else setTimeout(check, 200);
      });
    };
    check();
  });
}

/** User data dir for DB when packaged: app.getPath('userData')/data. */
function getUserDataDbPath(): string {
  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, "pos.db");
}

/** SQLite file URL for Python: file:///C:/path/to/pos.db (forward slashes). */
function toFileUrl(absolutePath: string): string {
  const normalized = path.resolve(absolutePath).replace(/\\/g, "/");
  if (process.platform === "win32") return "sqlite:///" + normalized;
  return "sqlite://" + normalized;
}

/** Spawn backend: packaged exe or dev python. */
function startBackend(port: number): ChildProcess {
  const isPackaged = app.isPackaged;
  const isWin = process.platform === "win32";

  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUNBUFFERED: "1", API_PORT: String(port) };

  if (isPackaged) {
    const exePath = getPackagedBackendPath();
    if (!fs.existsSync(exePath)) {
      console.error("[DukaPOS] Packaged backend not found:", exePath);
      process.exit(1);
    }
    const dbPath = getUserDataDbPath();
    env.DATABASE_URL = toFileUrl(dbPath);
    const proc = spawn(exePath, ["--port", String(port)], {
      cwd: path.dirname(exePath),
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
    proc.stdout?.on("data", (chunk) => process.stdout.write("[Backend] " + chunk.toString()));
    proc.stderr?.on("data", (chunk) => process.stderr.write("[Backend] " + chunk.toString()));
    proc.on("error", (err) => console.error("[DukaPOS] Backend spawn error:", err));
    proc.on("exit", (code, signal) => {
      if (code != null && code !== 0) console.error("[DukaPOS] Backend exited with code", code);
      if (signal) console.error("[DukaPOS] Backend killed:", signal);
    });
    return proc;
  }

  const repoRoot = getRepoRoot();
  const mainPy = getBackendMainPath();
  if (!fs.existsSync(mainPy)) {
    console.error("[DukaPOS] Backend not found:", mainPy);
    process.exit(1);
  }
  const cmd = isWin ? "python" : "python3";
  const proc = spawn(cmd, [mainPy, "--port", String(port)], {
    cwd: path.join(repoRoot, "backend"),
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  proc.stdout?.on("data", (chunk) => process.stdout.write("[Backend] " + chunk.toString()));
  proc.stderr?.on("data", (chunk) => process.stderr.write("[Backend] " + chunk.toString()));
  proc.on("error", (err) => console.error("[DukaPOS] Backend spawn error:", err));
  proc.on("exit", (code, signal) => {
    if (code != null && code !== 0) console.error("[DukaPOS] Backend exited with code", code);
    if (signal) console.error("[DukaPOS] Backend killed:", signal);
  });
  return proc;
}

/** Kill backend process tree. */
function killBackend(): void {
  if (!backendProcess || !backendProcess.pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", backendProcess.pid.toString(), "/f", "/t"], { stdio: "ignore" });
    } else {
      process.kill(-backendProcess.pid, "SIGTERM");
    }
  } catch {
    backendProcess.kill("SIGTERM");
  }
  backendProcess = null;
}

const RENDERER_URL = process.env.VITE_DEV_URL || "http://localhost:5173";

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Show after ready for smooth launch
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Maximize on ready (production POS experience)
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "..", "src", "renderer", "dist", "index.html"));
  } else {
    mainWindow.loadURL(RENDERER_URL);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Inject backend port so renderer can use http://localhost:PORT
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.executeJavaScript(`window.__DUKAPOS_BACKEND_PORT__ = ${backendPort};`).catch(() => { });
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const portFree = await isPortFree(PORT_START);
  if (!portFree) {
    console.log("[DukaPOS] Port", PORT_START, "already in use, assuming backend is running.");
    backendPort = PORT_START;
  } else {
    backendPort = await findFreePort(PORT_START, PORT_END);
    backendProcess = startBackend(backendPort);
    try {
      await waitForBackend(backendPort, HEALTH_TIMEOUT_MS);
      console.log("[DukaPOS] Backend healthy on port", backendPort);
    } catch (e) {
      console.error("[DukaPOS] Backend failed to start:", e);
      killBackend();
      app.quit();
      return;
    }
  }
  createWindow();
});

app.on("window-all-closed", () => {
  killBackend();
  app.quit();
});

app.on("before-quit", () => {
  killBackend();
});
