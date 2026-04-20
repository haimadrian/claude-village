import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import log from "electron-log/main";

/**
 * Central logger for the main process. Wraps `electron-log` with:
 *   - rolling file at `{userData}/logs/main.log`, max 5MB per file, 3 files retention
 *   - INFO default, DEBUG when `CV_DEBUG=1`
 *   - ISO timestamp + level + message format
 *
 * The renderer logger (`src/renderer/logger.ts`) is configured to forward its
 * records through this same file, so a single `main.log` captures every process.
 *
 * On macOS the resolved path is:
 *   ~/Library/Application Support/claude-village/logs/main.log
 */

function resolveLogsDir(): string {
  try {
    // `app.getPath` throws if called before `app.ready`; catch and fall back.
    return path.join(app.getPath("userData"), "logs");
  } catch {
    return path.join(process.cwd(), "logs");
  }
}

const logsDir = resolveLogsDir();

log.transports.file.resolvePathFn = () => path.join(logsDir, "main.log");
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB

// electron-log rotates via `archiveLogFn`. We keep the active file plus two
// archives (main.old.log, main.old.1.log), capping total retention at 3.
log.transports.file.archiveLogFn = (oldLogFile) => {
  try {
    const file = oldLogFile.toString();
    const dir = path.dirname(file);
    const base = path.basename(file, path.extname(file));
    const ext = path.extname(file);
    const archive1 = path.join(dir, `${base}.old${ext}`);
    const archive2 = path.join(dir, `${base}.old.1${ext}`);
    if (fs.existsSync(archive2)) fs.unlinkSync(archive2);
    if (fs.existsSync(archive1)) fs.renameSync(archive1, archive2);
    fs.renameSync(file, archive1);
  } catch {
    // If rotation fails electron-log falls back to its built-in behaviour.
  }
};

const debugMode = process.env.CV_DEBUG === "1";
log.transports.file.level = debugMode ? "debug" : "info";
log.transports.console.level = debugMode ? "debug" : "info";

// ISO timestamp + level + message. Structured fields (sessionId, agentId, file
// paths) are passed as extra arguments; electron-log renders them inline.
log.transports.file.format = "[{iso}] [{level}] {text}";
log.transports.console.format = "[{iso}] [{level}] {text}";

try {
  log.info(`logger initialised file=${path.join(logsDir, "main.log")} debug=${debugMode}`);
} catch {
  // ignore - logger unavailable in some test harnesses
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
