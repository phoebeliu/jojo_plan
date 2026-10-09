import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("jojo", {
  command: (request: unknown) => ipcRenderer.invoke("jojo:command", request),
  saveKey: (providerId: string, key: string) =>
    ipcRenderer.invoke("jojo:key", { providerId, key }),
  export: (request: unknown) => ipcRenderer.invoke("jojo:export", { request }),
  onEvent: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("jojo:event", handler);
    return () => ipcRenderer.removeListener("jojo:event", handler);
  },
});
