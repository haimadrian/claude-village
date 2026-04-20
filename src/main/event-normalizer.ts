import type { AgentEvent } from "../shared/types";
import { logger } from "./logger";

// Dedupe unknown payload-type warnings so a repeated benign event type
// (e.g. `attachment`, `custom-title`) does not flood the log. Each distinct
// type is warned once at INFO level, then silenced.
const warnedTypes = new Set<string>();

/**
 * Normalizes a single parsed Claude Code JSONL line into an AgentEvent.
 * Shared with the hook server so both ingress paths produce identical event shapes.
 *
 * JSONL lines are externally produced and schema-less from our perspective, so
 * `any` is used for the parsed-JSON input. We narrow into the typed AgentEvent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeJsonlEvent(raw: any, rawLine: string): AgentEvent | null {
  if (!raw?.sessionId) return null;
  const timestamp = raw.timestamp ? Date.parse(raw.timestamp) : Date.now();
  const sessionId: string = raw.sessionId;

  if (raw.type === "user") {
    const excerpt = extractText(raw.message?.content)?.slice(0, 500);
    logger.debug("normalizeJsonlEvent produced user-message", { sessionId });
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

  if (raw.type === "custom-title" || raw.type === "summary") {
    const title =
      typeof raw.title === "string"
        ? raw.title
        : typeof raw.summary === "string"
          ? raw.summary
          : undefined;
    if (title) {
      return {
        sessionId,
        agentId: sessionId,
        kind: "main",
        timestamp,
        type: "session-title",
        sessionTitle: title,
        rawLine
      };
    }
    return null;
  }

  if (raw.type === "tool_result" || raw.type === "user-tool-result") {
    const summary = extractText(raw.toolUseResult ?? raw.content)?.slice(0, 200);
    logger.debug("normalizeJsonlEvent produced post-tool-use", { sessionId });
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

  // Unknown / unhandled payload type. Benign - Claude Code emits many event
  // kinds we do not visualise. Log each distinct type exactly once at INFO so
  // we can see the vocabulary without flooding the file on busy sessions.
  if (typeof raw.type === "string" && !warnedTypes.has(raw.type)) {
    warnedTypes.add(raw.type);
    logger.info("normalizeJsonlEvent skipping unhandled payload type (logged once)", {
      payloadType: raw.type
    });
  }
  return null;
}

/**
 * Extracts a text excerpt from a Claude Code message `content` field.
 * Supports string content and arrays of `{type, text}` blocks.
 */
export function extractText(content: unknown): string | undefined {
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

/**
 * Condenses tool-call arguments into a short human-readable string for
 * tooltips and timeline entries. Shared between the JSONL watcher and the hook server.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function summarizeArgs(tool: string, input: any): string {
  if (!input) return "";
  if (tool === "Read" || tool === "Edit" || tool === "Write") {
    return String(input.file_path ?? "");
  }
  if (tool === "Bash") return String(input.command ?? "").slice(0, 80);
  if (tool === "Grep" || tool === "Glob") {
    return String(input.pattern ?? input.path ?? "");
  }
  try {
    return JSON.stringify(input).slice(0, 80);
  } catch {
    return "";
  }
}
