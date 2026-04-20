import log from "electron-log/renderer.js";

/**
 * Renderer-side logger. Uses `electron-log/renderer` which forwards records
 * through Electron IPC to the main process, where they land in the same
 * `main.log` file configured by `src/main/logger.ts`. Keeping one log file
 * across processes means a single tail captures everything.
 */

// In the renderer we cannot reference `process.env` directly (no `@types/node`
// in the web tsconfig). Vite inlines `import.meta.env` at build time instead.
// `CV_DEBUG` env vars do not flow through by default, so we fall back to the
// dev-mode flag; this is good enough for renderer-side verbosity tuning since
// the main-process logger is the source of truth for file output.
const debugMode = import.meta.env?.DEV === true;

// The renderer transport delegates formatting to main, but we still set the
// threshold locally so DEBUG lines are dropped before the IPC round trip.
if (log.transports.console) {
  log.transports.console.level = debugMode ? "debug" : "info";
  log.transports.console.format = "[{iso}] [{level}] {text}";
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => {
    if (meta) log.info(message, meta);
    else log.info(message);
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    if (meta) log.warn(message, meta);
    else log.warn(message);
  },
  error: (message: string, meta?: Record<string, unknown>): void => {
    if (meta) log.error(message, meta);
    else log.error(message);
  },
  debug: (message: string, meta?: Record<string, unknown>): void => {
    if (meta) log.debug(message, meta);
    else log.debug(message);
  }
};

export type Logger = typeof logger;
