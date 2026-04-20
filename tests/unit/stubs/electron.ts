// Minimal `electron` stub for vitest. The real module loads the Electron
// runtime binary, which does not exist in plain Node. Tests that need real
// electron behaviour should still use `vi.mock("electron", ...)` inline.

export const app = {
  getPath: (_name: string): string => "/tmp/claude-village-test",
  whenReady: async (): Promise<void> => undefined,
  on: (_event: string, _cb: (...args: unknown[]) => void): void => undefined,
  quit: (): void => undefined
};

export const BrowserWindow = class {
  static getAllWindows(): unknown[] {
    return [];
  }
  static getFocusedWindow(): null {
    return null;
  }
  loadURL(): Promise<void> {
    return Promise.resolve();
  }
  loadFile(): Promise<void> {
    return Promise.resolve();
  }
  on(): void {}
  webContents = { send: (): void => undefined };
  isDestroyed(): boolean {
    return false;
  }
};

export const ipcMain = {
  handle: (_channel: string, _cb: (...args: unknown[]) => unknown): void => undefined,
  removeHandler: (_channel: string): void => undefined,
  on: (_channel: string, _cb: (...args: unknown[]) => unknown): void => undefined,
  off: (_channel: string, _cb: (...args: unknown[]) => unknown): void => undefined
};

export const contextBridge = {
  exposeInMainWorld: (_name: string, _api: unknown): void => undefined
};

export const ipcRenderer = {
  invoke: async (): Promise<unknown> => undefined,
  on: (): void => undefined,
  off: (): void => undefined
};

export const Menu = {
  buildFromTemplate: (_template: unknown): unknown => ({}),
  setApplicationMenu: (_menu: unknown): void => undefined
};

export default { app, BrowserWindow, ipcMain, contextBridge, ipcRenderer, Menu };
