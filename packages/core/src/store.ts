import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  openSync,
  fsyncSync,
  closeSync,
  renameSync,
} from "node:fs";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { stages, parseFiles, skillCheck } from "./delivery.js";
export const uid = () => randomUUID(),
  now = () => new Date().toISOString();
export const digest = (v: unknown) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const fail = (code: string, message: string): never => {
  throw new DomainError(code, message);
};
export class Store {
  db: DatabaseSync;
  objects: string;
  constructor(
    public root: string,
    migrations: string,
  ) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    this.objects = join(root, "objects");
    mkdirSync(this.objects, { recursive: true });
    this.db = new DatabaseSync(join(root, "jojo.sqlite"));
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    for (const [i, file] of [
      "001-core.sql",
      "002-personal-ui.sql",
      "003-context-purpose.sql",
    ].entries()) {
      const present = this.one(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migration'",
      );
      if (
        present &&
        this.one("SELECT version FROM schema_migration WHERE version=?", i + 1)
      )
        continue;
      this.tx(() => {
        this.db.exec(
          readFileSync(join(migrations, file), "utf8").replace(
            /^PRAGMA.*;$/gm,
            "",
          ),
        );
        this.run("INSERT INTO schema_migration VALUES(?,?)", i + 1, now());
      });
    }
    this.recover();
  }
  one(sql: string, ...args: any[]): any {
    return this.db.prepare(sql).get(...args);
  }
  all(sql: string, ...args: any[]): any[] {
    return this.db.prepare(sql).all(...args);
  }
  run(sql: string, ...args: any[]) {
    return this.db.prepare(sql).run(...args);
  }
  tx<T>(f: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const r = f();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
  event(
    type: string,
    projectId: string | null,
    workId: string | null,
    payload: unknown,
  ) {
    this.run(
      "INSERT INTO domain_event(project_id,work_id,type,payload_json,created_at) VALUES(?,?,?,?,?)",
      projectId,
      workId,
      type,
      JSON.stringify(payload),
      now(),
    );
  }
  work(id: string, projectId?: string | null) {
    const w = this.one("SELECT * FROM work_item WHERE id=?", id);
    if (!w) fail("NOT_FOUND", "工作不存在");
    if (projectId && w.project_id !== projectId)
      fail("SCOPE_DENIED", "工作不属于本项目");
    return w;
  }
  revision(row: any, expected: number | null) {
    if (expected === null || row.revision !== expected)
      fail("REVISION_CONFLICT", "内容已改变，请刷新后重试");
  }
  recover(inTransaction = false) {
    const recover = () => {
      this.run(
        "UPDATE run_attempt SET state='uncertain',ended_at=?,error_code='PROCESS_INTERRUPTED' WHERE state='running'",
        now(),
      );
      this.run("UPDATE task SET state='paused' WHERE state='running'");
      this.run(
        "UPDATE tool_operation SET state='uncertain' WHERE state IN ('intent','running')",
      );
      this.run(
        "UPDATE execution_process SET state='uncertain' WHERE state IN ('starting','running')",
      );
      this.run(
        "UPDATE workflow_run SET state='paused' WHERE state IN ('running','reconciling','pausing')",
      );
      this.run("UPDATE work_item SET state='paused' WHERE state='active'");
      this.run(
        "UPDATE budget_account SET unknown_usage=1 WHERE reserved_tokens>0",
      );
      for (const w of this.all(
        "SELECT id FROM work_item WHERE state='delivered'",
      )) {
        const approved = this.one(
          "SELECT b.id FROM baseline b JOIN stage_run s ON s.id=b.stage_id JOIN workflow_run r ON r.id=s.run_id WHERE r.work_id=? AND b.valid=1 AND b.status='approved' AND b.fingerprint=?",
          w.id,
          this.fingerprint(w.id),
        );
        if (!approved)
          this.run("UPDATE work_item SET state='blocked' WHERE id=?", w.id);
      }
    };
    if (inTransaction) recover();
    else this.tx(recover);
  }
  object(text: string) {
    const hash = digest(text),
      file = join(this.objects, hash);
    if (!existsSync(file) || digest(readFileSync(file, "utf8")) !== hash) {
      const temporary = file + ".tmp-" + uid();
      writeFileSync(temporary, text, { mode: 0o600 });
      const fd = openSync(temporary, "r");
      fsyncSync(fd);
      closeSync(fd);
      renameSync(temporary, file);
    }
    return hash;
  }
  artifact(
    workId: string,
    kind: string,
    title: string,
    text: string,
    metadata: unknown,
    author = "system",
    artifactId?: string,
  ) {
    const w = this.work(workId);
    let a = artifactId;
    if (!a) {
      a = uid();
      this.run(
        "INSERT INTO artifact VALUES(?,?,?,?,?,?,?)",
        a,
        w.project_id,
        w.id,
        kind,
        title,
        "internal",
        now(),
      );
    }
    const parent = this.one(
      "SELECT * FROM artifact_version WHERE artifact_id=? ORDER BY version DESC LIMIT 1",
      a,
    );
    const id = uid(),
      hash = this.object(text);
    this.run(
      "INSERT INTO artifact_version VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      id,
      a,
      (parent?.version || 0) + 1,
      parent?.id || null,
      hash,
      "text/markdown",
      Buffer.byteLength(text),
      author,
      author === "agent" ? "coordinator" : "trusted-service",
      JSON.stringify(metadata),
      now(),
    );
    return id;
  }
  readVersion(id: string) {
    const v = this.one(
      "SELECT v.*,a.work_id,a.project_id,a.kind,a.title,a.sensitivity FROM artifact_version v JOIN artifact a ON a.id=v.artifact_id WHERE v.id=?",
      id,
    );
    if (!v) fail("NOT_FOUND", "版本不存在");
    return {
      ...v,
      text: this.verifiedBody(v.object_hash),
      metadata: JSON.parse(v.metadata_json),
    };
  }
  verifiedBody(hash: string) {
    const text = readFileSync(join(this.objects, hash), "utf8");
    if (digest(text) !== hash)
      fail("OBJECT_CORRUPT", "成果对象损坏，请恢复可信备份");
    return text;
  }
  contract(workId: string) {
    const v = this.one(
      "SELECT v.id FROM artifact_version v JOIN artifact a ON a.id=v.artifact_id WHERE a.work_id=? AND a.kind='prd' ORDER BY v.created_at DESC,v.version DESC LIMIT 1",
      workId,
    );
    return v ? this.readVersion(v.id) : null;
  }
  inputFingerprint(workId: string) {
    const w = this.work(workId),
      c = this.contract(workId);
    const sources = this.all(
      "SELECT v.id FROM artifact_version v JOIN artifact a ON a.id=v.artifact_id WHERE a.work_id=? AND a.kind='source_material' ORDER BY v.rowid",
      workId,
    ).map((v) => v.id);
    const supplements = this.all(
      "SELECT m.id FROM conversation_message m JOIN conversation c ON c.id=m.conversation_id WHERE c.work_id=? AND m.purpose='supplement' AND coalesce(json_extract(m.attachments_json,'$[0].kind'),'')<>'review-feedback' ORDER BY m.seq",
      workId,
    ).map((v) => v.id);
    return digest({
      workId,
      revision: w.revision,
      goal: w.goal,
      contract: c?.id,
      ...(sources.length || supplements.length ? { sources, supplements } : {}),
    });
  }

  fingerprint(workId: string) {
    const input = this.inputFingerprint(workId);
    const output = this.one(
      "SELECT v.id FROM artifact_version v JOIN artifact a ON a.id=v.artifact_id WHERE a.work_id=? AND a.kind IN ('document','skill') AND json_extract(v.metadata_json,'$.inputFingerprint')=? ORDER BY v.rowid DESC LIMIT 1",
      workId,
      input,
    );
    const evidence = output
      ? this.one(
          "SELECT v.id FROM artifact_version v JOIN artifact a ON a.id=v.artifact_id WHERE a.work_id=? AND a.kind='test_evidence' AND json_extract(v.metadata_json,'$.purpose')='document-structure' AND json_extract(v.metadata_json,'$.targetVersionId')=? ORDER BY v.rowid DESC LIMIT 1",
          workId,
          output.id,
        )
      : null;
    return digest({
      input,
      outputVersionId: output?.id || null,
      evidenceVersionId: evidence?.id || null,
    });
  }
  createProject(name: string) {
    const id = uid();
    this.run(
      "INSERT INTO project VALUES(?,?,?,?,?,?,?,?)",
      id,
      name,
      join(this.root, "projects", id),
      "active",
      "{}",
      1,
      now(),
      now(),
    );
    return this.one("SELECT * FROM project WHERE id=?", id);
  }
  createWork(projectId: string, p: any) {
    if (!this.one("SELECT id FROM project WHERE id=?", projectId))
      fail("NOT_FOUND", "项目不存在");
    const id = uid();
    this.run(
      "INSERT INTO work_item VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      id,
      projectId,
      p.name,
      p.kind,
      "1.0.0",
      p.goal,
      "checkpoint",
      "draft",
      1,
      now(),
      now(),
    );
    this.run("INSERT INTO conversation VALUES(?,?,?)", uid(), id, now());
    this.run("INSERT INTO work_preference(work_id) VALUES(?)", id);
    this.artifact(id, "prd", "交付约定", p.goal, {
      deliveryContract: {
        schemaVersion: "delivery-contract/1",
        criteria: p.criteria.map((statement: string, i: number) => ({
          id: "AC-" + (i + 1),
          statement,
          method: "both",
          expected: statement,
          required: true,
          evidenceVersionIds: [],
        })),
        exclusions: [],
        assumptions: [],
      },
    });
    this.message(id, "user", p.goal, null, "goal");
    return this.work(id);
  }
  message(
    workId: string,
    sender: string,
    text: string,
    attemptId: string | null = null,
    purpose = "supplement",
  ) {
    const c = this.one("SELECT id FROM conversation WHERE work_id=?", workId);
    const seq = this.one(
      "SELECT coalesce(max(seq),0)+1 as n FROM conversation_message WHERE conversation_id=?",
      c.id,
    ).n;
    const id = uid();
    this.run(
      "INSERT INTO conversation_message(id,conversation_id,seq,sender,attempt_id,text,attachments_json,state,created_at,purpose) VALUES(?,?,?,?,?,?,?,?,?,?)",
      id,
      c.id,
      seq,
      sender,
      attemptId,
      text,
      JSON.stringify(
        purpose === "review-feedback" ? [{ kind: "review-feedback" }] : [],
      ),
      sender === "user" ? "accepted" : "final",
      now(),
      sender === "agent"
        ? "output"
        : purpose === "review-feedback"
          ? "supplement"
          : purpose,
    );
    return id;
  }
  snapshot() {
    return {
      globalPersonalEnabled: JSON.parse(
        this.one(
          "SELECT value_json FROM app_setting WHERE key='personalEnabled'",
        )?.value_json || "true",
      ),
      backups: JSON.parse(
        this.one("SELECT value_json FROM app_setting WHERE key='backups'")
          ?.value_json || "[]",
      ),
      projects: this.all(
        "SELECT id,name,revision FROM project WHERE state<>?",
        "deleted",
      ),
      works: this.all("SELECT * FROM work_item ORDER BY updated_at DESC"),
      providers: this.all(
        "SELECT id,name,protocol,base_url,model_id,revision FROM provider_config",
      ),
      events: this.all(
        "SELECT seq,work_id,type,created_at FROM domain_event ORDER BY seq DESC LIMIT 30",
      ),
      details: this.all("SELECT id FROM work_item").map((w) =>
        this.detail(w.id),
      ),
    };
  }
  detail(workId: string) {
    const w = this.work(workId),
      fp = this.fingerprint(workId);
    return {
      work: w,
      fingerprint: fp,
      contract: this.contract(workId),
      stage: this.nextStage(workId),
      stages: stages[w.kind as keyof typeof stages],
      messages: this.all(
        "SELECT m.* FROM conversation_message m JOIN conversation c ON c.id=m.conversation_id WHERE c.work_id=? ORDER BY seq",
        workId,
      ),
      artifacts: this.all(
        "SELECT v.id FROM artifact_version v JOIN artifact a ON a.id=v.artifact_id WHERE a.work_id=? ORDER BY v.created_at",
        workId,
      ).map((v) => this.readVersion(v.id)),
      tasks: this.all(
        "SELECT t.* FROM task t JOIN stage_run s ON s.id=t.stage_id JOIN workflow_run r ON r.id=s.run_id WHERE r.work_id=?",
        workId,
      ),
      jobs: this.all(
        "SELECT * FROM tool_operation WHERE work_id=? ORDER BY created_at DESC",
        workId,
      ),
      baselines: this.all(
        "SELECT b.* FROM baseline b JOIN stage_run s ON s.id=b.stage_id JOIN workflow_run r ON r.id=s.run_id WHERE r.work_id=?",
        workId,
      ),
      processes: this.all(
        "SELECT e.* FROM execution_process e JOIN tool_operation o ON o.id=e.operation_id WHERE o.work_id=?",
        workId,
      ).map((e) => ({
        ...e,
        logs: this.all(
          "SELECT seq,text,stream FROM process_log_chunk WHERE process_id=? ORDER BY seq DESC LIMIT 30",
          e.id,
        ),
      })),
      view: this.view(workId),
      budget: this.one("SELECT * FROM budget_account WHERE work_id=?", workId),
    };
  }
  memories(workId: string | null) {
    const w = workId ? this.work(workId) : null;
    return this.all(
      "SELECT e.*,r.statement,r.source_refs_json FROM memory_entry e JOIN memory_revision r ON r.memory_id=e.id AND r.revision=e.revision WHERE e.status<>'forgotten'",
    ).filter(
      (e) =>
        e.scope === "personal" ||
        (w &&
          e.project_id === w.project_id &&
          (e.scope === "project" || e.work_id === w.id)),
    );
  }
  context(workId: string) {
    const global = JSON.parse(
      this.one("SELECT value_json FROM app_setting WHERE key='personalEnabled'")
        ?.value_json || "true",
    );
    const w = this.work(workId),
      enabled =
        global &&
        this.one(
          "SELECT personal_enabled FROM work_preference WHERE work_id=?",
          workId,
        )?.personal_enabled;
    return enabled
      ? this.memories(workId).filter(
          (e) =>
            e.status === "confirmed" &&
            (!e.expires_at || e.expires_at > now()) &&
            e.sensitivity !== "restricted" &&
            JSON.parse(e.applies_to_json).includes(w.kind) &&
            (e.kind !== "method" || e.method_validated === 1),
        )
      : [];
  }
  sourceScope(
    refs: any[],
    scope: string,
    projectId: string | null,
    workId: string | null,
  ) {
    for (const r of refs) {
      let row;
      if (r.type === "message")
        row = this.one(
          "SELECT w.project_id,w.id as work_id FROM conversation_message m JOIN conversation c ON c.id=m.conversation_id JOIN work_item w ON w.id=c.work_id WHERE m.id=?",
          r.id,
        );
      else if (r.type === "artifact")
        row = this.one(
          "SELECT a.project_id,a.work_id,a.sensitivity FROM artifact_version v JOIN artifact a ON a.id=v.artifact_id WHERE v.id=?",
          r.id,
        );
      else
        row = this.one(
          "SELECT w.project_id,w.id as work_id FROM decision d JOIN work_item w ON w.id=d.work_id WHERE d.id=?",
          r.id,
        );
      if (!row) fail("NOT_FOUND", "准则来源不存在");
      if (scope === "personal" && row.sensitivity === "restricted")
        fail("SCOPE_DENIED", "受限材料不能成为全局准则");
      if (
        (scope !== "personal" && row.project_id !== projectId) ||
        (scope === "work" && row.work_id !== workId)
      )
        fail("SCOPE_DENIED", "来源不在准则范围内");
    }
  }
  memoryRow(id: string, projectId: string | null) {
    const e = this.one("SELECT * FROM memory_entry WHERE id=?", id);
    if (!e) fail("NOT_FOUND", "准则不存在");
    if (e.scope !== "personal" && e.project_id !== projectId)
      fail("SCOPE_DENIED", "准则不属于本项目");
    if (e.status === "forgotten") fail("NOT_FOUND", "准则已遗忘");
    return e;
  }
  proposeMemory(p: any, projectId: string | null, actor: string) {
    if (
      p.scope === "personal" &&
      (p.kind === "project_rule" || p.sensitivity === "restricted")
    )
      fail("SCOPE_DENIED", "个人准则不能包含项目规则或受限资料");
    if (p.scope !== "personal" && !projectId)
      fail("SCOPE_DENIED", "项目作用域需要项目");
    if (p.scope === "work") this.work(p.workId, projectId);
    this.sourceScope(p.sourceRefs, p.scope, projectId, p.workId);
    const id = uid();
    this.run(
      "INSERT INTO memory_entry(id,kind,scope,project_id,work_id,status,revision,method_validated,expires_at,sensitivity,created_at,applies_to_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      p.kind,
      p.scope,
      p.scope === "personal" ? null : projectId,
      p.scope === "work" ? p.workId : null,
      "proposed",
      1,
      0,
      p.expiresAt,
      p.sensitivity,
      now(),
      JSON.stringify(p.appliesTo || ["skill", "document", "system"]),
    );
    this.run(
      "INSERT INTO memory_revision VALUES(?,?,?,?,?,?)",
      id,
      1,
      p.statement,
      JSON.stringify(p.sourceRefs),
      actor,
      now(),
    );
    return { id, revision: 1 };
  }
  mutateMemory(
    method: string,
    p: any,
    projectId: string | null,
    expected: number | null,
  ) {
    const e = this.memoryRow(p.memoryId, projectId);
    this.revision(e, expected);
    if (method === "memory.correct") {
      this.sourceScope(p.sourceRefs, e.scope, e.project_id, e.work_id);
      this.run(
        "UPDATE memory_entry SET revision=revision+1,status='proposed',method_validated=0 WHERE id=?",
        e.id,
      );
      this.run(
        "INSERT INTO memory_revision VALUES(?,?,?,?,?,?)",
        e.id,
        e.revision + 1,
        p.statement,
        JSON.stringify(p.sourceRefs),
        "user",
        now(),
      );
    } else if (method === "memory.forget") {
      this.run(
        "UPDATE memory_entry SET status='forgotten',revision=revision+1 WHERE id=?",
        e.id,
      );
      this.run(
        "UPDATE memory_revision SET statement='',source_refs_json='[]' WHERE memory_id=?",
        e.id,
      );
      this.run(
        "INSERT OR REPLACE INTO memory_tombstone VALUES(?,?)",
        e.id,
        now(),
      );
      this.run(
        "DELETE FROM request_dedup WHERE method IN ('memory.list','memory.export','context.preview')",
      );
    } else if (method === "memory.validateMethod") {
      const v = this.readVersion(p.evidenceVersionId);
      if (
        e.kind !== "method" ||
        v.kind !== "test_evidence" ||
        v.metadata.purpose !== "method-regression" ||
        v.metadata.isSimulation !== false ||
        v.metadata.memoryId !== e.id ||
        v.metadata.memoryRevision !== e.revision ||
        v.metadata.passed !== true ||
        v.metadata.caseCount < 2 ||
        !this.one(
          "SELECT id FROM tool_operation WHERE id=? AND state='succeeded' AND tool='method-regression'",
          v.metadata.operationId,
        )
      )
        fail("METHOD_UNVALIDATED", "需要本服务可信runner的当前方法回归依据");
      if (e.scope !== "personal" && v.project_id !== e.project_id)
        fail("SCOPE_DENIED", "验证不属于本项目");
      this.run("UPDATE memory_entry SET method_validated=1 WHERE id=?", e.id);
    } else
      this.run(
        "UPDATE memory_entry SET status=?,revision=revision+1 WHERE id=?",
        method === "memory.confirm"
          ? "confirmed"
          : p.disabled
            ? "disabled"
            : "proposed",
        e.id,
      );
    // Status-only revisions preserve immutable body under a new revision.
    if (
      method !== "memory.correct" &&
      method !== "memory.forget" &&
      method !== "memory.validateMethod"
    )
      this.run(
        "INSERT INTO memory_revision SELECT memory_id,?,statement,source_refs_json,?,? FROM memory_revision WHERE memory_id=? AND revision=?",
        e.revision + 1,
        "user",
        now(),
        e.id,
        e.revision,
      );
    return {
      id: e.id,
      revision: this.one("SELECT revision FROM memory_entry WHERE id=?", e.id)
        .revision,
    };
  }
  view(workId: string) {
    const w = this.work(workId),
      pref = this.one("SELECT * FROM work_preference WHERE work_id=?", workId);
    const stale = this.one(
      "SELECT b.id FROM baseline b JOIN stage_run s ON s.id=b.stage_id JOIN workflow_run r ON r.id=s.run_id WHERE r.work_id=? AND b.valid=0",
      workId,
    );
    const live = this.all(
      "SELECT * FROM view_intent WHERE work_id=? AND target_fingerprint=? AND expires_at>? ORDER BY priority DESC,created_at DESC",
      workId,
      this.fingerprint(workId),
      now(),
    ).find((v) =>
      JSON.parse(v.memory_refs_json).every((r: any) =>
        this.context(workId).some(
          (m) => m.id === r.id && m.revision === r.revision,
        ),
      ),
    );
    const suggested = live
      ? live.component
      : w.state === "delivered"
        ? "handoff"
        : stale && w.state === "blocked"
          ? "change"
          : w.state === "draft"
            ? "scope"
            : w.kind === "skill"
              ? "method"
              : w.kind === "document"
                ? "sources"
                : "evidence";
    return {
      origin: live ? "validated-proposal" : "rules",
      proposalId: live?.id || null,
      component: pref.pinned_component || suggested,
      suggested,
      pinned: !!pref.pinned_component,
      targetFingerprint: this.fingerprint(workId),
      personalEnabled:
        !!pref.personal_enabled &&
        JSON.parse(
          this.one(
            "SELECT value_json FROM app_setting WHERE key='personalEnabled'",
          )?.value_json || "true",
        ),
      reasons: [
        { type: "work", id: workId, revision: w.revision },
        { type: "status", value: w.state },
      ],
      memoryRevisionRefs: this.context(workId).map((e) => ({
        id: e.id,
        revision: e.revision,
      })),
      revision: pref.revision,
    };
  }
  preview(workId: string, goal: string, criteria: string[]) {
    const current = this.fingerprint(workId);
    return {
      previewFingerprint: digest({ current, goal, criteria }),
      currentFingerprint: current,
      affected: this.detail(workId)
        .artifacts.filter((v: any) => v.kind !== "prd")
        .map((v: any) => ({ id: v.id, title: v.title })),
      coverage: "所有该工作项的派生成果；跨工作关联未纳入第一阶段",
    };
  }
  change(p: any) {
    const w = this.work(p.workId);
    if (
      this.preview(w.id, p.goal, p.criteria).previewFingerprint !==
      p.previewFingerprint
    )
      fail("STALE_BASELINE", "预演已过期，请重新查看影响");
    const old = this.contract(w.id);
    this.artifact(
      w.id,
      "prd",
      "交付约定",
      p.goal,
      {
        deliveryContract: {
          schemaVersion: "delivery-contract/1",
          criteria: p.criteria.map((statement: string, i: number) => ({
            id: "AC-" + (i + 1),
            statement,
            method: "both",
            expected: statement,
            required: true,
            evidenceVersionIds: [],
          })),
          exclusions: [],
          assumptions: [],
        },
      },
      "user",
      old.artifact_id,
    );
    this.run(
      "UPDATE work_item SET goal=?,state='blocked',revision=revision+1,updated_at=? WHERE id=?",
      p.goal,
      now(),
      w.id,
    );
    this.run(
      "UPDATE baseline SET valid=0,revision=revision+1 WHERE stage_id IN (SELECT s.id FROM stage_run s JOIN workflow_run r ON r.id=s.run_id WHERE r.work_id=?)",
      w.id,
    );
    this.run(
      "UPDATE task SET state='stale',revision=revision+1 WHERE stage_id IN (SELECT s.id FROM stage_run s JOIN workflow_run r ON r.id=s.run_id WHERE r.work_id=?)",
      w.id,
    );
    this.event("work.changed", w.project_id, w.id, {
      oldFingerprint: p.previewFingerprint,
    });
    return this.work(w.id);
  }
  nextStage(workId: string) {
    const w = this.work(workId),
      plan = stages[w.kind as keyof typeof stages];
    if (w.kind !== "system") return plan[0];
    const approved = new Set(
      this.all(
        "SELECT v.metadata_json FROM baseline b JOIN baseline_member m ON m.baseline_id=b.id JOIN artifact_version v ON v.id=m.version_id JOIN artifact a ON a.id=v.artifact_id WHERE a.work_id=? AND b.status='approved' AND b.valid=1 AND m.purpose='output'",
        workId,
      )
        .map((v) => JSON.parse(v.metadata_json))
        .filter((m) => m.inputFingerprint === this.inputFingerprint(workId))
        .map((m) => m.stage),
    );
    return plan.find((stage) => !approved.has(stage.id)) || plan.at(-1)!;
  }
  importMaterial(
    workId: string,
    name: string,
    text: string,
    origin: string,
    selectedSkillVersionId: string | null = null,
  ) {
    const w = this.work(workId);
    if (w.state === "active")
      fail("REVISION_CONFLICT", "请暂停后再改变材料，避免运行混入新输入");
    const id = this.artifact(
      workId,
      "source_material",
      name,
      text,
      {
        origin,
        importedAt: now(),
        parser: "utf8-text/1",
        selectedSkillVersionId,
      },
      "user",
    );
    this.run(
      "UPDATE baseline SET valid=0 WHERE stage_id IN (SELECT s.id FROM stage_run s JOIN workflow_run r ON r.id=s.run_id WHERE r.work_id=?)",
      workId,
    );
    this.run(
      "UPDATE work_item SET revision=revision+1,state='blocked',updated_at=? WHERE id=?",
      now(),
      workId,
    );
    this.event("material.imported", w.project_id, workId, { versionId: id });
    return { versionId: id };
  }
  decide(p: any) {
    const w = this.work(p.workId);
    if (this.fingerprint(w.id) !== p.fingerprint)
      fail("STALE_BASELINE", "当前要求已改变，旧审批不能使用");
    const b = this.one(
      "SELECT b.* FROM baseline b JOIN stage_run s ON s.id=b.stage_id JOIN workflow_run r ON r.id=s.run_id WHERE r.work_id=? AND b.valid=1 AND b.fingerprint=? ORDER BY b.created_at DESC LIMIT 1",
      w.id,
      p.fingerprint,
    );
    if (!b || !b.sealed_at) fail("STALE_BASELINE", "当前版本尚未完成检查");
    if (b.status !== "draft")
      fail("REVISION_CONFLICT", "此版本已作出审阅决定，请生成新版本或修改要求");
    for (const member of this.all(
      "SELECT version_id FROM baseline_member WHERE baseline_id=?",
      b.id,
    ))
      this.readVersion(member.version_id);
    this.run(
      "INSERT INTO approval VALUES(?,?,?,?,?,?,?)",
      uid(),
      b.id,
      p.fingerprint,
      "user",
      p.verdict,
      p.reason,
      now(),
    );
    this.run(
      "UPDATE baseline SET status=? WHERE id=?",
      p.verdict === "approve" ? "approved" : "rejected",
      b.id,
    );
    const stageId = this.one(
      "SELECT stage_key FROM stage_run WHERE id=?",
      b.stage_id,
    ).stage_key;
    const final = w.kind !== "system" || stageId === "final-review";
    this.run(
      "UPDATE stage_run SET state=? WHERE id=?",
      p.verdict === "approve" ? "passed" : "rework",
      b.stage_id,
    );
    if (p.verdict === "request_changes")
      this.message(w.id, "user", p.reason, null, "review-feedback");
    this.run(
      "UPDATE work_item SET state=?,updated_at=? WHERE id=?",
      p.verdict === "approve" ? (final ? "delivered" : "paused") : "blocked",
      now(),
      w.id,
    );
    this.run(
      "UPDATE workflow_run SET state=? WHERE id=?",
      p.verdict === "approve"
        ? final
          ? "delivered"
          : "waiting_input"
        : "waiting_input",
      this.one("SELECT run_id FROM stage_run WHERE id=?", b.stage_id).run_id,
    );
    return this.work(w.id);
  }
  backup() {
    const tables = this.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
      .map((r) => r.name)
      .filter((n) => !["schema_migration", "request_dedup"].includes(n));
    const data: any = { schemaVersion: 3, tables: {}, objects: {} };
    for (const name of tables)
      data.tables[name] = this.all("SELECT * FROM " + name);
    for (const r of this.all(
      "SELECT DISTINCT object_hash FROM artifact_version",
    ))
      data.objects[r.object_hash] = readFileSync(
        join(this.objects, r.object_hash),
        "utf8",
      );
    const id = uid(),
      file = join(this.root, "backups", id + ".json");
    mkdirSync(join(this.root, "backups"), { recursive: true, mode: 0o700 });
    writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    const list = JSON.parse(
      this.one("SELECT value_json FROM app_setting WHERE key='backups'")
        ?.value_json || "[]",
    );
    const entry = {
      id,
      createdAt: now(),
      sha256: digest(JSON.stringify(data)),
    };
    list.push(entry);
    this.run(
      "INSERT INTO app_setting(key,value_json) VALUES('backups',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=revision+1",
      JSON.stringify(list),
    );
    return entry;
  }
  restore(backupId: string) {
    const list = JSON.parse(
      this.one("SELECT value_json FROM app_setting WHERE key='backups'")
        ?.value_json || "[]",
    );
    const record = list.find((r: any) => r.id === backupId);
    if (!record) fail("NOT_FOUND", "备份不存在");
    const text = readFileSync(
      join(this.root, "backups", backupId + ".json"),
      "utf8",
    );
    if (digest(text) !== record.sha256) fail("VALIDATION", "备份校验失败");
    const data = JSON.parse(text);
    if (data.schemaVersion !== 3) fail("VALIDATION", "备份版本不兼容");
    const tombstones = this.all("SELECT * FROM memory_tombstone");
    const tables = this.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
      .map((r) => r.name)
      .filter((n) => !["schema_migration", "request_dedup"].includes(n));
    if (tables.some((n) => !Array.isArray(data.tables[n])))
      fail("VALIDATION", "备份不完整");
    for (const [hash, body] of Object.entries(data.objects)) {
      if (typeof body !== "string" || digest(body) !== hash)
        fail("VALIDATION", "备份对象损坏");
      this.object(body as string);
    }
    this.db.exec("PRAGMA defer_foreign_keys=ON");
    this.run("UPDATE project SET state='deleted'");
    for (const n of [...tables].reverse()) this.run("DELETE FROM " + n);
    this.run("DELETE FROM request_dedup");
    const seals: any[] = [];
    for (const n of tables) {
      const columns = this.all("PRAGMA table_info(" + n + ")").map(
        (c) => c.name,
      );
      for (const row of data.tables[n]) {
        if (n === "baseline" && row.sealed_at) {
          seals.push({ id: row.id, sealed_at: row.sealed_at });
          row.sealed_at = null;
        }
        this.run(
          "INSERT INTO " +
            n +
            "(" +
            columns.join(",") +
            ") VALUES(" +
            columns.map(() => "?").join(",") +
            ")",
          ...columns.map((k) => row[k]),
        );
      }
    }
    for (const r of seals)
      this.run("UPDATE baseline SET sealed_at=? WHERE id=?", r.sealed_at, r.id);
    for (const t of tombstones) {
      this.run(
        "INSERT OR REPLACE INTO memory_tombstone VALUES(?,?)",
        t.memory_id,
        t.forgotten_at,
      );
      this.run(
        "UPDATE memory_entry SET status='forgotten' WHERE id=?",
        t.memory_id,
      );
      this.run(
        "UPDATE memory_revision SET statement='',source_refs_json='[]' WHERE memory_id=?",
        t.memory_id,
      );
    }
    this.run(
      "INSERT INTO app_setting(key,value_json) VALUES('backups',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json",
      JSON.stringify(list),
    );
    this.recover(true);
    return { restored: true, forgottenProtected: tombstones.length };
  }
  export(workId: string) {
    const d = this.detail(workId);
    const files: Record<string, Uint8Array> = {};
    const manifest: any = {
      workId,
      fingerprint: d.fingerprint,
      state: d.work.state,
      openItems: d.work.state === "delivered" ? [] : ["尚未通过当前版本审阅"],
      files: [],
      excluded: [],
    };
    for (const a of d.artifacts) {
      if (a.sensitivity === "restricted") {
        manifest.excluded.push({ id: a.id, reason: "restricted" });
        continue;
      }
      const name = a.kind + "-" + a.version + "-" + a.id + ".md";
      files[name] = strToU8(a.text);
      manifest.files.push({
        path: name,
        title: a.title,
        kind: a.kind,
        stage: a.metadata.stage || null,
        versionId: a.id,
        sha256: a.object_hash,
      });
    }
    files["README.md"] = strToU8(`# ${d.work.name}\n\n状态：${d.work.state}。当前指纹：${d.fingerprint}\n\n目标：${d.work.goal}\n\n${manifest.openItems.join("\n")}\n\n## 成果与依据\n\n${manifest.files.map((f: any) => `- [${f.title}${f.stage ? " · " + f.stage : ""}](${f.path})`).join("\n")}\n\n完整版本与校验和见 handoff.json。历史和失效成果保留，不能用其代替当前验收依据。系统源代码在 system/，启动与局限见 system/README.md（如提供）；Skill 在 skills/，文档在 document.md。\n`);
    const output = d.artifacts
      .filter(
        (a: any) =>
          ["document", "skill"].includes(a.kind) &&
          a.metadata.inputFingerprint === this.inputFingerprint(workId),
      )
      .at(-1);
    if (output && d.work.kind === "skill" && skillCheck(output.text)) {
      const name = /^name:\s*([a-z][a-z0-9-]*)/m.exec(output.text)![1];
      files[`skills/${name}/SKILL.md`] = strToU8(output.text);
    }
    if (d.work.kind === "system") {
      const code = d.artifacts
        .filter(
          (a: any) =>
            a.kind === "document" &&
            a.metadata.stage === "implementation" &&
            a.metadata.inputFingerprint === this.inputFingerprint(workId),
        )
        .at(-1);
      if (code) {
        try {
          for (const f of parseFiles(code.text))
            files["system/" + f.path] = strToU8(f.content);
        } catch {
          manifest.openItems.push("源码格式未通过检查");
        }
      }
    }
    if (output && d.work.kind === "document")
      files["document.md"] = strToU8(output.text);
    files["handoff.json"] = strToU8(JSON.stringify(manifest, null, 2));
    files["memories.json"] = strToU8(
      JSON.stringify(
        this.memories(workId).filter((m) => m.sensitivity !== "restricted"),
        null,
        2,
      ),
    );
    return {
      name: "jojo-" + workId + ".zip",
      bytes: Array.from(zipSync(files)),
      manifest,
    };
  }
}
