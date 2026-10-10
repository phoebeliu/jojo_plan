import { Store, uid } from "../packages/core/src/store.js";
import { Service } from "../packages/core/src/service.js";
import { PiRuntime } from "../packages/core/src/runtime.js";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
const root = resolve(
  process.env.JOJO_MVP_DIR || "output/acceptance/mvp-verified",
);
const previous = JSON.parse(
  readFileSync(resolve(root, "mvp-proof.json"), "utf8"),
);
const store = new Store(root, resolve("packages/storage/migrations"));
const service = new Service(
  store,
  new PiRuntime(
    root,
    "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
  ),
);
const proof: any = {
  date: new Date().toISOString(),
  synthetic: true,
  automatedReviews: true,
  checks: [],
};
function check(name: string, ok: boolean) {
  proof.checks.push({ name, pass: ok });
  console.log((ok ? "PASS " : "FAIL ") + name);
  if (!ok) throw Error(name);
}
async function call(
  method: string,
  payload: any,
  pid: string,
  rev: number | null = null,
) {
  const r = await service.command({
    schemaVersion: 2,
    requestId: uid(),
    projectId: pid,
    expectedRevision: rev,
    method,
    payload,
  });
  if (!r.ok) throw Error(JSON.stringify(r.error));
  return r.result;
}
try {
  const pid = store.work(previous.skillWorkId).project_id,
    provider = store.one(
      "SELECT id FROM provider_config ORDER BY rowid LIMIT 1",
    );
  const w = await call(
    "work.create",
    {
      name: "合成待办API · 实测报告",
      kind: "document",
      goal: "根据材料写一份待办API测试与交接报告。明确这些是合成系统的真实容器测试，不是真实客户验收。准确记录TAP测试数量、通过/失败数，解释已验证的健康检查/创建/空标题异常；指出未验证负载、持久化、生产环境。引述原始材料版本 [材料:版本ID]，不能编造Qwen评测或生产结果。使用选用Skill澄清接口与验收边界。",
      criteria: [
        "准确记录材料中的测试结果",
        "明确合成、真实执行与未验证范围",
        "保留材料版本引用",
        "包含交接与局限",
      ],
    },
    pid,
  );
  proof.workId = w.id;
  const material = await call(
    "material.import",
    {
      workId: w.id,
      name: "真实容器TAP记录 · 合成系统",
      origin: "本项目容器复测 · " + previous.workId,
      text:
        "# 合成待办系统真实容器测试\n以下日志来自已执行的Docker隔离测试，不是客户生产验收。\n" +
        previous.rerun.log,
    },
    pid,
  );
  const skill = store
    .detail(previous.skillWorkId)
    .artifacts.find((a: any) => a.kind === "skill")!;
  await call("skill.attach", { workId: w.id, versionId: skill.id }, pid);
  await call(
    "work.start",
    {
      workId: w.id,
      providerId: provider.id,
      allowSend: true,
      tokenLimit: 200000,
    },
    pid,
    store.work(w.id).revision,
  );
  const deadline = Date.now() + 300000;
  while (service.active.has(w.id) && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 300));
  if (service.active.has(w.id)) throw Error("timeout");
  const d = store.detail(w.id),
    output = d.artifacts.filter((a: any) => a.kind === "document").at(-1)!;
  check(
    "real document generation with material and explicitly attached Skill",
    !!output &&
      !output.metadata.isSimulation &&
      d.baselines.some((b: any) => b.valid && b.fingerprint === d.fingerprint),
  );
  check(
    "document cites exact source version",
    output.text.includes(material.versionId),
  );
  check(
    "report states synthetic execution and production limitations",
    /合成/.test(output.text) &&
      /生产/.test(output.text) &&
      /未验证|未覆盖|不代表|不能/.test(output.text),
  );
  await call(
    "baseline.decide",
    {
      workId: w.id,
      fingerprint: d.fingerprint,
      verdict: "approve",
      reason: "合成自动文档验收，不代表客户验收",
    },
    pid,
    d.work.revision,
  );
  const exported = await call("data.export", { workId: w.id }, pid);
  const zip = unzipSync(Uint8Array.from(exported.bytes));
  check(
    "approved document.md exports exact reviewed version",
    strFromU8(zip["document.md"]) === output.text &&
      exported.manifest.state === "delivered",
  );
  proof.sourceVersion = material.versionId;
  proof.outputVersion = output.id;
  proof.skillVersion = skill.id;
} finally {
  writeFileSync(
    resolve(root, "document-proof.json"),
    JSON.stringify(proof, null, 2),
  );
  service.stop();
  store.close();
}
