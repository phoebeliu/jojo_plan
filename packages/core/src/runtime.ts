import { Agent } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Model,
} from "@mariozechner/pi-ai";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
export interface RuntimeResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  isSimulation?: boolean;
}
export interface Runtime {
  run(
    prompt: string,
    provider: any,
    key: string | undefined,
    signal: AbortSignal,
    onEvent: (e: any) => void,
  ): Promise<RuntimeResult>;
}
export class PiRuntime implements Runtime {
  constructor(
    private root: string,
    private codexPath?: string,
  ) {}
  async run(
    prompt: string,
    p: any,
    key: string | undefined,
    signal: AbortSignal,
    onEvent: (e: any) => void,
  ) {
    const model: Model<any> = {
      id: p.model_id || "configured-default",
      name: p.name,
      api:
        p.protocol === "anthropic-messages"
          ? "anthropic-messages"
          : "openai-completions",
      provider: "jojo-configured",
      baseUrl: p.base_url || "",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 64000,
      maxTokens: 8192,
    };
    let usage: {
      inputTokens: number | null;
      outputTokens: number | null;
      isSimulation?: boolean;
    } = { inputTokens: null, outputTokens: null };
    const agent = new Agent({
      initialState: {
        model,
        systemPrompt:
          "你是Jojo的交付写作Agent。仅根据明确提供的要求与材料写作。不要读取文件、调用工具、编造来源或实测结果。输出Markdown正文；涵盖用户要求的章节，明确假设与局限。",
        tools: [],
      },
      getApiKey: () => key,
      ...(p.protocol === "codex-local"
        ? {
            streamFn: (_m: any, context: any, options: any) => {
              const stream = createAssistantMessageEventStream();
              let text = "";
              const result: AssistantMessage = {
                role: "assistant",
                content: [],
                api: model.api,
                provider: model.provider,
                model: model.id,
                usage: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 0,
                  cost: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    total: 0,
                  },
                },
                stopReason: "stop",
                timestamp: Date.now(),
              };
              const dir = join(this.root, "runtime");
              mkdirSync(dir, { recursive: true, mode: 0o700 });
              if (!this.codexPath) {
                result.stopReason = "error";
                result.errorMessage = "本机Codex不可用";
                stream.push({ type: "error", reason: "error", error: result });
                stream.end(result);
                return stream;
              }
              const child = spawn(
                this.codexPath,
                [
                  "exec",
                  "--ignore-user-config",
                  "--ephemeral",
                  "--skip-git-repo-check",
                  "--sandbox",
                  "read-only",
                  "--disable",
                  "shell_tool",
                  "--disable",
                  "unified_exec",
                  "--disable",
                  "apps",
                  "--disable",
                  "browser_use",
                  "--disable",
                  "computer_use",
                  "--disable",
                  "memories",
                  "-c",
                  'web_search="disabled"',
                  "--json",
                  ...(p.model_id ? ["--model", p.model_id] : []),
                  "-",
                ],
                {
                  cwd: dir,
                  stdio: ["pipe", "pipe", "pipe"],
                  env: { ...process.env },
                },
              );
              onEvent({ type: "process.started", pid: child.pid });
              let buffer = "",
                failure = false,
                bytes = 0;
              const abort = () => {
                child.kill("SIGTERM");
                const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
                timer.unref();
              };
              signal.addEventListener("abort", abort, { once: true });
              if (signal.aborted) abort();
              const timeout = setTimeout(abort, 240000);
              child.stdout.on("data", (d: Buffer) => {
                bytes += d.length;
                if (bytes > 8 * 1024 * 1024) {
                  failure = true;
                  abort();
                  return;
                }
                buffer += d.toString();
                let n;
                while ((n = buffer.indexOf("\n")) >= 0) {
                  const line = buffer.slice(0, n);
                  buffer = buffer.slice(n + 1);
                  try {
                    const e = JSON.parse(line);
                    onEvent({ type: e.type, itemType: e.item?.type });
                    if (
                      e.type === "item.completed" &&
                      e.item?.type === "agent_message"
                    )
                      text = e.item.text;
                    if (e.type === "turn.completed" && e.usage) {
                      usage = {
                        inputTokens: e.usage.input_tokens ?? null,
                        outputTokens: e.usage.output_tokens ?? null,
                      };
                      result.usage.input = usage.inputTokens || 0;
                      result.usage.output = usage.outputTokens || 0;
                      result.usage.totalTokens =
                        result.usage.input + result.usage.output;
                    }
                    if (e.type === "turn.failed") failure = true;
                  } catch {}
                }
              });
              child.stderr.on("data", () => {});
              const finish = (code: number | null) => {
                clearTimeout(timeout);
                signal.removeEventListener("abort", abort);
                if (code !== 0 || failure || !text || signal.aborted) {
                  result.stopReason = signal.aborted ? "aborted" : "error";
                  result.errorMessage = signal.aborted
                    ? "任务已停止"
                    : "模型调用未完成，请检查本机登录与服务";
                  stream.push({
                    type: "error",
                    reason: result.stopReason,
                    error: result,
                  });
                } else {
                  result.content = [{ type: "text", text }];
                  stream.push({
                    type: "done",
                    reason: "stop",
                    message: result,
                  });
                }
                stream.end(result);
              };
              child.once("error", () => {
                failure = true;
                finish(-1);
              });
              child.once("close", finish);
              const contextText = (context.messages || [])
                .map((m: any) =>
                  typeof m.content === "string"
                    ? m.content
                    : (m.content || [])
                        .map((c: any) => c.text || "")
                        .join("\n"),
                )
                .join("\n");
              child.stdin.end(
                (context.systemPrompt || "") + "\n" + contextText,
              );
              return stream;
            },
          }
        : {}),
      beforeToolCall: async () => ({
        block: true,
        reason: "首阶段不允许模型执行宿主工具",
        terminate: true,
      }),
    });
    const abort = () => agent.abort();
    signal.addEventListener("abort", abort, { once: true });
    let turns = 0;
    agent.subscribe((e) => {
      if (e.type === "turn_start" && ++turns > 1) agent.abort();
      onEvent({ type: e.type });
    });
    try {
      await agent.prompt(prompt);
      const last = agent.state.messages
        .filter((m: any) => m.role === "assistant")
        .at(-1) as AssistantMessage | undefined;
      if (
        !last ||
        last.stopReason === "error" ||
        last.stopReason === "aborted" ||
        signal.aborted
      )
        throw Error("PROVIDER_FAILED");
      if (p.protocol !== "codex-local")
        usage = {
          inputTokens: last.usage?.input ?? null,
          outputTokens: last.usage?.output ?? null,
        };
      return {
        isSimulation: false,
        text: last.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n"),
        ...usage,
      };
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }
}
