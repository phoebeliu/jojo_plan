import { Store, uid } from "../packages/core/src/store.js";
import { Service } from "../packages/core/src/service.js";
import { PiRuntime } from "../packages/core/src/runtime.js";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
const root = resolve(
  process.env.JOJO_ACCEPTANCE_DIR || "output/acceptance/live",
);
mkdirSync(root, { recursive: true });
const codex =
  process.env.JOJO_CODEX_PATH ||
  "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";
let store = new Store(root, resolve("packages/storage/migrations"));
let service = new Service(store, new PiRuntime(root, codex));
const evidence: any = {
  date: new Date().toISOString(),
  runtime:
    "Pi Agent Core + logged-in local Codex, tool-less read-only ephemeral",
  checks: [],
};
async function call(
  method: string,
  payload: any,
  pid: string | null = null,
  rev: number | null = null,
) {
  const r = await service.command({
    schemaVersion: 2,
    requestId: uid(),
    projectId: pid,
    method,
    expectedRevision: rev,
    payload,
  });
  if (!r.ok) throw Error(JSON.stringify(r.error));
  return r.result;
}
async function settle(workId: string) {
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    if (!service.active.has(workId)) {
      const d = store.detail(workId);
      if (d.work.state === "blocked")
        throw Error("真实模型工作阻断，请检查后台诊断");
      return d;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("验收超时");
}
function check(name: string, ok: boolean) {
  evidence.checks.push({ name, pass: ok });
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) throw Error(name);
}
try {
  const p = await call("project.create", { name: "第一阶段合成验收" });
  const w = await call(
    "work.create",
    {
      name: "CI/CD 入门说明",
      kind: "document",
      goal: "写一篇约400字的中文CI/CD入门说明。包括持续集成、持续交付、部署区别，给一个明确标记为合成的流水线例子。使用Markdown一级标题，包含目标、正文、假设与局限章节。不要调用工具或搜索，不编造实测。",
      criteria: ["解释持续集成与持续交付的区别", "有合成例子和假设与局限"],
    },
    p.id,
  );
  const provider = await call("provider.save", {
    name: "本机Codex真实验收",
    protocol: "codex-local",
    baseUrl: "",
    modelId: "",
  });
  await call(
    "work.start",
    {
      workId: w.id,
      providerId: provider.id,
      allowSend: true,
      tokenLimit: 200000,
    },
    p.id,
    w.revision,
  );
  let d = await settle(w.id);
  check(
    "真实模型产出与可定位结构依据",
    d.artifacts.some(
      (a: any) => a.kind === "document" && a.metadata.isSimulation === false,
    ) && d.baselines.some((b: any) => b.valid),
  );
  const doc = d.artifacts.filter((a: any) => a.kind === "document").at(-1);
  check(
    "合成任务预设语义与格式约定",
    /持续集成|CI/.test(doc.text) &&
      /持续交付|CD/.test(doc.text) &&
      /合成/.test(doc.text) &&
      /假设|局限/.test(doc.text),
  );
  writeFileSync(resolve(root, "first-document.md"), doc.text);
  await call(
    "baseline.decide",
    {
      workId: w.id,
      fingerprint: d.fingerprint,
      verdict: "approve",
      reason: "合成验收脚本核对标题、术语、合成例子与局限；不代表客户项目验收",
    },
    p.id,
    d.work.revision,
  );
  check("用户入口版本绑定审阅", store.work(w.id).state === "delivered");
  const old = d.fingerprint;
  service.stop();
  store.close();
  store = new Store(root, resolve("packages/storage/migrations"));
  service = new Service(store, new PiRuntime(root, codex));
  d = store.detail(w.id);
  check(
    "退出重开后要求、成果、审批均恢复",
    d.work.state === "delivered" &&
      d.artifacts.some((a: any) => a.id === doc.id),
  );
  const goal =
    d.work.goal + "\n新增要求：增加一个回滚说明小节，解释失败后如何回退。";
  const criteria = [
    "解释持续集成与持续交付的区别",
    "有合成例子和假设与局限",
    "包含回滚说明",
  ];
  const pre = await call(
    "change.preview",
    { workId: w.id, goal, criteria },
    p.id,
  );
  await call(
    "change.apply",
    {
      workId: w.id,
      goal,
      criteria,
      previewFingerprint: pre.previewFingerprint,
    },
    p.id,
    d.work.revision,
  );
  d = store.detail(w.id);
  check(
    "变更原子失效旧检查和审批效力",
    d.work.state === "blocked" &&
      d.baselines.every((b: any) => !b.valid) &&
      d.fingerprint !== old,
  );
  const stale = await service.command({
    schemaVersion: 2,
    requestId: uid(),
    projectId: p.id,
    method: "baseline.decide",
    expectedRevision: d.work.revision,
    payload: {
      workId: w.id,
      fingerprint: old,
      verdict: "approve",
      reason: "故意检查旧审批拒绝",
    },
  });
  check("旧审批请求被拒绝", stale.error?.code === "STALE_BASELINE");
  await call(
    "work.start",
    {
      workId: w.id,
      providerId: provider.id,
      allowSend: true,
      tokenLimit: 200000,
    },
    p.id,
    d.work.revision,
  );
  d = await settle(w.id);
  const revised = d.artifacts.filter((a: any) => a.kind === "document").at(-1);
  check(
    "按新要求真实重验，保留旧版本",
    /回滚/.test(revised.text) &&
      d.artifacts.some((a: any) => a.id === doc.id) &&
      d.baselines.some((b: any) => b.valid && b.fingerprint === d.fingerprint),
  );
  await call(
    "baseline.decide",
    {
      workId: w.id,
      fingerprint: d.fingerprint,
      verdict: "approve",
      reason: "合成脚本核对新增回滚说明与既有标准",
    },
    p.id,
    d.work.revision,
  );
  const pack = await call("data.export", { workId: w.id }, p.id);
  writeFileSync(resolve(root, "handoff.zip"), Buffer.from(pack.bytes));
  check(
    "可导出版本、校验和与交接清单",
    pack.manifest.files.length >= 5 && pack.manifest.state === "delivered",
  );
  evidence.workId = w.id;
  evidence.fingerprint = d.fingerprint;
  evidence.modelConfiguration = "existing CLI default; not silently overridden";
  evidence.actualUsage = store.all(
    "SELECT input_tokens,output_tokens,state FROM usage_entry WHERE work_id=?",
    w.id,
  );
  evidence.status = "passed";
} catch (e: any) {
  evidence.status = "failed";
  evidence.error = e.message;
  process.exitCode = 1;
} finally {
  service.stop();
  store.close();
  writeFileSync(
    resolve(root, "acceptance.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({
      status: evidence.status,
      checks: evidence.checks.length,
      error: evidence.error,
    }),
  );
}
