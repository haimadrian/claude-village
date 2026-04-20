import http from "node:http";
import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import type { AgentEvent } from "../shared/types";
import { summarizeArgs } from "./event-normalizer";
import { logger } from "./logger";

/**
 * Listens on a loopback HTTP port for Claude Code hook payloads and emits
 * normalized `AgentEvent` objects on the `"event"` channel. Paired with the
 * JSONL `SessionWatcher` as the second ingress path: hooks fire in real time
 * (before the JSONL flush) so the visualization can react the instant a tool
 * starts, not after the transcript lands on disk.
 *
 * Binds to 127.0.0.1 only - the hook install doc should point Claude Code at
 * `http://127.0.0.1:<port>/event`, never a public interface.
 *
 * Usage:
 *   const server = new HookServer();
 *   server.on("event", (e: AgentEvent) => ...);
 *   const port = await server.start();
 *   // later
 *   await server.stop();
 */
export class HookServer extends EventEmitter {
  private server: http.Server | null = null;

  async start(preferredPort = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handleRequest(req, res));
      this.server = server;

      const onError = (err: Error): void => {
        server.removeListener("listening", onListening);
        logger.error("HookServer listen error", { message: err.message, preferredPort });
        reject(err);
      };
      const onListening = (): void => {
        server.removeListener("error", onError);
        const addr = server.address() as AddressInfo | string | null;
        const port = addr && typeof addr === "object" ? addr.port : preferredPort;
        logger.info("HookServer listening", { port, host: "127.0.0.1" });
        resolve(port);
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(preferredPort, "127.0.0.1");
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    logger.info("HookServer stopping");
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== "POST" || req.url !== "/event") {
      res.writeHead(404).end();
      return;
    }

    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        logger.warn("HookServer 400 malformed JSON payload", { bytes: body.length });
        res.writeHead(400).end();
        return;
      }
      const event = hookPayloadToAgentEvent(payload);
      if (event) this.emit("event", event);
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    });
    req.on("error", () => {
      // Client-side errors just drop the request. We never throw out of the
      // HTTP handler to keep the server alive across malformed clients.
    });
  }
}

/**
 * Maps a raw hook payload into the shared `AgentEvent` shape.
 * Returns `null` for payloads we do not care about (unknown hook types,
 * missing session_id, etc.) so the HTTP handler can cheaply drop them.
 */
function hookPayloadToAgentEvent(raw: unknown): AgentEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const sessionId = typeof p.session_id === "string" ? p.session_id : null;
  if (!sessionId) return null;

  const agentId = typeof p.agent_id === "string" ? p.agent_id : sessionId;
  const parentAgentId = typeof p.parent_agent_id === "string" ? p.parent_agent_id : undefined;
  const isSubagent = typeof p.agent_id === "string";
  const kind = isSubagent ? "subagent" : "main";
  const timestamp = Date.now();

  const base = {
    sessionId,
    agentId,
    kind,
    timestamp,
    ...(parentAgentId !== undefined ? { parentAgentId } : {})
  } as const;

  switch (p.hook_event_name) {
    case "SessionStart":
      return { ...base, type: "session-start" };

    case "SubagentStart":
      return {
        ...base,
        kind: "subagent",
        type: "subagent-start"
      };

    case "PreToolUse": {
      const toolName = typeof p.tool_name === "string" ? p.tool_name : "";
      return {
        ...base,
        type: "pre-tool-use",
        toolName,
        toolArgsSummary: summarizeArgs(toolName, p.tool_input)
      };
    }

    case "PostToolUse": {
      const toolName = typeof p.tool_name === "string" ? p.tool_name : "";
      const resultSummary = String(p.tool_result ?? "").slice(0, 200);
      return {
        ...base,
        type: "post-tool-use",
        toolName,
        resultSummary
      };
    }

    case "Stop":
      return {
        ...base,
        type: isSubagent ? "subagent-end" : "session-end"
      };

    default:
      return null;
  }
}
