import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { createRequire } from "node:module";
const addFormats = createRequire(import.meta.url)("ajv-formats");
import { commandSchema } from "../../contracts/contract-source.mjs";
import { Store, DomainError, uid, now, digest, fail } from "./store.js";
import type { Runtime } from "./runtime.js";
const canonical = (v: any): any =>
  v && typeof v === "object"
    ? Array.isArray(v)
      ? v.map(canonical)
      : Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
    : v;
export class Service {
  validate: any;
  active = new Map<string, AbortController>();
  constructor(
    public store: Store,
    public runtime: Runtime,
    private key: (id: string) => string | undefined = () => undefined,
    private publish: (e: any) => void = () => {},
  ) {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    this.validate = ajv.compile(commandSchema);
  }
  async command(
    c: any,
    actor:
      | "user"
      | "agent"
      | { kind: "agent"; projectId: string; workId: string } = "user",
  ) {
    const requestId = c?.requestId || "invalid";
    try {
      if (!this.validate(c)) fail("VALIDATION", "请求格式不符合契约");
      if (Buffer.byteLength(JSON.stringify(c)) > 1024 * 1024)
        fail("VALIDATION", "请求过大");
      const isAgent = actor !== "user";
      if (isAgent) {
        if (
          !["memory.propose", "viewIntent.propose", "context.preview"].includes(
            c.method,
          )
        )
          fail("PERMISSION_REQUIRED", "Agent只能提出候选或查看上下文");
        if (typeof actor === "string")
          return fail("PERMISSION_REQUIRED", "Agent调用需要可信运行作用域");
        this.store.work(actor.workId, actor.projectId);
        if (
          c.projectId !== actor.projectId ||
          (c.payload.workId && c.payload.workId !== actor.workId)
        )
          fail("SCOPE_DENIED", "Agent不能跨运行作用域");
        if (c.method === "memory.propose")
          this.store.sourceScope(
            c.payload.sourceRefs,
            "work",
            actor.projectId,
            actor.workId,
          );
      }
      if (c.payload.workId) this.store.work(c.payload.workId, c.projectId);
      const hash = digest(canonical(c)),
        prior = this.store.one(
          "SELECT * FROM request_dedup WHERE request_id=?",
          requestId,
        );
      if (prior) {
        if (prior.request_hash !== hash)
          fail("IDEMPOTENCY_CONFLICT", "请求编号已用于不同内容");
        if (c.method === "context.preview")
          return {
            requestId,
            ok: true,
            result: this.dispatch(c, isAgent ? "agent" : "user"),
            eventSequence: this.store.one(
              "SELECT coalesce(max(seq),0) AS n FROM domain_event",
            ).n,
          };
        return JSON.parse(prior.response_json);
      }
      const response = this.store.tx(() => {
        const result = this.dispatch(c, isAgent ? "agent" : "user");
        const r = {
          requestId,
          ok: true,
          result,
          eventSequence: this.store.one(
            "SELECT coalesce(max(seq),0) AS n FROM domain_event",
          ).n,
        };
        this.store.run(
          "INSERT INTO request_dedup VALUES(?,?,?,?,?)",
          requestId,
          c.method,
          hash,
          JSON.stringify(r),
          now(),
        );
        return r;
      });
      const result = response.result;
      if (
        c.method === "work.start" ||
        (c.method === "work.control" && c.payload.action === "resume")
      )
        void this.execute(
          c.payload.workId,
          c.payload.providerId || result.providerId,
          c.payload.tokenLimit || result.tokenLimit,
        ).catch(() => {
          this.active.delete(c.payload.workId);
          this.store.run(
            "UPDATE work_item SET state='blocked' WHERE id=?",
            c.payload.workId,
          );
          this.publish({ type: "state.changed" });
        });
      if (c.method === "memory.runRegression")
        void this.regress(c.payload, c.projectId, result).catch(() =>
          this.publish({ type: "state.changed" }),
        );
      if (
        c.method === "change.apply" ||
        (c.method === "work.control" &&
          ["pause", "cancel"].includes(c.payload.action))
      )
        this.active.get(c.payload.workId)?.abort();
      this.publish({ type: "state.changed" });
      return JSON.parse(JSON.stringify(response));
    } catch (e) {
      if (!(e instanceof DomainError))
        console.error(
          "Jojo service internal:",
          e instanceof Error ? e.message : "unknown",
        );
      return {
        requestId,
        ok: false,
        error: {
          code: e instanceof DomainError ? e.code : "INTERNAL",
          message:
            e instanceof DomainError ? e.message : "操作失败，请查看本地诊断",
          retryable: false,
        },
        eventSequence: 0,
      };
    }
  }
  dispatch(c: any, actor: string): any {
    const s = this.store,
      p = c.payload,
      m = c.method;
    if (m === "app.snapshot") return s.snapshot();
    if (m === "project.create") return s.createProject(p.name);
    if (m === "work.create") {
      if (!c.projectId) fail("SCOPE_DENIED", "请选择项目");
      return s.createWork(c.projectId, p);
    }
    if (m === "conversation.send") {
      const id = s.message(
        p.workId,
        "user",
        p.text,
        null,
        p.purpose || "supplement",
      );
      return { accepted: true, id };
    }
    if (m === "provider.save") {
      if (p.protocol !== "codex-local") {
        let url;
        try {
          url = new URL(p.baseUrl);
        } catch {
          fail("VALIDATION", "接口地址无效");
        }
        if (
          url!.protocol !== "https:" &&
          !(
            url!.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url!.hostname)
          )
        )
          fail("VALIDATION", "模型接口需要HTTPS或本机地址");
      }
      const id = uid();
      s.run(
        "INSERT INTO provider_config VALUES(?,?,?,?,?,?,?,?,?,?)",
        id,
        p.name,
        "model",
        p.protocol,
        p.baseUrl,
        p.modelId || null,
        id,
        "{}",
        1,
        now(),
      );
      return { id, revision: 1 };
    }
    if (m === "provider.check")
      return {
        provider: s.one(
          "SELECT id,protocol,revision FROM provider_config WHERE id=?",
          p.providerId,
        ),
        status: "not_checked",
        message: "启动真实任务才能确认端到端兼容；不伪造连接通过",
      };
    if (m === "work.start") {
      const w = s.work(p.workId);
      s.revision(w, c.expectedRevision);
      if (this.active.size >= 3)
        fail("REVISION_CONFLICT", "已达到同时运行上限");
      if (
        [...this.active.keys()].filter(
          (id) => s.work(id).project_id === w.project_id,
        ).length >= 2
      )
        fail("REVISION_CONFLICT", "已达到项目运行上限");
      if (
        this.active.has(w.id) ||
        s.one(
          "SELECT id FROM workflow_run WHERE work_id=? AND state='running'",
          w.id,
        )
      )
        fail("REVISION_CONFLICT", "当前工作正在运行");
      const provider = s.one(
        "SELECT * FROM provider_config WHERE id=?",
        p.providerId,
      );
      if (!provider) fail("NOT_FOUND", "模型配置不存在");
      if (provider.protocol !== "codex-local" && !this.key(provider.id))
        fail("PERMISSION_REQUIRED", "请在本地设置模型密钥");
      if (w.kind === "system")
        fail(
          "PERMISSION_REQUIRED",
          "系统容器研发还需配置Docker，当前阶段支持文档/Skill文本闭环",
        );
      if (p.tokenLimit < 12000)
        fail("BUDGET_EXCEEDED", "预算不足以预留本次调用");
      const previous = s.one(
        "SELECT * FROM budget_account WHERE work_id=?",
        w.id,
      );
      if (previous?.unknown_usage)
        fail("BUDGET_EXCEEDED", "上次用量不确定，请核对后调整预算");
      if (
        previous &&
        previous.used_tokens + previous.reserved_tokens + 12000 > p.tokenLimit
      )
        fail("BUDGET_EXCEEDED", "当前预算不足以保守预留本次调用");
      s.run(
        "INSERT INTO budget_account(work_id,token_limit) VALUES(?,?) ON CONFLICT(work_id) DO UPDATE SET token_limit=excluded.token_limit",
        w.id,
        p.tokenLimit,
      );
      s.run(
        "INSERT INTO permission_grant VALUES(?,?,?,?,?,?,?,?,?)",
        uid(),
        w.project_id,
        w.id,
        "model.send",
        JSON.stringify({ providerId: provider.id, goalRevision: w.revision }),
        "active",
        1,
        null,
        now(),
      );
      s.run(
        "UPDATE workflow_run SET state='cancelled' WHERE work_id=? AND state NOT IN ('delivered','cancelled','failed')",
        w.id,
      );
      s.run("UPDATE work_item SET state='active' WHERE id=?", w.id);
      const runId = uid(),
        stageId = uid();
      s.run(
        "INSERT INTO workflow_run VALUES(?,?,?,?,?,?,?)",
        runId,
        w.id,
        w.kind + "@1.0.0",
        "running",
        JSON.stringify({ providerId: provider.id, tokenLimit: p.tokenLimit }),
        1,
        now(),
      );
      s.run(
        "INSERT INTO stage_run VALUES(?,?,?,?,?,?)",
        stageId,
        runId,
        "compose",
        "active",
        1,
        1,
      );
      return {
        runId,
        stageId,
        providerId: provider.id,
        tokenLimit: p.tokenLimit,
      };
    }
    if (m === "work.control") {
      const w = s.work(p.workId);
      s.revision(w, c.expectedRevision);
      if (p.action === "resume") {
        if (w.state !== "paused")
          fail("REVISION_CONFLICT", "只有暂停的工作可恢复");
        const r = s.one(
          "SELECT config_json FROM workflow_run WHERE work_id=? ORDER BY created_at DESC LIMIT 1",
          w.id,
        );
        if (!r) fail("NOT_FOUND", "没有可恢复的运行");
        const config = JSON.parse(r.config_json);
        if (
          s.one(
            "SELECT unknown_usage FROM budget_account WHERE work_id=?",
            w.id,
          )?.unknown_usage
        )
          fail("BUDGET_EXCEEDED", "未知用量需先人工核对");
        return this.dispatch(
          {
            ...c,
            method: "work.start",
            payload: { workId: w.id, ...config, allowSend: true },
          },
          "user",
        );
      }
      s.run(
        "UPDATE work_item SET state=? WHERE id=?",
        p.action === "pause" ? "paused" : "cancelled",
        w.id,
      );
      s.run(
        "UPDATE workflow_run SET state=? WHERE work_id=? AND state=?",
        p.action === "pause" ? "paused" : "cancelled",
        w.id,
        "running",
      );
      return s.work(w.id);
    }
    if (m === "change.preview") return s.preview(p.workId, p.goal, p.criteria);
    if (m === "change.apply") {
      s.revision(s.work(p.workId), c.expectedRevision);
      return s.change(p);
    }
    if (m === "baseline.decide") {
      s.revision(s.work(p.workId), c.expectedRevision);
      return s.decide(p);
    }
    if (m === "budget.reconcile") {
      const w = s.work(p.workId);
      s.revision(w, c.expectedRevision);
      if (this.active.has(w.id))
        fail("REVISION_CONFLICT", "运行中不能核对用量");
      s.run(
        "UPDATE budget_account SET used_tokens=used_tokens+reserved_tokens,reserved_tokens=0,unknown_usage=0 WHERE work_id=?",
        w.id,
      );
      s.run(
        "UPDATE usage_entry SET state='unknown' WHERE work_id=? AND state='reserved'",
        w.id,
      );
      s.event("budget.reconciled", w.project_id, w.id, {
        conservative: true,
        reason: p.reason,
      });
      return { reconciled: true };
    }
    if (m === "data.backup") {
      if (this.active.size) fail("REVISION_CONFLICT", "请先暂停所有工作再备份");
      return s.backup();
    }
    if (m === "data.restore") {
      if (this.active.size) fail("REVISION_CONFLICT", "请先暂停所有工作再恢复");
      return s.restore(p.backupId);
    }
    if (m === "memory.configureGlobal") {
      s.run(
        "INSERT INTO app_setting(key,value_json) VALUES('personalEnabled',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,revision=revision+1",
        JSON.stringify(p.enabled),
      );
      return { enabled: p.enabled };
    }
    if (m === "data.export") return s.export(p.workId);
    if (m === "memory.list" || m === "memory.export") {
      if (p.workId) s.work(p.workId, c.projectId);
      return {
        items: s
          .memories(p.workId)
          .filter((e) => e.sensitivity !== "restricted"),
      };
    }
    if (m === "memory.propose") return s.proposeMemory(p, c.projectId, actor);
    if (m === "memory.runRegression") {
      const w = s.work(p.workId),
        e = s.memoryRow(p.memoryId, c.projectId);
      s.revision(e, c.expectedRevision);
      if (
        e.kind !== "method" ||
        e.status !== "confirmed" ||
        p.cases.every((c: any) => c.kind === "positive") ||
        p.cases.every((c: any) => c.kind === "negative") ||
        p.cases.some(
          (c: any) => !c.expectedContains.length && !c.mustNotContain.length,
        )
      )
        fail("METHOD_UNVALIDATED", "先接受方法候选，并提供正反例");
      if (e.scope !== "personal" && e.project_id !== w.project_id)
        fail("SCOPE_DENIED", "方法不属于本工作");
      if (this.active.has(w.id)) fail("REVISION_CONFLICT", "工作正在执行");
      const provider = s.one(
        "SELECT * FROM provider_config WHERE id=?",
        p.providerId,
      );
      if (!provider) fail("NOT_FOUND", "模型不存在");
      if (provider.protocol !== "codex-local" && !this.key(provider.id))
        fail("PERMISSION_REQUIRED", "模型密钥未配置");
      const budget = s.one(
        "SELECT * FROM budget_account WHERE work_id=?",
        w.id,
      );
      const reserve = p.cases.reduce(
        (n: number, c: any) =>
          n +
          Buffer.byteLength(c.input) +
          8192 +
          (provider.protocol === "codex-local" ? 20000 : 0) +
          Buffer.byteLength(
            s.memories(w.id).find((m: any) => m.id === e.id)?.statement || "",
          ),
        0,
      );
      if (
        !budget ||
        budget.unknown_usage ||
        budget.used_tokens + budget.reserved_tokens + reserve >
          budget.token_limit
      )
        fail("BUDGET_EXCEEDED", "回归预算不足或用量待核对");
      s.run(
        "UPDATE budget_account SET reserved_tokens=reserved_tokens+? WHERE work_id=?",
        reserve,
        w.id,
      );
      const id = uid();
      s.run(
        "INSERT INTO tool_operation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        null,
        w.project_id,
        w.id,
        "background",
        "method-regression",
        id,
        digest(p),
        "running",
        "external",
        null,
        null,
        null,
        now(),
        now(),
      );
      return { operationId: id, reserve, methodRevision: e.revision };
    }
    if (m.startsWith("memory."))
      return s.mutateMemory(m, p, c.projectId, c.expectedRevision);
    if (m === "context.preview")
      return {
        items: s.context(p.workId).map((e) => ({
          id: e.id,
          revision: e.revision,
          statement: e.statement,
          scope: e.scope,
          sourceRefs: JSON.parse(e.source_refs_json),
        })),
      };
    if (
      ["context.configure", "viewIntent.pin", "viewIntent.unpin"].includes(m)
    ) {
      const r = s.one(
        "SELECT * FROM work_preference WHERE work_id=?",
        p.workId,
      );
      s.revision(r, c.expectedRevision);
      if (m === "context.configure")
        s.run(
          "UPDATE work_preference SET personal_enabled=?,revision=revision+1 WHERE work_id=?",
          p.enabled ? 1 : 0,
          p.workId,
        );
      else
        s.run(
          "UPDATE work_preference SET pinned_component=?,revision=revision+1 WHERE work_id=?",
          m === "viewIntent.pin" ? p.componentId : null,
          p.workId,
        );
      return s.view(p.workId);
    }
    if (m === "viewIntent.explain") return s.view(p.workId);
    if (m === "viewIntent.propose") {
      const w = s.work(p.workId);
      if (p.targetFingerprint !== s.fingerprint(w.id))
        fail("STALE_VIEW", "界面目标已过期");
      if (
        p.expiresAt <= now() ||
        Date.parse(p.expiresAt) > Date.now() + 3600000
      )
        fail("STALE_VIEW", "视图有效期不合适");
      for (const id of p.reasonRefs) {
        const v = s.one(
          "SELECT work_id FROM artifact_version v JOIN artifact a ON a.id=v.artifact_id WHERE v.id=?",
          id,
        );
        if (!v || v.work_id !== w.id)
          fail("SCOPE_DENIED", "视图依据不属于本工作");
      }
      const usable = s.context(w.id);
      if (
        p.memoryRevisionRefs.some(
          (ref: any) =>
            !usable.some((e) => e.id === ref.id && e.revision === ref.revision),
        )
      )
        fail("SCOPE_DENIED", "视图使用了不可用准则");
      const id = uid();
      s.run(
        "INSERT INTO view_intent VALUES(?,?,?,?,?,?,?,?,?)",
        id,
        w.id,
        p.targetFingerprint,
        p.componentId,
        JSON.stringify(p.reasonRefs),
        JSON.stringify(p.memoryRevisionRefs),
        p.priority,
        p.expiresAt,
        now(),
      );
      return { id };
    }
    fail("VALIDATION", "未实现的命令不会被默默接受");
  }
  async execute(workId: string, providerId: string, tokenLimit: number) {
    const s = this.store;
    const ctrl = new AbortController();
    this.active.set(workId, ctrl);
    const w = s.work(workId),
      fp = s.inputFingerprint(workId);
    const run = s.one(
      "SELECT * FROM workflow_run WHERE work_id=? AND state='running' ORDER BY created_at DESC LIMIT 1",
      workId,
    );
    if (!run) {
      this.active.delete(workId);
      return;
    }
    const stage = s.one("SELECT id FROM stage_run WHERE run_id=?", run.id),
      provider = s.one("SELECT * FROM provider_config WHERE id=?", providerId);
    const contextMemories = s.context(workId);
    const contract = s.contract(workId);
    const supplements = s
      .detail(workId)
      .messages.filter(
        (m: any) => m.sender === "user" && m.purpose === "supplement",
      );
    const prompt = `工作目标：${w.goal}\n必须满足：${JSON.stringify(contract.metadata.deliveryContract.criteria.map((c: any) => c.statement))}\n用户补充材料：${supplements.map((m: any) => m.text).join("\n")}\n适用准则（不能扩大权限）：${contextMemories.map((e) => e.statement).join("\n")}\n输出Markdown正文，含标题、目标、正文、假设与局限。不得编造实测。`;
    const reserve =
      Buffer.byteLength(prompt) +
      8192 +
      (provider.protocol === "codex-local" ? 20000 : 0);
    const budget = s.one(
      "SELECT * FROM budget_account WHERE work_id=?",
      workId,
    );
    if (
      budget.used_tokens + budget.reserved_tokens + reserve >
      budget.token_limit
    )
      fail("BUDGET_EXCEEDED", "正文与准则超过可用预算");
    const taskId = uid(),
      attemptId = uid(),
      operationId = uid(),
      processId = uid(),
      callId = uid();
    let logSeq = 0;
    s.tx(() => {
      s.run(
        "INSERT INTO task(id,stage_id,role,title,state,input_fingerprint,spec_json,attempt_count,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        taskId,
        stage.id,
        "writer",
        "生成交付草稿",
        "running",
        fp,
        "{}",
        1,
        now(),
      );
      s.run(
        "INSERT INTO run_attempt VALUES(?,?,?,?,?,?,?,?,?,?)",
        attemptId,
        taskId,
        1,
        "running",
        String(process.pid),
        new Date(Date.now() + 300000).toISOString(),
        JSON.stringify({
          id: provider.id,
          revision: provider.revision,
          protocol: provider.protocol,
          model: provider.model_id,
        }),
        now(),
        null,
        null,
      );
      s.run(
        "INSERT INTO tool_operation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        operationId,
        attemptId,
        w.project_id,
        w.id,
        "background",
        "model.generate",
        callId,
        digest({ fp }),
        "running",
        "external",
        null,
        null,
        null,
        now(),
        now(),
      );
      s.run(
        "INSERT INTO execution_process(id,operation_id,executor_ref,state,started_at) VALUES(?,?,?,?,?)",
        processId,
        operationId,
        "pi-agent-core",
        "starting",
        now(),
      );
      s.run(
        "UPDATE budget_account SET reserved_tokens=reserved_tokens+? WHERE work_id=?",
        reserve,
        workId,
      );
      s.run(
        "INSERT INTO usage_entry(id,work_id,attempt_id,call_id,reserved,state,created_at) VALUES(?,?,?,?,?,?,?)",
        uid(),
        workId,
        attemptId,
        callId,
        reserve,
        "reserved",
        now(),
      );
      for (const m of supplements)
        if (m.state === "accepted" || m.state === "queued")
          s.run(
            "UPDATE conversation_message SET state='applied',applied_attempt_id=?,applied_at=? WHERE id=?",
            attemptId,
            now(),
            m.id,
          );
      s.event("attempt.started", w.project_id, w.id, { attemptId, taskId });
    });
    this.publish({ type: "state.changed" });
    try {
      const memories = contextMemories;
      for (const e of memories)
        s.run(
          "INSERT INTO memory_use VALUES(?,?,?,?,?,?,?)",
          uid(),
          e.id,
          e.revision,
          w.id,
          attemptId,
          "当前任务适用的已确认准则",
          now(),
        );
      const result = await this.runtime.run(
        prompt,
        provider,
        this.key(provider.id),
        ctrl.signal,
        (e) => {
          if (e.pid)
            s.run(
              "UPDATE execution_process SET pid=?,state='running' WHERE id=?",
              e.pid,
              processId,
            );
          if (logSeq < 200)
            s.run(
              "INSERT INTO process_log_chunk VALUES(?,?,?,?,?)",
              processId,
              ++logSeq,
              "system",
              JSON.stringify(e).slice(0, 1000),
              now(),
            );
          this.publish({ type: "execution.event", workId, event: e });
        },
      );
      s.tx(() => {
        const current = s.work(workId);
        const stale =
          ctrl.signal.aborted ||
          s.inputFingerprint(workId) !== fp ||
          current.state !== "active";
        const version = s.artifact(
          workId,
          w.kind === "skill" ? "skill" : "document",
          "交付草稿",
          result.text,
          {
            inputFingerprint: fp,
            attemptId,
            isSimulation: !!result.isSimulation,
          },
          "agent",
        );
        s.message(workId, "agent", result.text, attemptId);
        const criteria = contract.metadata.deliveryContract.criteria;
        const checks = [
          { id: "format-title", pass: /^#\s+\S/m.test(result.text) },
          { id: "not-empty", pass: result.text.trim().length >= 150 },
          { id: "limitations", pass: /假设|局限|限制|边界/.test(result.text) },
        ];
        const passed =
          checks.every((c) => c.pass) && !stale && !result.isSimulation;
        const job = uid();
        s.run(
          "INSERT INTO tool_operation VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          job,
          attemptId,
          w.project_id,
          w.id,
          "background",
          "document.structure",
          job,
          digest({ version }),
          "succeeded",
          "read",
          null,
          null,
          null,
          now(),
          now(),
        );
        const evidence = s.artifact(
          workId,
          "test_evidence",
          "结构检查依据",
          JSON.stringify(
            {
              checks,
              criteria,
              status: passed ? "结构满足，语义待用户审阅" : "未通过",
            },
            null,
            2,
          ),
          {
            operationId: job,
            targetVersionId: version,
            inputFingerprint: fp,
            isSimulation: !!result.isSimulation,
            passed,
            purpose: "document-structure",
          },
        );
        s.run(
          "INSERT INTO artifact_link VALUES(?,?,?,?)",
          version,
          contract.id,
          "implements",
          "",
        );
        s.run(
          "INSERT INTO artifact_link VALUES(?,?,?,?)",
          evidence,
          version,
          "verifies",
          "",
        );
        const baseline = uid();
        s.run(
          "INSERT INTO baseline VALUES(?,?,?,?,?,?,?,?)",
          baseline,
          stage.id,
          s.fingerprint(workId),
          "draft",
          passed ? 1 : 0,
          1,
          null,
          now(),
        );
        s.run(
          "INSERT INTO baseline_member VALUES(?,?,?)",
          baseline,
          version,
          "output",
        );
        s.run(
          "INSERT INTO baseline_member VALUES(?,?,?)",
          baseline,
          evidence,
          "evidence",
        );
        s.run(
          "INSERT INTO baseline_member VALUES(?,?,?)",
          baseline,
          contract.id,
          "input",
        );
        s.run("UPDATE baseline SET sealed_at=? WHERE id=?", now(), baseline);
        s.run(
          "UPDATE task SET state=? WHERE id=?",
          stale ? "stale" : "succeeded",
          taskId,
        );
        s.run(
          "UPDATE run_attempt SET state='succeeded',ended_at=? WHERE id=?",
          now(),
          attemptId,
        );
        s.run(
          "UPDATE tool_operation SET state='succeeded',updated_at=? WHERE id=?",
          now(),
          operationId,
        );
        s.run(
          "UPDATE execution_process SET state='exited',ended_at=?,exit_code=0 WHERE id=?",
          now(),
          processId,
        );
        if (!stale) {
          s.run(
            "UPDATE workflow_run SET state=? WHERE id=?",
            passed ? "waiting_approval" : "blocked",
            run.id,
          );
          s.run(
            "UPDATE work_item SET state=? WHERE id=?",
            passed ? "paused" : "blocked",
            workId,
          );
        }
        const unknown =
          result.inputTokens === null || result.outputTokens === null;
        s.run(
          "UPDATE budget_account SET reserved_tokens=reserved_tokens-?,used_tokens=used_tokens+?,unknown_usage=? WHERE work_id=?",
          reserve,
          unknown ? reserve : result.inputTokens! + result.outputTokens!,
          unknown ? 1 : 0,
          workId,
        );
        s.run(
          "UPDATE usage_entry SET state=?,input_tokens=?,output_tokens=? WHERE call_id=?",
          unknown ? "unknown" : "settled",
          result.inputTokens,
          result.outputTokens,
          callId,
        );
        s.event("artifact.ready", w.project_id, w.id, {
          versionId: version,
          evidenceId: evidence,
          fingerprint: fp,
          needsHumanReview: true,
        });
      });
    } catch (error) {
      console.error(
        "Jojo attempt finalization:",
        error instanceof Error ? error.message : "unknown",
      );
      s.tx(() => {
        s.run(
          "UPDATE run_attempt SET state=?,ended_at=?,error_code=? WHERE id=?",
          ctrl.signal.aborted ? "cancelled" : "failed",
          now(),
          ctrl.signal.aborted ? "CANCELLED" : "PROVIDER_FAILED",
          attemptId,
        );
        s.run(
          "UPDATE task SET state=? WHERE id=?",
          ctrl.signal.aborted
            ? s.work(workId).state === "cancelled"
              ? "cancelled"
              : "paused"
            : "failed",
          taskId,
        );
        s.run(
          "UPDATE workflow_run SET state='blocked' WHERE id=? AND state='running'",
          run.id,
        );
        s.run(
          "UPDATE tool_operation SET state='uncertain',updated_at=? WHERE id=?",
          now(),
          operationId,
        );
        s.run(
          "UPDATE execution_process SET state='uncertain',ended_at=? WHERE id=?",
          now(),
          processId,
        );
        s.run(
          "UPDATE budget_account SET unknown_usage=1 WHERE work_id=?",
          workId,
        );
        if (s.work(workId).state === "active")
          s.run("UPDATE work_item SET state='blocked' WHERE id=?", workId);
        s.event("attempt.failed", w.project_id, w.id, {
          attemptId,
          code: "PROVIDER_FAILED",
          usageUnknown: true,
        });
      });
    } finally {
      this.active.delete(workId);
      this.publish({ type: "state.changed" });
    }
  }
  async regress(p: any, projectId: string, run: any) {
    const s = this.store,
      w = s.work(p.workId),
      e = s.memoryRow(p.memoryId, projectId),
      statement = s.memories(w.id).find((m) => m.id === e.id)?.statement;
    const provider = s.one(
        "SELECT * FROM provider_config WHERE id=?",
        p.providerId,
      ),
      ctrl = new AbortController();
    this.active.set(w.id, ctrl);
    const results: any[] = [];
    let actual = 0,
      unknown = false,
      simulated = false;
    try {
      for (const c of p.cases) {
        if (
          ctrl.signal.aborted ||
          s.memoryRow(e.id, projectId).revision !== run.methodRevision
        )
          throw Error("METHOD_CHANGED");
        const r = await this.runtime.run(
          "验证以下方法候选，不使用其他个人准则：" +
            statement +
            "\n样例输入：" +
            c.input,
          provider,
          this.key(provider.id),
          ctrl.signal,
          (event) =>
            this.publish({ type: "execution.event", workId: w.id, event }),
        );
        simulated = simulated || !!r.isSimulation;
        if (r.inputTokens === null || r.outputTokens === null) unknown = true;
        else actual += r.inputTokens + r.outputTokens;
        results.push({
          kind: c.kind,
          pass:
            c.expectedContains.every((x: string) => r.text.includes(x)) &&
            c.mustNotContain.every((x: string) => !r.text.includes(x)),
          outputHash: digest(r.text),
        });
      }
      s.tx(() => {
        const passed =
          results.every((r) => r.pass) &&
          s.memoryRow(e.id, projectId).revision === run.methodRevision;
        s.run(
          "UPDATE tool_operation SET state='succeeded',updated_at=? WHERE id=?",
          now(),
          run.operationId,
        );
        const version = s.artifact(
          w.id,
          "test_evidence",
          "方法正反例回归",
          JSON.stringify(results, null, 2),
          {
            purpose: "method-regression",
            operationId: run.operationId,
            memoryId: e.id,
            memoryRevision: run.methodRevision,
            caseCount: results.length,
            passed,
            isSimulation: simulated,
          },
        );
        s.run(
          "UPDATE budget_account SET reserved_tokens=reserved_tokens-?,used_tokens=used_tokens+?,unknown_usage=? WHERE work_id=?",
          run.reserve,
          unknown ? run.reserve : actual,
          unknown ? 1 : 0,
          w.id,
        );
        s.event("method.regression.finished", w.project_id, w.id, {
          evidenceVersionId: version,
          passed,
        });
      });
    } catch {
      s.tx(() => {
        s.run(
          "UPDATE tool_operation SET state='uncertain',updated_at=? WHERE id=?",
          now(),
          run.operationId,
        );
        s.run(
          "UPDATE budget_account SET unknown_usage=1 WHERE work_id=?",
          w.id,
        );
      });
    } finally {
      this.active.delete(w.id);
      this.publish({ type: "state.changed" });
    }
  }
  stop() {
    for (const c of this.active.values()) c.abort();
  }
}
