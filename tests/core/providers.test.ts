import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiRuntime } from "../../packages/core/src/runtime.js";
for (const protocol of ["openai-completions", "anthropic-messages"])
  test(
    protocol +
      " SDK protocol roundtrip with local SSE fixture (not a real model)",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "jojo-protocol-"));
      let request: any;
      const server = createServer(async (req, res) => {
        let body = "";
        for await (const b of req) body += b.toString();
        request = {
          path: req.url,
          body: JSON.parse(body),
          auth: req.headers.authorization || req.headers["x-api-key"],
        };
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        const send = (e: any) =>
          res.write(
            (protocol === "anthropic-messages"
              ? "event: " + e.type + "\n"
              : "") +
              "data: " +
              JSON.stringify(e) +
              "\n\n",
          );
        if (protocol === "openai-completions") {
          send({
            id: "fixture",
            object: "chat.completion.chunk",
            created: 1,
            model: "fixture-model",
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                  content: "# 协议fixture\n局限：合成响应。",
                },
                finish_reason: null,
              },
            ],
          });
          send({
            id: "fixture",
            object: "chat.completion.chunk",
            created: 1,
            model: "fixture-model",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
              total_tokens: 30,
            },
          });
          res.write("data: [DONE]\n\n");
        } else {
          send({
            type: "message_start",
            message: {
              id: "fixture",
              type: "message",
              role: "assistant",
              content: [],
              model: "fixture-model",
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 20, output_tokens: 0 },
            },
          });
          send({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          });
          send({
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "text_delta",
              text: "# 协议fixture\n局限：合成响应。",
            },
          });
          send({ type: "content_block_stop", index: 0 });
          send({
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: 10 },
          });
          send({ type: "message_stop" });
        }
        res.end();
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      try {
        const port = (server.address() as any).port;
        const runtime = new PiRuntime(root);
        const result = await runtime.run(
          "合成协议输入",
          {
            id: "unit",
            name: "local fixture",
            protocol,
            base_url: `http://127.0.0.1:${port}${protocol === "openai-completions" ? "/v1" : ""}`,
            model_id: "fixture-model",
          },
          "synthetic-unit-key",
          new AbortController().signal,
          () => {},
        );
        assert.match(result.text, /协议fixture/);
        assert.equal(result.inputTokens, 20);
        assert.equal(result.outputTokens, 10);
        assert.ok(request.auth.includes("synthetic-unit-key"));
        assert.ok(request.body.messages);
        assert.equal(request.body.tools?.length || 0, 0);
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
