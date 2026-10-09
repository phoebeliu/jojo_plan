import {
  app,
  BrowserWindow,
  ipcMain,
  utilityProcess,
  safeStorage,
  dialog,
} from "electron";
import { join } from "node:path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
let win: BrowserWindow;
let worker: ReturnType<typeof utilityProcess.fork>;
const pending = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: any) => void }
>();
const keys = new Map<string, string>();
const root = process.env.JOJO_DATA_DIR || app.getPath("userData");
let codex = process.env.JOJO_CODEX_PATH || "";
function send(request: any) {
  return new Promise<any>((resolve, reject) => {
    const callId = randomUUID();
    pending.set(callId, { resolve, reject });
    worker.postMessage({ callId, request });
    const timer = setTimeout(() => {
      if (pending.delete(callId)) reject(Error("服务响应超时"));
    }, 10000);
    timer.unref();
  });
}
mkdirSync(root, { recursive: true, mode: 0o700 });
app.setPath("userData", root);
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
if (ownsInstance)
  app.whenReady().then(() => {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const keyFile = join(root, "credentials.json");
    if (existsSync(keyFile)) {
      const data = JSON.parse(readFileSync(keyFile, "utf8"));
      for (const [id, value] of Object.entries(data))
        try {
          if (safeStorage.isEncryptionAvailable())
            keys.set(
              id,
              safeStorage.decryptString(Buffer.from(value as string, "base64")),
            );
        } catch {}
    }
    if (!codex) {
      const known =
        "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";
      if (existsSync(known)) codex = known;
      else
        try {
          codex = execFileSync("/usr/bin/which", ["codex"], {
            encoding: "utf8",
          }).trim();
        } catch {}
    }
    worker = utilityProcess.fork(
      join(__dirname, "worker.js"),
      [
        root,
        app.isPackaged
          ? join(process.resourcesPath, "migrations")
          : join(app.getAppPath(), "packages/storage/migrations"),
        codex,
      ],
      { serviceName: "Jojo Domain Service" },
    );
    worker.on("message", (message: any) => {
      if (message.callId) {
        const p = pending.get(message.callId);
        if (p) {
          pending.delete(message.callId);
          p.resolve(message.response);
        }
      } else if (message.ready)
        worker.postMessage({ keys: Object.fromEntries(keys) });
      else if (win && !win.isDestroyed())
        win.webContents.send("jojo:event", message);
    });
    worker.on("exit", () => {
      for (const p of pending.values())
        p.reject(Error("后台服务已退出，重开应用后可恢复工作"));
      pending.clear();
    });
    win = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 860,
      minHeight: 650,
      title: "Jojo Plan",
      backgroundColor: "#faf9f6",
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    const trusted = (event: any) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        throw Error("非法调用来源");
    };
    ipcMain.handle("jojo:command", async (event, request) => {
      trusted(event);
      return send(request);
    });
    ipcMain.handle("jojo:key", async (event, { providerId, key }) => {
      trusted(event);
      if (
        typeof providerId !== "string" ||
        typeof key !== "string" ||
        key.length > 10000
      )
        throw Error("无效凭据");
      if (!safeStorage.isEncryptionAvailable())
        throw Error("本机安全存储不可用，未保存明文密钥");
      keys.set(providerId, key);
      writeFileSync(
        keyFile + ".tmp",
        JSON.stringify(
          Object.fromEntries(
            [...keys].map(([id, v]) => [
              id,
              safeStorage.encryptString(v).toString("base64"),
            ]),
          ),
        ),
        { mode: 0o600 },
      );
      renameSync(keyFile + ".tmp", keyFile);
      worker.postMessage({ keys: Object.fromEntries(keys) });
      return true;
    });
    ipcMain.handle("jojo:export", async (event, data) => {
      trusted(event);
      const request = data.request;
      const response = await send(request);
      if (!response.ok) return response;
      const r = await dialog.showSaveDialog(win, {
        defaultPath: response.result.name,
        filters: [{ name: "交接包", extensions: ["zip"] }],
      });
      if (!r.canceled && r.filePath)
        writeFileSync(r.filePath, Buffer.from(response.result.bytes));
      return { saved: !r.canceled };
    });
    win.loadFile(join(__dirname, "index.html"));
  });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  worker?.postMessage({ stop: true });
  worker?.kill();
});
