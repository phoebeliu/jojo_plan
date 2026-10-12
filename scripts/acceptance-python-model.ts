import { PiRuntime } from "../packages/core/src/runtime.js";
import { instructions, parseFiles } from "../packages/core/src/delivery.js";
import { testFiles } from "../packages/core/src/container.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve("output/acceptance/python-model-v03");
mkdirSync(root, { recursive: true });
const runtime = new PiRuntime(
  root,
  "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
);
const result = await runtime.run(
  "合成用户PRD：Python标准库实现JSON API GET /health返回200；GET /status?contract=1&invoice=1&receipt=1返回complete，否则返回insufficient。不要宣称这是实际公司审计认证。用HTTPServer或纯函数+HTTP包装，测试至少正常完整材料、缺件、健康检查。README列出启动与边界。" +
    instructions("system", "implementation", "python"),
  {
    id: "test",
    name: "本机Codex",
    protocol: "codex-local",
    base_url: "",
    model_id: "",
  },
  undefined,
  new AbortController().signal,
  () => {},
);
const files = parseFiles(result.text);
if (!files.some((f) => f.path === "server.py"))
  throw Error("Python source missing");
const tests = await testFiles(
  root,
  files,
  new AbortController().signal,
  () => {},
);
writeFileSync(
  resolve(root, "python-model-proof.json"),
  JSON.stringify(
    {
      date: "2026-10-12",
      scope:
        "Real model generates Python from a synthetic user PRD; standalone generation and container test, not a replay of seven live roles",
      actualModel: !result.isSimulation,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      files: files.map((f) => f.path),
      tests,
    },
    null,
    2,
  ),
);
writeFileSync(resolve(root, "output.md"), result.text);
console.log(
  tests.passed
    ? "PASS real generated Python source passes isolated tests"
    : "FAIL Python tests",
  tests.log.slice(-1500),
);
if (!tests.passed) process.exitCode = 1;
