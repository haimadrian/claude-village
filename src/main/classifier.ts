import type { AgentEvent, Classification, WorkAnimation } from "../shared/types";
import type { ZoneId } from "../shared/zones";
import { logger } from "./logger";

// Remember which (tool, zone, animation) combinations we have already logged
// this process lifetime so classifier DEBUG output stays sparse. Instrumentation,
// not business data, so in-memory is fine.
const seenClassifications = new Set<string>();

// Matches common test-runner invocations. Word boundary `\b` is intentional so
// substrings inside larger commands still register (e.g. `pnpm run -- pnpm test`).
const TEST_RE =
  /\b(pnpm test|npm test|yarn test|vitest|jest|pytest|rspec|ruby -Itest|go test|cargo test)\b/;

// Matches git subcommands we treat as "nether" activity plus the GitHub CLI when
// invoked at the start of a command (`gh ...`). Keep in sync with spec Section 5.
const GIT_RE =
  /\bgit (commit|push|pull|checkout|branch|merge|rebase|fetch|log|diff|status|reset|revert|tag)\b|^gh\s/;

export function classify(event: AgentEvent): Classification {
  if (event.type === "session-end" || event.type === "subagent-end") {
    return {
      zone: "tavern",
      animation: "work-tavern",
      tooltip: "Idle",
      timelineText: event.type === "session-end" ? "Session ended" : "Subagent finished"
    };
  }

  if (event.type === "user-message") {
    const excerpt = event.messageExcerpt ?? "";
    return {
      zone: "tavern",
      animation: "idle",
      tooltip: `User: ${excerpt}`,
      timelineText: `user: ${excerpt}`
    };
  }

  if (event.type === "assistant-message") {
    const excerpt = event.messageExcerpt ?? "";
    return {
      zone: "tavern",
      animation: "idle",
      tooltip: excerpt || "Thinking",
      timelineText: `assistant: ${excerpt}`
    };
  }

  if (event.type === "pre-tool-use") {
    const toolName = event.toolName ?? "tool";
    const args = event.toolArgsSummary ?? "";
    const zone = toolToZone(toolName, args);
    const animation = zoneToAnimation(zone);
    const key = `${toolName}:${zone}:${animation}`;
    if (!seenClassifications.has(key)) {
      seenClassifications.add(key);
      logger.debug("classifier new classification path", { toolName, zone, animation });
    }
    return {
      zone,
      animation,
      tooltip: `${toolName} ${args}`.trim(),
      timelineText: `${toolName}(${args})`
    };
  }

  if (event.type === "post-tool-use") {
    const zone = toolToZone(event.toolName ?? "", "");
    return {
      zone,
      animation: zoneToAnimation(zone),
      tooltip: event.resultSummary ?? "Done",
      timelineText: `-> ${event.resultSummary ?? ""}`
    };
  }

  return { zone: "tavern", animation: "idle", tooltip: "", timelineText: "" };
}

function toolToZone(tool: string, args: string): ZoneId {
  if (tool === "Read") return "library";
  if (tool === "Write" || tool === "Edit" || tool === "NotebookEdit") return "office";
  if (tool === "Grep" || tool === "Glob") return "mine";
  if (tool === "Task" || tool === "Agent") return "spawner";
  if (tool === "WebFetch" || tool === "WebSearch") return "signpost";
  if (tool.startsWith("mcp__")) return "signpost";
  if (tool === "Bash") {
    if (TEST_RE.test(args)) return "farm";
    if (GIT_RE.test(args)) return "nether";
    return "forest";
  }
  return "tavern";
}

// Template-literal return type keeps this in sync with `ZoneId` without a cast.
function zoneToAnimation(zone: ZoneId): WorkAnimation {
  return `work-${zone}`;
}
