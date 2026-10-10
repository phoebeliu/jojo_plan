import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Store, uid } from "../../packages/core/src/store.js";
import { Service } from "../../packages/core/src/service.js";
import { parseFiles, skillCheck } from "../../packages/core/src/delivery.js";
import { unzipSync, strFromU8 } from "fflate";
import { publicAddress, sourceText } from "../../packages/core/src/sources.js";
test("source reader rejects reserved addresses and strips active page elements", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.1.2",
    "192.168.1.2",
    "169.254.169.254",
    "100.64.0.1",
    "::1",
    "224.0.0.1",
    "0.0.0.0",
  ])
    assert.equal(publicAddress(address), false);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(
    sourceText(
      "<script>secret()</script><style>x</style><p>Hello &amp; world</p>",
      "text/html",
    ),
    "Hello & world",
  );
});
const body =
  "# 合成单元测试\n目标与依据\n" +
  "这是确定性fixture而非真实模型验收。".repeat(15) +
  "\n## 假设与局限\n需人工检查。";
function setup() {
  const root = mkdtempSync(join(tmpdir(), "jojo-mvp-test-"));
  const store = new Store(root, resolve("packages/storage/migrations"));
  const prompts: string[] = [];
  const service = new Service(store, {
    run: async (prompt) => {
      prompts.push(prompt);
      return { text: body, inputTokens: 100, outputTokens: 200 };
    },
  });
  return {
    store,
    service,
    prompts,
    close() {
      service.stop();
      store.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
function request(
  method: string,
  payload: any,
  projectId: string | null = null,
  expectedRevision: number | null = null,
) {
  return {
    schemaVersion: 2,
    requestId: uid(),
    projectId,
    expectedRevision,
    method,
    payload,
  };
}
async function call(
  t: ReturnType<typeof setup>,
  method: string,
  payload: any,
  pid: string | null = null,
  rev: number | null = null,
) {
  const r = await t.service.command(request(method, payload, pid, rev));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.result;
}
async function create(t: ReturnType<typeof setup>, kind = "document") {
  const p = await call(t, "project.create", { name: "合成unit" });
  const w = await call(
    t,
    "work.create",
    { name: "工作", kind, goal: "目标", criteria: ["依据"] },
    p.id,
  );
  const provider = await call(t, "provider.save", {
    name: "unit fixture",
    protocol: "codex-local",
    baseUrl: "",
    modelId: "",
  });
  return { p, w, provider };
}
async function run(t: ReturnType<typeof setup>, w: any, p: any, provider: any) {
  await call(
    t,
    "work.start",
    {
      workId: w.id,
      providerId: provider.id,
      allowSend: true,
      tokenLimit: 200000,
    },
    p.id,
    t.store.work(w.id).revision,
  );
  while (t.service.active.has(w.id)) await new Promise((r) => setTimeout(r, 5));
  return t.store.detail(w.id);
}
test("material is scoped, hash-verified and bound to prompt and approval fingerprint", async () => {
  const t = setup();
  try {
    const { p, w, provider } = await create(t);
    const d = await run(t, w, p, provider);
    const before = d.fingerprint;
    const material = await call(
      t,
      "material.import",
      {
        workId: w.id,
        name: "source.md",
        text: "# 原始记录\nabc123",
        origin: "https://example.com/source",
      },
      p.id,
    );
    assert.notEqual(t.store.fingerprint(w.id), before);
    assert.equal(
      t.store.readVersion(material.versionId).metadata.origin,
      "https://example.com/source",
    );
    const stale = await t.service.command(
      request(
        "baseline.decide",
        {
          workId: w.id,
          fingerprint: before,
          verdict: "approve",
          reason: "old",
        },
        p.id,
        t.store.work(w.id).revision,
      ),
    );
    assert.equal(stale.error?.code, "STALE_BASELINE");
    await run(t, w, p, provider);
    assert.match(t.prompts.at(-1)!, /abc123/);
    assert.match(t.prompts.at(-1)!, new RegExp(material.versionId));
    const other = await call(t, "project.create", { name: "other" });
    const denied = await t.service.command(
      request(
        "material.import",
        { workId: w.id, name: "x", text: "x", origin: "x" },
        other.id,
      ),
    );
    assert.equal(denied.error?.code, "SCOPE_DENIED");
  } finally {
    t.close();
  }
});
test("system phase approval advances one stage, binds preceding artifacts, never delivers early", async () => {
  const t = setup();
  try {
    const { p, w, provider } = await create(t, "system");
    for (const expected of [
      "research",
      "product",
      "design",
      "architecture",
      "test-design",
    ]) {
      assert.equal(t.store.nextStage(w.id).id, expected);
      const d = await run(t, w, p, provider);
      await call(
        t,
        "baseline.decide",
        {
          workId: w.id,
          fingerprint: d.fingerprint,
          verdict: "approve",
          reason: "unit fixture",
        },
        p.id,
        d.work.revision,
      );
      assert.notEqual(t.store.work(w.id).state, "delivered");
      const repeated = await t.service.command(
        request(
          "baseline.decide",
          {
            workId: w.id,
            fingerprint: d.fingerprint,
            verdict: "approve",
            reason: "twice",
          },
          p.id,
          d.work.revision,
        ),
      );
      assert.equal(repeated.error?.code, "REVISION_CONFLICT");
    }
    assert.equal(t.store.nextStage(w.id).id, "implementation");
    const denied = await t.service.command(
      request(
        "work.start",
        {
          workId: w.id,
          providerId: provider.id,
          allowSend: true,
          tokenLimit: 200000,
        },
        p.id,
        t.store.work(w.id).revision,
      ),
    );
    assert.equal(denied.error?.code, "PERMISSION_REQUIRED");
    assert.match(t.prompts.at(-1)!, /已批准的前序成果/);
    await call(
      t,
      "system.rework",
      { workId: w.id, stage: "architecture", reason: "unit:接口需要重设计" },
      p.id,
      t.store.work(w.id).revision,
    );
    assert.equal(t.store.nextStage(w.id).id, "architecture");
    const skipped = await t.service.command(
      request(
        "system.rework",
        { workId: w.id, stage: "final-review", reason: "skip" },
        p.id,
        t.store.work(w.id).revision,
      ),
    );
    assert.equal(skipped.error?.code, "REVISION_CONFLICT");

    await call(
      t,
      "material.import",
      { workId: w.id, name: "new", text: "changed", origin: "unit" },
      p.id,
    );
    assert.equal(t.store.nextStage(w.id).id, "research");
  } finally {
    t.close();
  }
});
test("supplement invalidates delivered result but memory source does not change task inputs", async () => {
  const t = setup();
  try {
    const { p, w, provider } = await create(t);
    const d = await run(t, w, p, provider);
    await call(
      t,
      "baseline.decide",
      {
        workId: w.id,
        fingerprint: d.fingerprint,
        verdict: "approve",
        reason: "unit",
      },
      p.id,
      d.work.revision,
    );
    const fp = t.store.inputFingerprint(w.id);
    await call(
      t,
      "conversation.send",
      { workId: w.id, text: "偏好", purpose: "memory-source" },
      p.id,
    );
    assert.equal(t.store.inputFingerprint(w.id), fp);
    await call(
      t,
      "conversation.send",
      { workId: w.id, text: "补充新的事实" },
      p.id,
    );
    assert.notEqual(t.store.inputFingerprint(w.id), fp);
    assert.equal(t.store.work(w.id).state, "blocked");
  } finally {
    t.close();
  }
});
test("source bundle forbids traversal, hidden files, dependencies and duplicate paths", () => {
  const files = [
    {
      path: "package.json",
      content: JSON.stringify({
        type: "module",
        scripts: { start: "node server.mjs" },
      }),
    },
    { path: "server.mjs", content: "export {}" },
    { path: "test/api.test.mjs", content: "test" },
  ];
  const encode = (f: any[]) =>
    "```json\n" + JSON.stringify({ files: f }) + "\n```";
  assert.equal(parseFiles(encode(files)).length, 3);
  for (const path of [
    "../secret.js",
    "/tmp/evil.js",
    ".env.json",
    "src/.private.js",
    "node_modules/tool.js",
    "server.mjs",
  ])
    assert.throws(() =>
      parseFiles(encode([...files, { path, content: "evil" }])),
    );
  assert.throws(() =>
    parseFiles(
      encode([
        {
          ...files[0],
          content: JSON.stringify({
            type: "module",
            scripts: { start: "node server.mjs" },
            dependencies: { evil: "*" },
          }),
        },
        ...files.slice(1),
      ]),
    ),
  );
  assert.throws(() => parseFiles(encode(files) + encode(files)));
});
test("Skill exports standard package and can be explicitly reused only after approval in own project", async () => {
  const t = setup();
  try {
    const { p, w, provider } = await create(t, "skill");
    const text =
      "---\nname: unit-skill\ndescription: 用于单元测试技能结构\n---\n# Skill\n## 输入\n内容\n## 步骤\n步骤\n## 输出\n结果\n## 正反例\n例\n## 假设与局限\n" +
      "合成fixture。".repeat(30);
    assert.equal(skillCheck(text), true);
    t.service.runtime = {
      run: async () => ({ text, inputTokens: 1, outputTokens: 1 }),
    };
    const d = await run(t, w, p, provider);
    const version = d.artifacts.find((a: any) => a.kind === "skill")!;
    const target = await call(
      t,
      "work.create",
      {
        name: "另一个工作",
        kind: "document",
        goal: "reuse",
        criteria: ["test"],
      },
      p.id,
    );
    const denied = await t.service.command(
      request(
        "skill.attach",
        { workId: target.id, versionId: version.id },
        p.id,
      ),
    );
    assert.equal(denied.error?.code, "STALE_BASELINE");
    await call(
      t,
      "baseline.decide",
      {
        workId: w.id,
        fingerprint: d.fingerprint,
        verdict: "approve",
        reason: "unit",
      },
      p.id,
      d.work.revision,
    );
    const attached = await call(
      t,
      "skill.attach",
      { workId: target.id, versionId: version.id },
      p.id,
    );
    assert.equal(t.store.readVersion(attached.versionId).text, text);
    const zip = unzipSync(Uint8Array.from(t.store.export(w.id).bytes));
    assert.equal(strFromU8(zip["skills/unit-skill/SKILL.md"]), text);
  } finally {
    t.close();
  }
});

test("system handoff exports code rather than the newer test-evidence artifact", async () => {
  const t = setup();
  try {
    const { w } = await create(t, "system");
    const files = [
      {
        path: "package.json",
        content: JSON.stringify({
          type: "module",
          scripts: { start: "node server.mjs" },
        }),
      },
      { path: "server.mjs", content: "export {}" },
      { path: "test/api.test.mjs", content: "test" },
    ];
    const fp = t.store.inputFingerprint(w.id);
    t.store.artifact(
      w.id,
      "document",
      "源码",
      "```json\n" + JSON.stringify({ files }) + "\n```",
      { stage: "implementation", inputFingerprint: fp },
    );
    t.store.artifact(w.id, "test_evidence", "较新的测试依据", "{}", {
      stage: "implementation",
      inputFingerprint: fp,
    });
    const zip = unzipSync(Uint8Array.from(t.store.export(w.id).bytes));
    assert.equal(strFromU8(zip["system/server.mjs"]), "export {}");
    assert.equal(JSON.parse(strFromU8(zip["handoff.json"])).state, "draft");
  } finally {
    t.close();
  }
});
