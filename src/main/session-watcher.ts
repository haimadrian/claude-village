import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import type { AgentEvent } from "../shared/types";
import { normalizeJsonlEvent } from "./event-normalizer";
import { logger } from "./logger";

/**
 * Watches a root directory for Claude Code JSONL session logs and emits
 * normalized `AgentEvent` objects. Tracks a per-file byte offset so each
 * append is read exactly once and truncations reset to the top of the file.
 *
 * Usage:
 *   const watcher = new SessionWatcher("~/.claude/projects");
 *   watcher.on("event", (e: AgentEvent) => ...);
 *   await watcher.start();
 *   // later
 *   await watcher.stop();
 */
export class SessionWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private offsets = new Map<string, number>();

  constructor(private readonly rootDir: string) {
    super();
  }

  async start(): Promise<void> {
    logger.info("SessionWatcher starting", { rootDir: this.rootDir });
    // chokidar v4 dropped built-in glob support, so we watch the root dir and
    // filter to *.jsonl via the `ignored` predicate. Non-file paths (dirs) must
    // pass through so subdirectories get traversed.
    this.watcher = chokidar.watch(this.rootDir, {
      persistent: true,
      ignoreInitial: false,
      ignored: (p, stats) => !!stats?.isFile() && !p.endsWith(".jsonl"),
      // Wait for writes to settle before firing so we do not read a partial
      // JSONL line mid-append. 50ms is tuned to match typical Claude Code flush cadence.
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 }
    });

    this.watcher.on("add", (file) => this.readFromOffset(file));
    this.watcher.on("change", (file) => this.readFromOffset(file));
    this.watcher.on("unlink", (file) => {
      logger.debug("SessionWatcher file removed", { file });
      this.offsets.delete(file);
    });
  }

  async stop(): Promise<void> {
    logger.info("SessionWatcher stopping");
    await this.watcher?.close();
    this.watcher = null;
    this.offsets.clear();
  }

  private readFromOffset(file: string): void {
    let size: number;
    try {
      size = fs.statSync(file).size;
    } catch {
      // File was unlinked between the chokidar event and our stat call. The
      // unlink handler will clean up this.offsets; nothing to read.
      logger.warn("SessionWatcher stat failed (file removed mid-read)", { file });
      return;
    }

    const prevOffset = this.offsets.get(file) ?? 0;
    // Truncation or rewrite detection: chokidar only fires `change` when the
    // file actually changed, so if the file is not strictly larger than our
    // cursor we must be looking at a rewrite (same size with different bytes,
    // or a shrink). Reset to the top and re-read.
    let offset = prevOffset;
    if (size <= prevOffset && prevOffset > 0) offset = 0;

    if (offset >= size) return;

    const stream = fs.createReadStream(file, {
      start: offset,
      end: size - 1,
      encoding: "utf8"
    });
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
    });
    stream.on("end", () => {
      const lines = buffer.split("\n");
      let emitted = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = this.parseLine(line, file);
        if (event) {
          this.emit("event", event);
          emitted += 1;
        }
      }
      if (emitted > 0) logger.debug("SessionWatcher emitted events", { file, count: emitted });
      this.offsets.set(file, size);
    });
    stream.on("error", (err) => {
      // Swallow read errors: the file may have been rotated out from under us.
      // The next `change` event will reset the offset via the truncation guard above.
      logger.warn("SessionWatcher read stream error", { file, message: err.message });
    });
  }

  private parseLine(line: string, file: string): AgentEvent | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let raw: any;
    try {
      raw = JSON.parse(line);
    } catch {
      logger.warn("SessionWatcher malformed JSONL line", {
        file,
        excerpt: line.slice(0, 120)
      });
      return null;
    }
    return normalizeJsonlEvent(raw, line);
  }
}
