import { Store, uid } from "../packages/core/src/store.js";
import { Service } from "../packages/core/src/service.js";
import { PiRuntime } from "../packages/core/src/runtime.js";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
const root = resolve("output/acceptance/live"),
  proof = JSON.parse(readFileSync(resolve(root, "acceptance.json"), "utf8")),
  s = new Store(root, resolve("packages/storage/migrations")),
  service = new Service(
    s,
    new PiRuntime(
      root,
      "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
    ),
  );
const w = s.work(proof.workId),
  provider = s.one(
    "SELECT * FROM provider_config WHERE protocol='codex-local' ORDER BY created_at DESC LIMIT 1",
  ),
  report: any = {
    date: new Date().toISOString(),
    scope:
      "Two synthetic method cases with real model, no production/business claim",
    checks: [],
  };
async function call(
  method: string,
  payload: any,
  revision: number | null = null,
) {
  const r = await service.command({
    schemaVersion: 2,
    requestId: uid(),
    projectId: w.project_id,
    method,
    expectedRevision: revision,
    payload,
  });
  if (!r.ok) throw Error(JSON.stringify(r.error));
  return r.result;
}
try {
  const statement =
    "合成测试方法：如果样例输入写明缺少记录，正文必须包含“判定：证据不足”，不得包含“判定：证据齐全”；如果写明已提供记录，正文必须包含“判定：证据齐全”。不要宣称真实客户资料已审计。";
  const source = await call("conversation.send", {
    workId: w.id,
    text: statement,
    purpose: "memory-source",
  });
  const m = await call("memory.propose", {
    kind: "method",
    scope: "project",
    workId: null,
    statement,
    sourceRefs: [{ type: "message", id: source.id }],
    sensitivity: "internal",
    expiresAt: null,
    appliesTo: ["document"],
  });
  await call("memory.confirm", { memoryId: m.id }, 1);
  report.checks.push({
    name: "接受方法候选不等于已启用",
    pass: !s.context(w.id).some((e) => e.id === m.id),
  });
  const run = await call(
    "memory.runRegression",
    {
      workId: w.id,
      memoryId: m.id,
      providerId: provider.id,
      allowSend: true,
      cases: [
        {
          kind: "positive",
          input: "合成样例：已提供记录。仅按方法给出判定。",
          expectedContains: ["判定：证据齐全"],
          mustNotContain: [],
        },
        {
          kind: "negative",
          input: "合成样例：缺少记录。仅按方法给出判定。",
          expectedContains: ["判定：证据不足"],
          mustNotContain: ["判定：证据齐全"],
        },
      ],
    },
    2,
  );
  const deadline = Date.now() + 300000;
  while (service.active.has(w.id) && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 300));
  if (service.active.has(w.id)) throw Error("method timeout");
  const event = s.all(
    "SELECT payload_json FROM domain_event WHERE work_id=? AND type='method.regression.finished' ORDER BY seq DESC LIMIT 1",
    w.id,
  )[0];
  if (!event) throw Error("method runner failed");
  const result = JSON.parse(event.payload_json);
  report.checks.push({
    name: "真实正反例形成版本绑定依据",
    pass: result.passed,
  });
  if (!result.passed) throw Error("方法未通过，不启用");
  await call(
    "memory.validateMethod",
    { memoryId: m.id, evidenceVersionId: result.evidenceVersionId },
    2,
  );
  report.checks.push({
    name: "可信回归通过后才允许进入上下文",
    pass: s.context(w.id).some((e) => e.id === m.id),
  });
  report.status = report.checks.every((c: any) => c.pass) ? "passed" : "failed";
  if (report.status !== "passed") process.exitCode = 1;
} catch (e: any) {
  report.status = "failed";
  report.error = e.message;
  process.exitCode = 1;
} finally {
  service.stop();
  s.close();
  writeFileSync(
    resolve(root, "method-acceptance.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
}
