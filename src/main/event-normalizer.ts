import type { AgentEvent } from "../shared/types";
import { logger } from "./logger";

// Dedupe unknown payload-type warnings so a repeated benign event type
// (e.g. `attachment`, `custom-title`) does not flood the log. Each distinct
// type is warned once at INFO level, then silenced.
const warnedTypes = new Set<string>();

// Per-session monotonic counter used as a fallback synthetic subagent id
// when a `Task`/`Agent` tool_use payload is missing its tool_use_id. The id
// only needs to be unique within the session for the lifetime of the process.
const fallbackSubagentCounter = new Map<string, number>();

/**
 * Returns the id we use to represent a subagent spawned by a `Task` or `Agent`
 * tool call from the parent session. Prefers the real `tool_use_id` so pre /
 * post events can be correlated; falls back to a monotonic per-session counter
 * when the id is missing.
 */
export function subagentIdFor(sessionId: string, toolUseId: string | undefined): string {
  if (typeof toolUseId === "string" && toolUseId.length > 0) {
    return `${sessionId}:${toolUseId}`;
  }
  const next = (fallbackSubagentCounter.get(sessionId) ?? 0) + 1;
  fallbackSubagentCounter.set(sessionId, next);
  return `${sessionId}:sub-${next}`;
}

/** True if `tool` is the name Claude Code uses to dispatch a subagent. */
export function isSubagentDispatchTool(tool: string | undefined | null): boolean {
  return tool === "Task" || tool === "Agent";
}

/**
 * Normalizes a single parsed Claude Code JSONL line into one or more
 * `AgentEvent`s. Most lines produce exactly one event; `Task` / `Agent` tool
 * calls produce two (the parent's pre/post-tool-use event AND a synthetic
 * subagent-start / subagent-end so the visualization can render a character
 * for the spawned subagent).
 *
 * Returning `AgentEvent[]` keeps the call-site contract simple: always a list,
 * possibly empty. Callers that previously treated a single event as a scalar
 * just iterate.
 *
 * JSONL lines are externally produced and schema-less from our perspective, so
 * `any` is used for the parsed-JSON input. We narrow into the typed AgentEvent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeJsonlEvents(raw: any, rawLine: string): AgentEvent[] {
  if (!raw?.sessionId) return [];
  const timestamp = raw.timestamp ? Date.parse(raw.timestamp) : Date.now();
  const sessionId: string = raw.sessionId;

  if (raw.type === "user") {
    const excerpt = extractText(raw.message?.content)?.slice(0, 500);
    logger.debug("normalizeJsonlEvents produced user-message", { sessionId });
    return [
      {
        sessionId,
        agentId: sessionId,
        kind: "main",
        timestamp,
        type: "user-message",
        rawLine,
        ...(excerpt !== undefined ? { messageExcerpt: excerpt } : {})
      }
    ];
  }

  if (raw.type === "assistant") {
    const content = raw.message?.content;
    const toolUse = Array.isArray(content)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content.find((p: any) => p?.type === "tool_use")
      : null;
    if (toolUse) {
      const toolName: string = toolUse.name;
      const parentEvent: AgentEvent = {
        sessionId,
        agentId: sessionId,
        kind: "main",
        timestamp,
        type: "pre-tool-use",
        toolName,
        toolArgsSummary: summarizeArgs(toolName, toolUse.input),
        rawLine
      };
      if (isSubagentDispatchTool(toolName)) {
        const subagentId = subagentIdFor(sessionId, toolUse.id);
        const subagentStart: AgentEvent = {
          sessionId,
          agentId: subagentId,
          parentAgentId: sessionId,
          kind: "subagent",
          timestamp,
          type: "subagent-start",
          rawLine
        };
        logger.debug("normalizeJsonlEvents produced Task pre-tool-use + subagent-start", {
          sessionId,
          subagentId
        });
        return [parentEvent, subagentStart];
      }
      return [parentEvent];
    }
    const excerpt = extractText(content)?.slice(0, 500);
    return [
      {
        sessionId,
        agentId: sessionId,
        kind: "main",
        timestamp,
        type: "assistant-message",
        rawLine,
        ...(excerpt !== undefined ? { messageExcerpt: excerpt } : {})
      }
    ];
  }

  if (raw.type === "custom-title" || raw.type === "summary") {
    const title =
      typeof raw.title === "string"
        ? raw.title
        : typeof raw.summary === "string"
          ? raw.summary
          : undefined;
    if (title) {
      return [
        {
          sessionId,
          agentId: sessionId,
          kind: "main",
          timestamp,
          type: "session-title",
          sessionTitle: title,
          rawLine
        }
      ];
    }
    return [];
  }

  if (raw.type === "tool_result" || raw.type === "user-tool-result") {
    const summary = extractText(raw.toolUseResult ?? raw.content)?.slice(0, 200);
    logger.debug("normalizeJsonlEvents produced post-tool-use", { sessionId });
    // `tool_result` payloads from Claude Code carry `tool_use_id` that maps
    // back to the originating `tool_use` block on the previous assistant line.
    // We use it both to identify a subagent completion and to keep the pre /
    // post pair linked even when multiple tools are in flight.
    const toolUseId: string | undefined =
      typeof raw.tool_use_id === "string"
        ? raw.tool_use_id
        : typeof raw.toolUseResult?.tool_use_id === "string"
          ? raw.toolUseResult.tool_use_id
          : undefined;
    // We cannot tell from the tool_result alone whether the original tool was
    // `Task`, so we emit both the parent post-tool-use and a speculative
    // subagent-end whenever we have a tool_use_id. If no subagent with that
    // id exists the store silently ignores the end event.
    const parentEvent: AgentEvent = {
      sessionId,
      agentId: sessionId,
      kind: "main",
      timestamp,
      type: "post-tool-use",
      rawLine,
      ...(summary !== undefined ? { resultSummary: summary } : {})
    };
    if (toolUseId !== undefined) {
      const subagentEnd: AgentEvent = {
        sessionId,
        agentId: subagentIdFor(sessionId, toolUseId),
        parentAgentId: sessionId,
        kind: "subagent",
        timestamp,
        type: "subagent-end",
        rawLine
      };
      return [parentEvent, subagentEnd];
    }
    return [parentEvent];
  }

  // Unknown / unhandled payload type. Benign - Claude Code emits many event
  // kinds we do not visualise. Log each distinct type exactly once at INFO so
  // we can see the vocabulary without flooding the file on busy sessions.
  if (typeof raw.type === "string" && !warnedTypes.has(raw.type)) {
    warnedTypes.add(raw.type);
    logger.info("normalizeJsonlEvents skipping unhandled payload type (logged once)", {
      payloadType: raw.type
    });
  }
  return [];
}

/**
 * Back-compat single-event wrapper. Returns the first event emitted for a
 * given raw line, or `null` if the line produced none. New call sites should
 * prefer `normalizeJsonlEvents` so they see synthetic subagent events too.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeJsonlEvent(raw: any, rawLine: string): AgentEvent | null {
  const events = normalizeJsonlEvents(raw, rawLine);
  return events[0] ?? null;
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
  if (tool === "Task" || tool === "Agent") {
    const subtype = typeof input.subagent_type === "string" ? input.subagent_type : "";
    const prompt = typeof input.prompt === "string" ? input.prompt : "";
    const head = subtype ? `${subtype}: ` : "";
    return (head + prompt).slice(0, 80);
  }
  try {
    return JSON.stringify(input).slice(0, 80);
  } catch {
    return "";
  }
}
