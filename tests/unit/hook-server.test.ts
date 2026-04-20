import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { HookServer } from "../../src/main/hook-server";
import type { AgentEvent } from "../../src/shared/types";

describe("HookServer", () => {
  let server: HookServer | null = null;

  afterEach(async () => {
    await server?.stop();
    server = null;
  });

  it("converts PreToolUse hook payload into AgentEvent", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e: AgentEvent) => received.push(e));
    const port = await server.start();

    await post(port, "/event", {
      hook_event_name: "PreToolUse",
      session_id: "sess-1",
      tool_name: "Read",
      tool_input: { file_path: "/tmp/x.ts" }
    });

    expect(received.length).toBe(1);
    const event = received[0]!;
    expect(event.type).toBe("pre-tool-use");
    expect(event.toolName).toBe("Read");
    expect(event.sessionId).toBe("sess-1");
    // summarizeArgs from event-normalizer should be reused here.
    expect(event.toolArgsSummary).toBe("/tmp/x.ts");
  });

  it("ignores unknown hook types", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e: AgentEvent) => received.push(e));
    const port = await server.start();

    await post(port, "/event", {
      hook_event_name: "Nonsense",
      session_id: "sess-1"
    });

    expect(received.length).toBe(0);
  });

  it("converts PostToolUse payload with truncated result summary", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e: AgentEvent) => received.push(e));
    const port = await server.start();

    const longResult = "x".repeat(500);
    await post(port, "/event", {
      hook_event_name: "PostToolUse",
      session_id: "sess-2",
      tool_name: "Read",
      tool_result: longResult
    });

    expect(received.length).toBe(1);
    const event = received[0]!;
    expect(event.type).toBe("post-tool-use");
    expect(event.toolName).toBe("Read");
    expect(event.resultSummary?.length).toBe(200);
  });

  it("treats Stop with agent_id as subagent-end and without as session-end", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e: AgentEvent) => received.push(e));
    const port = await server.start();

    await post(port, "/event", {
      hook_event_name: "Stop",
      session_id: "sess-3"
    });
    await post(port, "/event", {
      hook_event_name: "Stop",
      session_id: "sess-3",
      agent_id: "sub-1"
    });

    expect(received.length).toBe(2);
    expect(received[0]?.type).toBe("session-end");
    expect(received[0]?.kind).toBe("main");
    expect(received[1]?.type).toBe("subagent-end");
    expect(received[1]?.kind).toBe("subagent");
    expect(received[1]?.agentId).toBe("sub-1");
  });

  it("drops payloads missing session_id", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e: AgentEvent) => received.push(e));
    const port = await server.start();

    await post(port, "/event", { hook_event_name: "PreToolUse", tool_name: "Read" });

    expect(received.length).toBe(0);
  });

  it("returns 404 for non-POST or wrong path", async () => {
    server = new HookServer();
    const port = await server.start();

    const status = await request(port, "/other", "GET");
    expect(status).toBe(404);
  });

  it("returns 400 for malformed JSON body", async () => {
    server = new HookServer();
    const port = await server.start();

    const status = await postRaw(port, "/event", "{not json");
    expect(status).toBe(400);
  });
});

function post(port: number, path: string, body: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "content-type": "application/json" }
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve());
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

function postRaw(port: number, path: string, raw: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "content-type": "application/json" }
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(res.statusCode ?? 0));
      }
    );
    req.on("error", reject);
    req.end(raw);
  });
}

function request(port: number, path: string, method: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method }, (res) => {
      res.on("data", () => {});
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end();
  });
}
