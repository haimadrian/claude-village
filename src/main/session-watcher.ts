import chokidar from "chokidar";
import type { FSWatcher } from "chokidar";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import type { AgentEvent } from "../shared/types";

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
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    this.offsets.clear();
  }

  private readFromOffset(file: string): void {
    const prevOffset = this.offsets.get(file) ?? 0;
    const size = fs.statSync(file).size;
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
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = this.parseLine(line);
        if (event) this.emit("event", event);
      }
      this.offsets.set(file, size);
    });
    stream.on("error", () => {
      // Swallow read errors: the file may have been rotated out from under us.
      // The next `change` event will reset the offset via the truncation guard above.
    });
  }

  private parseLine(line: string): AgentEvent | null {
    // JSONL lines are externally produced and schema-less from our perspective,
    // so `any` is intentional here - we normalize into the typed AgentEvent below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let raw: any;
    try {
      raw = JSON.parse(line);
    } catch {
      return null;
    }
    return normalizeJsonlEvent(raw, line);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeJsonlEvent(raw: any, rawLine: string): AgentEvent | null {
  if (!raw?.sessionId) return null;
  const timestamp = raw.timestamp ? Date.parse(raw.timestamp) : Date.now();
  const sessionId: string = raw.sessionId;

  if (raw.type === "user") {
    const excerpt = extractText(raw.message?.content)?.slice(0, 500);
    return {
      sessionId,
      agentId: sessionId, // main agent shares id with session until subagent tracking lands
      kind: "main",
      timestamp,
      type: "user-message",
      rawLine,
      ...(excerpt !== undefined ? { messageExcerpt: excerpt } : {})
    };
  }

  if (raw.type === "assistant") {
    const content = raw.message?.content;
    const toolUse = Array.isArray(content)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content.find((p: any) => p?.type === "tool_use")
      : null;
    if (toolUse) {
      return {
        sessionId,
        agentId: sessionId,
        kind: "main",
        timestamp,
        type: "pre-tool-use",
        toolName: toolUse.name,
        toolArgsSummary: summarizeArgs(toolUse.name, toolUse.input),
        rawLine
      };
    }
    const excerpt = extractText(content)?.slice(0, 500);
    return {
      sessionId,
      agentId: sessionId,
      kind: "main",
      timestamp,
      type: "assistant-message",
      rawLine,
      ...(excerpt !== undefined ? { messageExcerpt: excerpt } : {})
    };
  }

  if (raw.type === "tool_result" || raw.type === "user-tool-result") {
    const summary = extractText(raw.toolUseResult ?? raw.content)?.slice(0, 200);
    return {
      sessionId,
      agentId: sessionId,
      kind: "main",
      timestamp,
      type: "post-tool-use",
      rawLine,
      ...(summary !== undefined ? { resultSummary: summary } : {})
    };
  }

  return null;
}

function extractText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: unknown) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object" && "text" in p) {
          const t = (p as { text?: unknown }).text;
          return typeof t === "string" ? t : "";
        }
        return "";
      })
      .filter(Boolean)
      .join(" ");
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeArgs(tool: string, input: any): string {
  if (!input) return "";
  if (tool === "Read" || tool === "Edit" || tool === "Write") {
    return String(input.file_path ?? "");
  }
  if (tool === "Bash") return String(input.command ?? "").slice(0, 80);
  if (tool === "Grep" || tool === "Glob") {
    return String(input.pattern ?? input.path ?? "");
  }
  return JSON.stringify(input).slice(0, 80);
}
