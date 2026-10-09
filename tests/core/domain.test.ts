import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Store, uid, now } from "../../packages/core/src/store.js";
import { Service } from "../../packages/core/src/service.js";
import type { Runtime } from "../../packages/core/src/runtime.js";
const unused: Runtime = {
  run: async () => {
    throw Error("not used");
  },
};
function setup() {
  const root = mkdtempSync(join(tmpdir(), "jojo-test-")),
    store = new Store(root, resolve("packages/storage/migrations")),
    service = new Service(store, unused);
  return {
    root,
    store,
    service,
    close() {
      store.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
function req(
  method: string,
  payload: any,
  projectId: string | null = null,
  expectedRevision: number | null = null,
) {
  return {
    schemaVersion: 2,
    requestId: uid(),
    method,
    payload,
    projectId,
    expectedRevision,
  };
}
async function call(
  s: Service,
  method: string,
  payload: any,
  pid: string | null = null,
  rev: number | null = null,
) {
  const r = await s.command(req(method, payload, pid, rev));
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.result;
}
async function work(s: Service) {
  const p = await call(s, "project.create", { name: "合成项目" });
  const w = await call(
    s,
    "work.create",
    {
      name: "测试文档",
      kind: "document",
      goal: "说明术语和局限",
      criteria: ["包含术语说明", "包含局限"],
    },
    p.id,
  );
  return { p, w };
}
test("fresh migration and restart retain projects and immutable versions", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    assert.equal(
      t.store.all("SELECT name FROM sqlite_master WHERE type='table'").length >=
        52,
      true,
    );
    const c = t.store.contract(w.id);
    assert.throws(() =>
      t.store.run("UPDATE artifact_version SET mime=? WHERE id=?", "x", c.id),
    );
    t.store.close();
    const again = new Store(t.root, resolve("packages/storage/migrations"));
    assert.equal(again.work(w.id).goal, "说明术语和局限");
    assert.equal(again.all("SELECT * FROM schema_migration").length, 3);
    again.close();
  } finally {
    rmSync(t.root, { recursive: true, force: true });
  }
});
test("idempotent response commits with operation; changed replay rejected", async () => {
  const t = setup();
  try {
    const r = req("project.create", { name: "一次" });
    const a = await t.service.command(r),
      b = await t.service.command(r);
    assert.deepEqual(a, b);
    assert.equal(t.store.all("SELECT id FROM project").length, 1);
    const c = await t.service.command({ ...r, payload: { name: "不同" } });
    assert.equal(c.error?.code, "IDEMPOTENCY_CONFLICT");
  } finally {
    t.close();
  }
});
test("unknown payload and agent approval are rejected", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    assert.equal(
      (
        await t.service.command(
          req("project.create", { name: "x", script: "fetch(secret)" }),
        )
      ).error?.code,
      "VALIDATION",
    );
    assert.equal(
      (
        await t.service.command(
          req(
            "baseline.decide",
            { workId: w.id, fingerprint: "x", verdict: "approve", reason: "x" },
            p.id,
            1,
          ),
          "agent",
        )
      ).error?.code,
      "PERMISSION_REQUIRED",
    );
  } finally {
    t.close();
  }
});
test("project memory isolation, candidate gate and method validation gate", async () => {
  const t = setup();
  try {
    const a = await work(t.service),
      b = await work(t.service);
    const msg = t.store.detail(a.w.id).messages[0].id;
    const m = await call(
      t.service,
      "memory.propose",
      {
        kind: "project_rule",
        scope: "project",
        workId: null,
        statement: "合成审计容差规则",
        sourceRefs: [{ type: "message", id: msg }],
        sensitivity: "internal",
        expiresAt: null,
      },
      a.p.id,
    );
    assert.equal(t.store.context(a.w.id).length, 0);
    await call(t.service, "memory.confirm", { memoryId: m.id }, a.p.id, 1);
    assert.equal(t.store.context(a.w.id).length, 1);
    assert.equal(t.store.context(b.w.id).length, 0);
    const stale = await t.service.command(
      req("memory.disable", { memoryId: m.id, disabled: true }, a.p.id, 1),
    );
    assert.equal(stale.error?.code, "REVISION_CONFLICT");
    const denied = await t.service.command(
      req("memory.list", { workId: a.w.id }, b.p.id),
    );
    assert.equal(denied.error?.code, "SCOPE_DENIED");
    const meth = await call(
      t.service,
      "memory.propose",
      {
        kind: "method",
        scope: "project",
        workId: null,
        statement: "方法候选",
        sourceRefs: [{ type: "message", id: msg }],
        sensitivity: "internal",
        expiresAt: null,
      },
      a.p.id,
    );
    await call(t.service, "memory.confirm", { memoryId: meth.id }, a.p.id, 1);
    assert.equal(t.store.context(a.w.id).length, 1);
    const fake = t.store.artifact(a.w.id, "test_evidence", "模型自报", "通过", {
      passed: true,
      purpose: "method-regression",
      isSimulation: false,
      caseCount: 3,
    });
    assert.equal(
      (
        await t.service.command(
          req(
            "memory.validateMethod",
            { memoryId: meth.id, evidenceVersionId: fake },
            a.p.id,
            2,
          ),
        )
      ).error?.code,
      "METHOD_UNVALIDATED",
    );
  } finally {
    t.close();
  }
});
test("correction returns candidate; forgetting purges every body and leaves tombstone", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    const source = { type: "message", id: t.store.detail(w.id).messages[0].id };
    const m = await call(
      t.service,
      "memory.propose",
      {
        kind: "preference",
        scope: "personal",
        workId: null,
        statement: "先审阅",
        sourceRefs: [source],
        sensitivity: "internal",
        expiresAt: null,
      },
      p.id,
    );
    await call(t.service, "memory.confirm", { memoryId: m.id }, p.id, 1);
    await call(
      t.service,
      "memory.correct",
      { memoryId: m.id, statement: "先核查", sourceRefs: [source] },
      p.id,
      2,
    );
    assert.equal(t.store.context(w.id).length, 0);
    await call(t.service, "memory.forget", { memoryId: m.id }, p.id, 3);
    assert.equal(
      t.store
        .all("SELECT * FROM memory_revision WHERE memory_id=?", m.id)
        .every((r) => r.statement === "" && r.source_refs_json === "[]"),
      true,
    );
    assert.ok(
      t.store.one("SELECT * FROM memory_tombstone WHERE memory_id=?", m.id),
    );
    assert.equal(t.store.memories(w.id).length, 0);
  } finally {
    t.close();
  }
});
test("view pin survives change without freezing fingerprint; stale/script proposal rejected", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    await call(
      t.service,
      "viewIntent.pin",
      { workId: w.id, componentId: "sources" },
      p.id,
      1,
    );
    const old = t.store.fingerprint(w.id),
      pre = await call(
        t.service,
        "change.preview",
        { workId: w.id, goal: "新的范围", criteria: ["明确新范围"] },
        p.id,
      );
    await call(
      t.service,
      "change.apply",
      {
        workId: w.id,
        goal: "新的范围",
        criteria: ["明确新范围"],
        previewFingerprint: pre.previewFingerprint,
      },
      p.id,
      1,
    );
    assert.notEqual(t.store.view(w.id).targetFingerprint, old);
    assert.equal(t.store.view(w.id).component, "sources");
    const stale = await t.service.command(
      req(
        "viewIntent.propose",
        {
          workId: w.id,
          targetFingerprint: old,
          componentId: "sources",
          reasonRefs: [],
          memoryRevisionRefs: [],
          priority: 50,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
        p.id,
      ),
    );
    assert.equal(stale.error?.code, "STALE_VIEW");
    const schema = await t.service.command(
      req(
        "viewIntent.propose",
        {
          workId: w.id,
          targetFingerprint: t.store.fingerprint(w.id),
          componentId: "script",
          reasonRefs: [],
          memoryRevisionRefs: [],
          priority: 50,
          expiresAt: now(),
          html: "<script/>",
        },
        p.id,
      ),
    );
    assert.equal(schema.error?.code, "VALIDATION");
    assert.equal(
      (
        await t.service.command(
          req(
            "baseline.decide",
            {
              workId: w.id,
              fingerprint: old,
              verdict: "approve",
              reason: "旧审批",
            },
            p.id,
            2,
          ),
        )
      ).error?.code,
      "STALE_BASELINE",
    );
  } finally {
    t.close();
  }
});
test("preview fingerprint conflicts and budget cannot be bypassed by memory", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    const provider = await call(t.service, "provider.save", {
      name: "本机",
      protocol: "codex-local",
      baseUrl: "",
      modelId: "",
    });
    const r = await t.service.command(
      req(
        "work.start",
        {
          workId: w.id,
          providerId: provider.id,
          allowSend: true,
          tokenLimit: 2000,
        },
        p.id,
        1,
      ),
    );
    assert.equal(r.error?.code, "BUDGET_EXCEEDED");
    const pre = await call(
      t.service,
      "change.preview",
      { workId: w.id, goal: "a", criteria: ["b"] },
      p.id,
    );
    assert.equal(
      (
        await t.service.command(
          req(
            "change.apply",
            {
              workId: w.id,
              goal: "不同",
              criteria: ["b"],
              previewFingerprint: pre.previewFingerprint,
            },
            p.id,
            1,
          ),
        )
      ).error?.code,
      "STALE_BASELINE",
    );
  } finally {
    t.close();
  }
});
test("restore old backup does not resurrect forgotten memory or cached plaintext", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    const source = { type: "message", id: t.store.detail(w.id).messages[0].id };
    const m = await call(
      t.service,
      "memory.propose",
      {
        kind: "preference",
        scope: "personal",
        workId: null,
        statement: "不能复活的准则正文",
        sourceRefs: [source],
        sensitivity: "internal",
        expiresAt: null,
      },
      p.id,
    );
    await call(t.service, "memory.confirm", { memoryId: m.id }, p.id, 1);
    await call(t.service, "memory.list", { workId: w.id }, p.id);
    const backup = await call(t.service, "data.backup", {});
    await call(t.service, "memory.forget", { memoryId: m.id }, p.id, 2);
    assert.equal(
      t.store.all(
        "SELECT response_json FROM request_dedup WHERE method='memory.list'",
      ).length,
      0,
    );
    const r = await call(t.service, "data.restore", { backupId: backup.id });
    assert.equal(r.forgottenProtected, 1);
    assert.equal(t.store.context(w.id).length, 0);
    assert.equal(
      t.store
        .all("SELECT * FROM memory_revision WHERE memory_id=?", m.id)
        .every((v) => v.statement === ""),
      true,
    );
  } finally {
    t.close();
  }
});
test("expired memories and global suspension are excluded from new context", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    const source = { type: "message", id: t.store.detail(w.id).messages[0].id };
    for (const expiresAt of [null, "2000-01-01T00:00:00Z"]) {
      const m = await call(
        t.service,
        "memory.propose",
        {
          kind: "preference",
          scope: "personal",
          workId: null,
          statement: "审阅优先",
          sourceRefs: [source],
          sensitivity: "internal",
          expiresAt,
        },
        p.id,
      );
      await call(t.service, "memory.confirm", { memoryId: m.id }, p.id, 1);
    }
    assert.equal(t.store.context(w.id).length, 1);
    await call(t.service, "memory.configureGlobal", { enabled: false });
    assert.equal(t.store.context(w.id).length, 0);
    await call(t.service, "memory.configureGlobal", { enabled: true });
    assert.equal(t.store.context(w.id).length, 1);
  } finally {
    t.close();
  }
});
test("interrupted run recovers without replay and conservatively reconciles budget", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    t.store.run("UPDATE work_item SET state='active' WHERE id=?", w.id);
    t.store.run(
      "INSERT INTO budget_account(work_id,token_limit,reserved_tokens) VALUES(?,?,?)",
      w.id,
      200000,
      12000,
    );
    t.store.recover();
    assert.equal(t.store.work(w.id).state, "paused");
    assert.equal(
      t.store.one(
        "SELECT unknown_usage FROM budget_account WHERE work_id=?",
        w.id,
      ).unknown_usage,
      1,
    );
    await call(
      t.service,
      "budget.reconcile",
      {
        workId: w.id,
        acceptConservativeCharge: true,
        reason: "接受未知调用完整预留额度计入已用",
      },
      p.id,
      1,
    );
    const b = t.store.one("SELECT * FROM budget_account WHERE work_id=?", w.id);
    assert.equal(b.reserved_tokens, 0);
    assert.equal(b.used_tokens, 12000);
    assert.equal(b.unknown_usage, 0);
  } finally {
    t.close();
  }
});
test("same requirements with a new output version cannot reuse old review fingerprint", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    const input = t.store.inputFingerprint(w.id);
    const first = t.store.artifact(w.id, "document", "first", "# one", {
      inputFingerprint: input,
    });
    t.store.artifact(w.id, "test_evidence", "check", "{}", {
      purpose: "document-structure",
      targetVersionId: first,
    });
    const old = t.store.fingerprint(w.id);
    const second = t.store.artifact(w.id, "document", "second", "# two", {
      inputFingerprint: input,
    });
    t.store.artifact(w.id, "test_evidence", "check", "{}", {
      purpose: "document-structure",
      targetVersionId: second,
    });
    assert.equal(t.store.inputFingerprint(w.id), input);
    assert.notEqual(t.store.fingerprint(w.id), old);
    assert.equal(
      (
        await t.service.command(
          req(
            "baseline.decide",
            {
              workId: w.id,
              fingerprint: old,
              verdict: "approve",
              reason: "旧成果审批",
            },
            p.id,
            1,
          ),
        )
      ).error?.code,
      "STALE_BASELINE",
    );
  } finally {
    t.close();
  }
});
test("corrupt content cannot be read as trustworthy evidence and exact backup bytes can repair it", async () => {
  const t = setup();
  try {
    const { w } = await work(t.service);
    const contract = t.store.contract(w.id);
    const fs = await import("node:fs");
    fs.writeFileSync(join(t.store.objects, contract.object_hash), "truncated");
    assert.throws(() => t.store.readVersion(contract.id), /损坏/);
    t.store.object(contract.text);
    assert.equal(t.store.readVersion(contract.id).text, contract.text);
  } finally {
    t.close();
  }
});
test("agent authorization precedes cached responses and is bound to work scope", async () => {
  const t = setup();
  try {
    const a = await work(t.service),
      b = await work(t.service);
    const source = {
      type: "message",
      id: t.store.detail(a.w.id).messages[0].id,
    };
    const m = await call(
      t.service,
      "memory.propose",
      {
        kind: "preference",
        scope: "personal",
        workId: null,
        statement: "范围准则",
        sourceRefs: [source],
        sensitivity: "internal",
        expiresAt: null,
      },
      a.p.id,
    );
    const confirmation = req("memory.confirm", { memoryId: m.id }, a.p.id, 1);
    assert.equal((await t.service.command(confirmation)).ok, true);
    assert.equal(
      (await t.service.command(confirmation, "agent")).error?.code,
      "PERMISSION_REQUIRED",
    );
    const ctx = { kind: "agent" as const, projectId: a.p.id, workId: a.w.id };
    assert.equal(
      (
        await t.service.command(
          req("context.preview", { workId: b.w.id }, b.p.id),
          ctx,
        )
      ).error?.code,
      "SCOPE_DENIED",
    );
    const candidate = req(
      "memory.propose",
      {
        kind: "preference",
        scope: "personal",
        workId: null,
        statement: "自己的候选",
        sourceRefs: [source],
        sensitivity: "internal",
        expiresAt: null,
      },
      a.p.id,
    );
    assert.equal((await t.service.command(candidate, ctx)).ok, true);
  } finally {
    t.close();
  }
});
test("cached context query cannot bypass later global suspension", async () => {
  const t = setup();
  try {
    const { p, w } = await work(t.service);
    const source = { type: "message", id: t.store.detail(w.id).messages[0].id };
    const m = await call(
      t.service,
      "memory.propose",
      {
        kind: "preference",
        scope: "personal",
        workId: null,
        statement: "准则",
        sourceRefs: [source],
        sensitivity: "internal",
        expiresAt: null,
      },
      p.id,
    );
    await call(t.service, "memory.confirm", { memoryId: m.id }, p.id, 1);
    const query = req("context.preview", { workId: w.id }, p.id);
    assert.equal((await t.service.command(query)).result.items.length, 1);
    await call(t.service, "memory.configureGlobal", { enabled: false });
    assert.equal((await t.service.command(query)).result.items.length, 0);
  } finally {
    t.close();
  }
});
