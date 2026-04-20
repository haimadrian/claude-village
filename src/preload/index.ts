import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("claudeVillage", {
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  getSession: (id: string) => ipcRenderer.invoke("session:get", id),
  pinSession: (id: string) => ipcRenderer.invoke("session:pin", id),
  unpinSession: (id: string) => ipcRenderer.invoke("session:unpin", id),
  onPatch: (cb: (p: unknown) => void) => {
    const listener = (_e: unknown, p: unknown): void => cb(p);
    ipcRenderer.on("session:patch", listener);
    return () => ipcRenderer.off("session:patch", listener);
  },
  onMenuAbout: (cb: () => void): (() => void) => {
    const l = (): void => cb();
    ipcRenderer.on("menu:about", l);
    return () => ipcRenderer.off("menu:about", l);
  }
});
