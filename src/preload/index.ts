import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("claudeVillage", {
  ping: () => ipcRenderer.invoke("ping")
});
