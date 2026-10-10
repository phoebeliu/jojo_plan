import { Store, uid } from "../packages/core/src/store.js";
import { Service } from "../packages/core/src/service.js";
import { PiRuntime } from "../packages/core/src/runtime.js";
import { parseFiles } from "../packages/core/src/delivery.js";
import { environment, testFiles } from "../packages/core/src/container.js";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
const root = resolve(process.env.JOJO_MVP_DIR || "output/acceptance/mvp");
mkdirSync(root, { recursive: true });
const store = new Store(root, resolve("packages/storage/migrations"));
const service = new Service(
  store,
  new PiRuntime(
    root,
    process.env.JOJO_CODEX_PATH ||
      "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
  ),
);
const oldProof = process.env.JOJO_MVP_RESUME
  ? JSON.parse(readFileSync(resolve(root, "mvp-proof.json"), "utf8"))
  : null;
const proof: any = oldProof || {
  date: new Date().toISOString(),
  synthetic: true,
  automatedReviews: true,
  checks: [],
  stages: [],
};
async function call(
  method: string,
  payload: any,
  projectId: string | null = null,
  expectedRevision: number | null = null,
) {
  const r = await service.command({
    schemaVersion: 2,
    requestId: uid(),
    projectId,
    expectedRevision:
      expectedRevision ??
      (method === "baseline.decide"
        ? store.work(payload.workId).revision
        : null),
    method,
    payload,
  });
  if (!r.ok) throw Error(JSON.stringify(r.error));
  return r.result;
}
function check(name: string, condition: boolean) {
  proof.checks = proof.checks.filter((c: any) => c.name !== name);
  proof.checks.push({ name, pass: condition });
  console.log((condition ? "PASS " : "FAIL ") + name);
  if (!condition) throw Error(name);
}
async function settle(id: string) {
  const deadline = Date.now() + 360000;
  while (service.active.has(id) && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 300));
  if (service.active.has(id)) throw Error("timeout");
  return store.detail(id);
}
try {
  proof.environment = await environment();
  check("Docker daemon available", proof.environment.dockerReady);
  const project = oldProof
    ? store.one(
        "SELECT id FROM project WHERE id=?",
        store.work(oldProof.workId).project_id,
      )
    : await call("project.create", {
        name: "MVP 合成验收 · 非客户数据",
      });
  const provider = oldProof
    ? store.one("SELECT id FROM provider_config ORDER BY rowid LIMIT 1")
    : await call("provider.save", {
        name: "本机模型 · MVP真实验收",
        protocol: "codex-local",
        baseUrl: "",
        modelId: "",
      });
  const work = oldProof
    ? store.work(oldProof.workId)
    : await call(
        "work.create",
        {
          name: "合成待办 API",
          kind: "system",
          goal: "实现小型无外部依赖 Node.js 待办 API。GET /health 返回200，POST /todos 接收title并返回201，空title返回400，GET /todos列出创建的待办。可以内存保存、不做账号。提供简单HTML页面。所有阶段文档尽量简洁（各约300字，但架构和测试用例必须可开发）；只用合成数据。源码测试至少健康检查、创建及空title反例。README写清启动与局限，不声称生产验收。",
          criteria: [
            "健康检查200",
            "创建201并能查询",
            "空title400",
            "包含页面、真实Node测试与启动说明",
          ],
        },
        project.id,
      );
  proof.workId = work.id;
  if (!oldProof)
    await call(
      "material.import",
      {
        workId: work.id,
        name: "合成接口约定.md",
        origin: "合成验收固定材料，不是联网来源",
        text: "# 接口约定\n目标用户：个人工程师。API使用JSON。无真实客户数据。错误响应包含error字符串。MVP内存存储，重启丢失，必须在交付局限里说明。",
      },
      project.id,
    );
  const material = store
    .detail(work.id)
    .artifacts.find((a: any) => a.kind === "source_material");
  check("material provenance retained", !!material?.metadata.origin);
  for (let i = 0; i < 10 && store.work(work.id).state !== "delivered"; i++) {
    const stage = store.nextStage(work.id);
    console.log("START " + stage.id);
    await call(
      "work.start",
      {
        workId: work.id,
        providerId: provider.id,
        allowSend: true,
        allowContainer: true,
        tokenLimit: 1000000,
      },
      project.id,
      store.work(work.id).revision,
    );
    const d = await settle(work.id);
    const evidence = d.artifacts
      .filter((a: any) => a.kind === "test_evidence")
      .at(-1)!;
    const output = d.artifacts
      .filter((a: any) => a.kind === "document")
      .at(-1)!;
    proof.stages.push({
      stage: stage.id,
      outputId: output.id,
      evidenceId: evidence.id,
      passed: evidence.metadata.passed,
      checks: JSON.parse(evidence.text).checks,
      container: JSON.parse(evidence.text).container,
    });
    if (!evidence.metadata.passed) {
      console.log("REWORK " + stage.id + ": " + evidence.text.slice(0, 1500));
      if (stage.id !== "implementation") throw Error("stage check failed");
      continue;
    }
    check(
      stage.id + " actual output and structure",
      !output.metadata.isSimulation && output.text.length > 150,
    );
    await call(
      "baseline.decide",
      {
        workId: work.id,
        fingerprint: d.fingerprint,
        verdict: "approve",
        reason: "合成自动验收测试的阶段批准，不代表客户/人工验收",
      },
      project.id,
    );
    if (stage.id !== "final-review")
      check(
        stage.id + " approval does not deliver whole system",
        store.work(work.id).state !== "delivered",
      );
  }
  check(
    "all seven stages reach reviewed delivery",
    store.work(work.id).state === "delivered" &&
      new Set(
        proof.stages.filter((s: any) => s.passed).map((s: any) => s.stage),
      ).size === 7,
  );
  const exported = await call("data.export", { workId: work.id }, project.id);
  writeFileSync(
    resolve(root, "system-handoff.zip"),
    Buffer.from(exported.bytes),
  );
  const zip = unzipSync(Uint8Array.from(exported.bytes));
  check(
    "handoff contains runnable source files",
    !!zip["system/server.mjs"] && !!zip["system/package.json"],
  );
  const latestCode = store
    .detail(work.id)
    .artifacts.filter(
      (a: any) =>
        a.metadata.stage === "implementation" && a.kind === "document",
    )
    .at(-1)!;
  const rerun = await testFiles(
    root,
    parseFiles(latestCode.text),
    new AbortController().signal,
    () => {},
  );
  check("exported source passes independent container rerun", rerun.passed);
  proof.rerun = rerun;
  const failingFiles = parseFiles(latestCode.text).filter(
    (f) => !f.path.endsWith(".test.mjs"),
  );
  failingFiles.push({
    path: "test/fail.test.mjs",
    content:
      'import {test} from "node:test"; import assert from "node:assert/strict"; test("intentional failing fixture",()=>assert.equal(1,2)); test("positive fixture",()=>assert.equal(1,1));',
  });
  const negative = await testFiles(
    root,
    failingFiles,
    new AbortController().signal,
    () => {},
  );
  check(
    "real failing test is rejected",
    !negative.passed && negative.code !== 0,
  );
  proof.negative = negative;
  const skill = await call(
    "work.create",
    {
      name: "API需求澄清 Skill",
      kind: "skill",
      goal: "写一个 api-requirement-check 技能，根据模糊API需求整理输入、接口、验收和边界。含正反例。不搜索、不声称实测。",
      criteria: ["标准frontmatter", "输入步骤输出正反例和局限"],
    },
    project.id,
  );
  await call(
    "work.start",
    {
      workId: skill.id,
      providerId: provider.id,
      allowSend: true,
      tokenLimit: 200000,
    },
    project.id,
    skill.revision,
  );
  const sd = await settle(skill.id);
  check(
    "real Skill contract passes",
    sd.baselines.some((b: any) => b.valid && b.fingerprint === sd.fingerprint),
  );
  await call(
    "baseline.decide",
    {
      workId: skill.id,
      fingerprint: sd.fingerprint,
      verdict: "approve",
      reason: "合成自动验收",
    },
    project.id,
  );
  const sz = unzipSync(
    Uint8Array.from(
      (await call("data.export", { workId: skill.id }, project.id)).bytes,
    ),
  );
  check(
    "standard SKILL.md directory exported",
    Object.keys(sz).some(
      (p) =>
        /^skills\/api-requirement-check\/SKILL.md$/.test(p) &&
        strFromU8(sz[p]).includes("description:"),
    ),
  );
  proof.skillWorkId = skill.id;
  const before = store.detail(work.id).fingerprint;
  await call(
    "material.import",
    {
      workId: work.id,
      name: "新增要求.txt",
      origin: "合成变更",
      text: "新增持久化需求，必须重新确认产品范围。",
    },
    project.id,
  );
  check(
    "new material invalidates prior delivery",
    store.work(work.id).state === "blocked" &&
      store.detail(work.id).fingerprint !== before,
  );
} finally {
  writeFileSync(
    resolve(root, "mvp-proof.json"),
    JSON.stringify(proof, null, 2),
  );
  service.stop();
  store.close();
}
