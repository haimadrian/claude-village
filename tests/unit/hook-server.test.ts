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

  it("emits parent pre-tool-use + synthetic subagent-start for PreToolUse of Task", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e: AgentEvent) => received.push(e));
    const port = await server.start();

    await post(port, "/event", {
      hook_event_name: "PreToolUse",
      session_id: "sess-hook-sub",
      tool_name: "Task",
      tool_use_id: "tuse_hook_1",
      tool_input: { subagent_type: "explorer", prompt: "look around" }
    });

    expect(received.length).toBe(2);
    const [parent, sub] = received;
    expect(parent?.type).toBe("pre-tool-use");
    expect(parent?.kind).toBe("main");
    expect(parent?.toolName).toBe("Task");
    expect(sub?.type).toBe("subagent-start");
    expect(sub?.kind).toBe("subagent");
    expect(sub?.agentId).toBe("sess-hook-sub:tuse_hook_1");
    expect(sub?.parentAgentId).toBe("sess-hook-sub");
  });

  it("emits parent post-tool-use + subagent-end with the same synthetic id", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e: AgentEvent) => received.push(e));
    const port = await server.start();

    await post(port, "/event", {
      hook_event_name: "PreToolUse",
      session_id: "sess-hook-pair",
      tool_name: "Task",
      tool_use_id: "tuse_pair_1",
      tool_input: { subagent_type: "explorer" }
    });
    await post(port, "/event", {
      hook_event_name: "PostToolUse",
      session_id: "sess-hook-pair",
      tool_name: "Task",
      tool_use_id: "tuse_pair_1",
      tool_result: "ok"
    });

    expect(received.length).toBe(4);
    const subStart = received[1]!;
    const parentPost = received[2]!;
    const subEnd = received[3]!;
    expect(subStart.type).toBe("subagent-start");
    expect(parentPost.type).toBe("post-tool-use");
    expect(parentPost.kind).toBe("main");
    expect(subEnd.type).toBe("subagent-end");
    // Synthetic id must be stable across the pre/post pair.
    expect(subEnd.agentId).toBe(subStart.agentId);
  });

  it("does not synthesise a subagent when the payload is already a subagent (has agent_id)", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e: AgentEvent) => received.push(e));
    const port = await server.start();

    await post(port, "/event", {
      hook_event_name: "PreToolUse",
      session_id: "sess-nested",
      agent_id: "sub-already",
      tool_name: "Task",
      tool_use_id: "tuse_nested",
      tool_input: {}
    });

    expect(received.length).toBe(1);
    expect(received[0]?.type).toBe("pre-tool-use");
    expect(received[0]?.kind).toBe("subagent");
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
