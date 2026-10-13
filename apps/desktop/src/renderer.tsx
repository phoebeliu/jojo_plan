import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
declare global {
  interface Window {
    jojo: {
      command: (r: any) => Promise<any>;
      importFiles: (
        workId: string,
        projectId: string,
        options?: any,
      ) => Promise<any>;
      saveKey: (id: string, key: string) => Promise<any>;
      export: (r: any) => Promise<any>;
      onEvent: (f: () => void) => () => void;
    };
  }
}
function Markdown({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <div className="markdown">
      {blocks.map((block, i) =>
        block.startsWith("```") ? (
          <pre key={i}>
            <code>
              {block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "")}
            </code>
          </pre>
        ) : (
          block.split("\n").map((line, j) => {
            const h = /^(#{1,4})\s+(.+)/.exec(line);
            if (h)
              return React.createElement(
                `h${Math.min(h[1].length + 1, 5)}`,
                { key: `${i}-${j}` },
                h[2],
              );
            if (/^[-*]\s+/.test(line))
              return (
                <p className="list-line" key={`${i}-${j}`}>
                  • {line.slice(2)}
                </p>
              );
            return line.trim() ? <p key={`${i}-${j}`}>{line}</p> : null;
          })
        ),
      )}
    </div>
  );
}
const request = (
  method: string,
  payload: any,
  projectId: string | null = null,
  expectedRevision: number | null = null,
) => ({
  schemaVersion: 2,
  requestId: crypto.randomUUID(),
  method,
  payload,
  projectId,
  expectedRevision,
});
function App() {
  const [data, setData] = useState<any>({
      projects: [],
      works: [],
      details: [],
      providers: [],
    }),
    [current, setCurrent] = useState(""),
    [panel, setPanel] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [input, setInput] = useState(""),
    [newGoal, setNewGoal] = useState(""),
    [newName, setNewName] = useState(""),
    [criteria, setCriteria] = useState(""),
    [project, setProject] = useState(""),
    [kind, setKind] = useState("document"),
    [runtime, setRuntime] = useState("python"),
    [allow, setAllow] = useState(false),
    [allowContainer, setAllowContainer] = useState(false),
    [materialName, setMaterialName] = useState("参考材料"),
    [firstPage, setFirstPage] = useState(1),
    [lastPage, setLastPage] = useState(20),
    [materialOrigin, setMaterialOrigin] = useState("用户提供"),
    [materialText, setMaterialText] = useState(""),
    [reviewReason, setReviewReason] = useState(""),
    [sourceUrl, setSourceUrl] = useState(""),
    [reworkStage, setReworkStage] = useState("implementation"),
    [allowFetch, setAllowFetch] = useState(false),
    [limit, setLimit] = useState(200000),
    [provider, setProvider] = useState(""),
    [providerName, setProviderName] = useState("本机 Codex"),
    [protocol, setProtocol] = useState("codex-local"),
    [baseUrl, setBaseUrl] = useState(""),
    [model, setModel] = useState(""),
    [key, setKey] = useState(""),
    [memory, setMemory] = useState(""),
    [memories, setMemories] = useState<any[]>([]),
    [preview, setPreview] = useState<any>(null),
    [changeGoal, setChangeGoal] = useState(""),
    [changeCriteria, setChangeCriteria] = useState(""),
    [selectedArtifact, setSelectedArtifact] = useState("");
  const timer = useRef<any>(null),
    panelClose = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const shownViews = useRef<Record<string, any>>({});
  const busyRef = useRef(false);
  busyRef.current = !!panel || !!input.trim();
  const d = data.details.find((x: any) => x.work.id === current),
    w = d?.work,
    pid = w?.project_id || null;
  const running =
      d?.tasks.filter(
        (t: any) => t.state === "running" && t.role !== "source-tool",
      ).length || 0,
    jobs = d?.jobs.filter((j: any) => j.state === "running").length || 0;
  async function refresh() {
    try {
      const r = await window.jojo.command(request("app.snapshot", {}));
      if (!r.ok) throw Error(r.error.message);
      for (const item of r.result.details)
        if (!shownViews.current[item.work.id] || !busyRef.current)
          shownViews.current[item.work.id] = item.view;
      setData(r.result);
      setReady(true);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    void refresh();
    const off = window.jojo.onEvent(() => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void refresh(), 120);
    });
    return () => {
      off();
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!current && data.works.length) setCurrent(data.works[0].id);
    if (!project && data.projects.length) setProject(data.projects[0].id);
    if (!provider && data.providers.length) setProvider(data.providers[0].id);
  }, [data]);
  useEffect(() => {
    setAllow(false);
    setAllowContainer(false);
  }, [current, provider]);
  useEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>("main,.sidebar"))
      el.inert = !!panel;
    if (panel) panelClose.current?.focus();
    else opener.current?.focus();
    return () => {
      for (const el of document.querySelectorAll<HTMLElement>("main,.sidebar"))
        el.inert = false;
    };
  }, [panel]);
  async function call(
    method: string,
    payload: any,
    revision: number | null = null,
    scope: string | null = pid,
  ) {
    setError("");
    const r = await window.jojo.command(
      request(method, payload, scope, revision),
    );
    if (!r.ok) {
      setError(r.error.message);
      return null;
    }
    await refresh();
    return r.result;
  }
  function open(name: string) {
    opener.current = document.activeElement as HTMLElement;
    setPanel(name);
    if (name === "change") {
      setChangeGoal(w.goal);
      setChangeCriteria(
        d.contract.metadata.deliveryContract.criteria
          .map((c: any) => c.statement)
          .join("\n"),
      );
      setPreview(null);
    }
    if (name === "personal" && w) {
      setMemories([]);
      void loadMemories();
    }
  }
  async function loadMemories() {
    const r = await window.jojo.command(
      request("memory.list", { workId: current }, pid),
    );
    if (r.ok) setMemories(r.result.items);
  }
  async function create() {
    const c = criteria
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    const result = await call(
      "work.create",
      {
        name: newName,
        goal: newGoal,
        kind,
        criteria: c,
        ...(kind === "system" ? { runtime } : {}),
      },
      null,
      project,
    );
    if (result) {
      setCurrent(result.id);
      setPanel("");
      setNewGoal("");
      setNewName("");
      setCriteria("");
      setAllow(false);
    }
  }
  async function start() {
    if (!allow) {
      setError("请明确允许本次要求发送给选定模型");
      return;
    }
    await call(
      "work.start",
      {
        workId: current,
        providerId: provider,
        allowSend: true,
        tokenLimit: limit,
        ...(allowContainer ? { allowContainer: true } : {}),
      },
      w.revision,
    );
  }
  const currentBaseline = d?.baselines
    .filter(
      (b: any) =>
        b.valid &&
        b.status === "draft" &&
        b.fingerprint === d.fingerprint &&
        b.sealed_at,
    )
    .at(-1);
  const approvedStage =
    w?.kind === "system" &&
    d.baselines.some(
      (b: any) =>
        b.valid && b.status === "approved" && b.fingerprint === d.fingerprint,
    );
  const panelTitles: any = {
    new: "新工作",
    settings: "模型与环境",
    execution: "真实执行记录",
    delivery: "交付约定与审阅",
    change: "变更预演",
    personal: "个人工作准则",
    view: "情境推荐依据",
    artifact: "成果阅读",
    materials: "工作材料与来源",
  };
  function viewText() {
    return (
      (
        {
          evidence: "依据核查",
          scope: "范围澄清",
          method: "方法验证",
          sources: "来源核查",
          change: "变更复核",
          handoff: "交接清单",
        } as any
      )[(shownViews.current[current] || d?.view)?.component] || "明确目标"
    );
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="mark" src="brand.svg" alt="" />
          <div>
            jojo <span>plan</span>
            <small>替身计划</small>
          </div>
        </div>
        <button className="primary new-button" onClick={() => open("new")}>
          ＋ 新工作
        </button>
        {data.projects.map((p: any) => (
          <section key={p.id} className="project">
            <h3>{p.name}</h3>
            {data.works
              .filter((x: any) => x.project_id === p.id)
              .map((x: any) => (
                <button
                  key={x.id}
                  data-work-id={x.id}
                  className={x.id === current ? "nav active" : "nav"}
                  onClick={() => {
                    setCurrent(x.id);
                    setAllow(false);
                    setPanel("");
                  }}
                >
                  <strong>{x.name}</strong>
                  <small>
                    {
                      (
                        {
                          draft: "待开始",
                          active: "工作中",
                          paused: "待审阅 / 已暂停",
                          blocked: "待处理",
                          delivered: "已交付",
                          cancelled: "已取消",
                        } as any
                      )[x.state]
                    }
                  </small>
                </button>
              ))}
          </section>
        ))}
        <div className="sidebar-foot">
          <button onClick={() => open("settings")}>模型与设置</button>
          <p>本地保存 · 真实状态</p>
          <small>MVP / 0.3.1</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            个人工作区{" "}
            {w && " / " + data.projects.find((p: any) => p.id === pid)?.name}
          </span>
          <span className="live">
            ● {ready ? "后台服务已连接" : "正在启动"}
          </span>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>关闭</button>
          </div>
        )}
        {!w ? (
          <div className="empty">
            <span className="eyebrow">PERSONAL DELIVERY AI</span>
            <h1>
              把想法，
              <br />
              交付成结果。
            </h1>
            <p>先约定目标，再用依据检验。你的工作、版本和准则保存在本机。</p>
            <button className="primary" onClick={() => open("new")}>
              创建第一项工作 →
            </button>
          </div>
        ) : (
          <>
            <div className="heading">
              <div>
                <span className="eyebrow">
                  {w.kind.toUpperCase()} / WORKSPACE
                </span>
                <h1>{w.name}</h1>
                <p>
                  {w.kind === "system"
                    ? `当前：${d.stage.title} · 每一阶段审阅后交给下一位角色`
                    : "按你认可的方法推进，当前版本的结果由你审阅。"}
                </p>
              </div>
              <button onClick={() => open("personal")}>✦ 按你的方式</button>
            </div>
            {w.kind === "system" && (
              <div className="stage-strip" aria-label="研发阶段">
                {d.stages.map((s: any, i: number) => (
                  <span
                    key={s.id}
                    className={
                      w.state === "delivered" ||
                      i < d.stages.findIndex((x: any) => x.id === d.stage.id)
                        ? "passed"
                        : s.id === d.stage.id
                          ? "selected"
                          : ""
                    }
                  >
                    {w.state === "delivered" ||
                    i < d.stages.findIndex((x: any) => x.id === d.stage.id)
                      ? "✓"
                      : i + 1}{" "}
                    {s.title}
                  </span>
                ))}
              </div>
            )}
            <div className="outcome">
              <div>
                <small>交付状态 / 当前要求 v{w.revision}</small>
                <strong>
                  {w.state === "delivered"
                    ? "当前版本已审阅通过"
                    : approvedStage
                      ? `前序阶段已批准，可以开始${d.stage.title}`
                      : currentBaseline
                        ? "结构检查完成，等待你的语义审阅"
                        : d.baselines.some((b: any) => !b.valid)
                          ? "要求已变化，旧依据需重新验证"
                          : "当前版本尚未形成有效验收依据"}
                </strong>
              </div>
              <button onClick={() => open("delivery")}>查看约定 →</button>
            </div>
            <div className="execution">
              <button onClick={() => open("execution")}>
                <b>{running}</b> 个智能体工作中
              </button>
              <button onClick={() => open("execution")}>
                <b>{jobs}</b> 个后台 Job
              </button>
              <span>
                {data.providers.find((p: any) => p.id === provider)?.name ||
                  "尚未选择模型"}
              </span>
            </div>
            <div className="timeline">
              {d.messages.map((m: any) => (
                <article key={m.id} className="message">
                  <div
                    className={m.sender === "user" ? "avatar" : "avatar jojo"}
                  >
                    {m.sender === "user" ? "你" : "J"}
                  </div>
                  <div>
                    <small>
                      {m.sender === "user"
                        ? "你的要求"
                        : m.sender === "agent"
                          ? "交付 Agent · 模型输出"
                          : "系统记录"}
                    </small>
                    <Markdown text={m.text} />
                  </div>
                </article>
              ))}
              <div className="artifact-grid">
                {d.artifacts
                  .filter((a: any) => a.kind !== "prd")
                  .map((a: any) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setSelectedArtifact(a.id);
                        open("artifact");
                      }}
                    >
                      <span>
                        {a.kind === "test_evidence" ? "VERIFY" : "ARTIFACT"}
                      </span>
                      <strong>
                        {a.title} · v{a.version}
                      </strong>
                      <small>打开当前不可变版本 →</small>
                    </button>
                  ))}
              </div>
              <section className="checkpoint">
                <div>
                  <span className="eyebrow">下一步 / 可解释情境推荐</span>
                  <button onClick={() => open("view")}>
                    {(shownViews.current[current] || d.view).pinned
                      ? "已固定"
                      : "情境推荐"}{" "}
                    · {viewText()} ›
                  </button>
                </div>
                {shownViews.current[current]?.targetFingerprint !==
                  d.view.targetFingerprint && (
                  <button
                    onClick={() => {
                      shownViews.current[current] = d.view;
                      setData({ ...data });
                    }}
                  >
                    有新的检查点，查看更新
                  </button>
                )}
                <h2>
                  {w.state === "delivered"
                    ? "当前版本已审阅通过，可以导出交接包"
                    : (shownViews.current[current] || d.view).component ===
                        "change"
                      ? "先核对受影响成果，再重新运行"
                      : approvedStage
                        ? `已批准输入就绪，下一步：${d.stage.title}`
                        : currentBaseline
                          ? "阅读成果与检查依据，决定是否满足要求"
                          : "先明确输出与验收标准，再组织执行"}
                </h2>
                <p>
                  生成文件不等于交付完成。结构检查和用户语义审阅分别保存，均绑定当前要求。
                </p>
                <div>
                  <button onClick={() => open("delivery")}>
                    查看约定与依据
                  </button>
                  <button onClick={() => open("materials")}>
                    材料与来源 ·{" "}
                    {
                      d.artifacts.filter(
                        (a: any) => a.kind === "source_material",
                      ).length
                    }
                  </button>
                  <button onClick={() => open("change")}>
                    修改要求 / 预演影响
                  </button>
                  <button
                    onClick={async () => {
                      await window.jojo.export(
                        request("data.export", { workId: current }, pid),
                      );
                    }}
                  >
                    导出交接包
                  </button>
                </div>
              </section>
            </div>
            <div className="composer">
              <textarea
                aria-label="补充要求"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="告诉 Jojo 需要什么、怎样改进。发送并开始会保存补充并生成下一版；改变交付要求请使用变更预演。"
              />
              <div>
                <select
                  aria-label="选定模型"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="">选择模型</option>
                  {data.providers.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label>
                  <input
                    type="checkbox"
                    checked={allow}
                    onChange={(e) => setAllow(e.target.checked)}
                  />
                  允许将目标、工作材料、前序成果与适用准则发送给此模型
                </label>
                <button
                  disabled={!input.trim()}
                  onClick={async () => {
                    if (
                      await call("conversation.send", {
                        workId: current,
                        text: input,
                      })
                    ) {
                      setInput("");
                      if (provider && allow && !running) await start();
                    }
                  }}
                >
                  {provider && allow && !running ? "发送并开始" : "保存补充"}
                </button>
                {w.kind === "system" && d.stage.id === "implementation" && (
                  <label>
                    <input
                      type="checkbox"
                      checked={allowContainer}
                      onChange={(e) => setAllowContainer(e.target.checked)}
                    />
                    允许隔离测试与首次下载官方Node镜像
                  </label>
                )}
                {running ? (
                  <button
                    onClick={() =>
                      call(
                        "work.control",
                        { workId: current, action: "pause" },
                        w.revision,
                      )
                    }
                  >
                    暂停
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={!provider || !allow}
                    onClick={start}
                  >
                    {w.kind === "system"
                      ? `开始 ${d.stage.title} →`
                      : "开始 / 重新验证 →"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        <footer>Jojo Plan · 数据在本机 · 结构检查不代替专业或语义审阅</footer>
      </main>
      {panel && (
        <div className="scrim" onClick={() => setPanel("")}>
          <section
            className="panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="panel-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPanel("");
              if (e.key === "Tab") {
                const els = [
                  ...e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),input,textarea,select,summary",
                  ),
                ];
                const first = els[0],
                  last = els.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <header>
              <h2 id="panel-title">{panelTitles[panel]}</h2>
              <button
                ref={panelClose}
                aria-label="关闭详情"
                onClick={() => setPanel("")}
              >
                ×
              </button>
            </header>
            <div className="panel-content">
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {panel === "new" && (
                <>
                  <span className="eyebrow">从目标开始</span>
                  <h2>约定清楚，才知道怎样交付。</h2>
                  <label>
                    项目
                    <select
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                    >
                      {data.projects.map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="inline">
                    <input
                      aria-label="新项目名称"
                      placeholder="新项目名称"
                      id="project-name"
                    />
                    <button
                      onClick={async () => {
                        const name = (
                          document.getElementById(
                            "project-name",
                          ) as HTMLInputElement
                        ).value;
                        const p = await call(
                          "project.create",
                          { name },
                          null,
                          null,
                        );
                        if (p) setProject(p.id);
                      }}
                    >
                      创建项目
                    </button>
                  </div>
                  <label>
                    工作类型
                    <select
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="document">写文档</option>
                      <option value="skill">制作可复用 Skill</option>
                      <option value="system">系统研发 · 分阶段团队</option>
                    </select>
                  </label>
                  {kind === "system" && (
                    <label>
                      执行栈
                      <select
                        value={runtime}
                        onChange={(e) => setRuntime(e.target.value)}
                      >
                        <option value="python">Python 标准库 Web/API</option>
                        <option value="node">Node Web/API</option>
                      </select>
                    </label>
                  )}
                  <label>
                    工作名称
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </label>
                  <label>
                    目标
                    <textarea
                      value={newGoal}
                      onChange={(e) => setNewGoal(e.target.value)}
                    />
                  </label>
                  <label>
                    验收标准（每行一条，最终需要你审阅）
                    <textarea
                      value={criteria}
                      onChange={(e) => setCriteria(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={
                      !project || !newName || !newGoal || !criteria.trim()
                    }
                    onClick={create}
                  >
                    保存交付约定
                  </button>
                </>
              )}
              {panel === "settings" && (
                <>
                  <h2>配置你的模型服务</h2>
                  <p>
                    已有登录的本机Codex可用于模型生成；自带接口密钥通过本机安全存储保管。
                  </p>
                  <label>
                    名称
                    <input
                      value={providerName}
                      onChange={(e) => setProviderName(e.target.value)}
                    />
                  </label>
                  <label>
                    协议
                    <select
                      value={protocol}
                      onChange={(e) => setProtocol(e.target.value)}
                    >
                      <option value="codex-local">本机已登录 Codex</option>
                      <option value="openai-completions">
                        OpenAI-compatible
                      </option>
                      <option value="anthropic-messages">
                        Anthropic messages
                      </option>
                    </select>
                  </label>
                  {protocol !== "codex-local" && (
                    <>
                      <label>
                        接口地址
                        <input
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                        />
                      </label>
                      <label>
                        API密钥
                        <input
                          type="password"
                          value={key}
                          onChange={(e) => setKey(e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                    </>
                  )}
                  <label>
                    模型名（本机Codex可留空使用已有默认）
                    <input
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    onClick={async () => {
                      const p = await call(
                        "provider.save",
                        {
                          name: providerName,
                          protocol,
                          baseUrl,
                          modelId: model,
                        },
                        null,
                        null,
                      );
                      if (p) {
                        if (key) await window.jojo.saveKey(p.id, key);
                        setKey("");
                        setProvider(p.id);
                        setPanel("");
                      }
                    }}
                  >
                    保存模型配置
                  </button>
                  <label>
                    本次工作token上限
                    <input
                      type="number"
                      min="12000"
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                    />
                  </label>
                  <button
                    onClick={() =>
                      call(
                        "memory.configureGlobal",
                        { enabled: !data.globalPersonalEnabled },
                        null,
                        null,
                      )
                    }
                  >
                    {data.globalPersonalEnabled
                      ? "暂停全局个人准则"
                      : "恢复全局个人准则"}
                  </button>
                  <button onClick={() => call("data.backup", {}, null, null)}>
                    创建本地备份
                  </button>
                  {data.backups?.map((b: any) => (
                    <article key={b.id}>
                      <small>{b.createdAt}</small>
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              "恢复会替换本机工作记录；遗忘保护继续生效，不自动重跑任务。",
                            )
                          ) {
                            await call(
                              "data.restore",
                              { backupId: b.id },
                              null,
                              null,
                            );
                            setCurrent("");
                            setPanel("");
                          }
                        }}
                      >
                        恢复此备份
                      </button>
                    </article>
                  ))}
                  {w && d.budget?.unknown_usage === 1 && (
                    <button
                      onClick={() =>
                        call(
                          "budget.reconcile",
                          {
                            workId: current,
                            acceptConservativeCharge: true,
                            reason: "用户接受按全部预留额度保守计入已用",
                          },
                          w.revision,
                        )
                      }
                    >
                      按保守预留额度核对未知用量
                    </button>
                  )}
                  <p>
                    Docker隔离测试已接入，系统MVP限定无外部依赖的Node
                    Web/API。本机图片OCR与PDF选页提取已接入；自动搜索、扫描PDF
                    OCR、DOCX/PPT与生产发布另列后续。当前仅本机使用。
                  </p>
                </>
              )}
              {panel === "artifact" && (
                <>
                  {d?.artifacts
                    .filter((a: any) => a.id === selectedArtifact)
                    .map((a: any) => (
                      <article key={a.id}>
                        <span className="eyebrow">
                          {a.kind} / v{a.version}
                        </span>
                        <h2>{a.title}</h2>
                        <p>SHA-256：{a.object_hash}</p>
                        {a.previewUrl && (
                          <img
                            className="source-image"
                            src={a.previewUrl}
                            alt={a.title + " · 原始示例图片"}
                          />
                        )}
                        <Markdown text={a.text} />
                        {a.sourceSpans?.length > 0 && (
                          <details>
                            <summary>查看来源定位与置信度</summary>
                            <table>
                              <thead>
                                <tr>
                                  <th>序号</th>
                                  <th>定位</th>
                                  <th>识别置信度</th>
                                </tr>
                              </thead>
                              <tbody>
                                {a.sourceSpans
                                  .slice(0, 100)
                                  .map((span: any, i: number) => (
                                    <tr key={i}>
                                      <td>{i + 1}</td>
                                      <td>
                                        {JSON.stringify(
                                          JSON.parse(span.locator_json),
                                        )}
                                      </td>
                                      <td>
                                        {span.confidence === null
                                          ? "文本提取，不是OCR评分"
                                          : span.confidence.toFixed(3)}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </details>
                        )}

                        {a.sourceSpans?.length > 0 && (
                          <p>
                            来源定位 {a.sourceSpans.length} 处 ·{" "}
                            {a.metadata.ocrApplied
                              ? "OCR包含置信度与原图坐标，不能替代人工核对"
                              : `PDF ${a.metadata.firstPage}–${a.metadata.lastPage} 页 / 共 ${a.metadata.totalPages} 页`}
                          </p>
                        )}
                      </article>
                    ))}
                </>
              )}
              {panel === "materials" && (
                <>
                  <p>
                    导入文本、PDF、PNG或JPEG。文本上限200KB，原文件上限8MB。PDF保留选页与页码；图片在本机OCR。模型接收提取文字，原图不自动上传。添加材料会使旧审批失效。
                  </p>
                  <label>
                    PDF起始页
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={firstPage}
                      onChange={(e) => setFirstPage(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    PDF结束页
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={lastPage}
                      onChange={(e) => setLastPage(Number(e.target.value))}
                    />
                  </label>
                  <button
                    disabled={!!running || !!jobs}
                    onClick={async () => {
                      try {
                        await window.jojo.importFiles(current, pid!, {
                          firstPage,
                          lastPage,
                          origin: materialOrigin,
                        });
                        await refresh();
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  >
                    选择本机文件
                  </button>
                  <label>
                    材料名称
                    <input
                      value={materialName}
                      onChange={(e) => setMaterialName(e.target.value)}
                    />
                  </label>
                  <label>
                    来源 / 原始链接
                    <input
                      value={materialOrigin}
                      onChange={(e) => setMaterialOrigin(e.target.value)}
                    />
                  </label>
                  <label>
                    粘贴材料正文
                    <textarea
                      value={materialText}
                      onChange={(e) => setMaterialText(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={
                      !!running ||
                      !materialText.trim() ||
                      !materialName.trim() ||
                      !materialOrigin.trim()
                    }
                    onClick={async () => {
                      if (
                        await call("material.import", {
                          workId: current,
                          name: materialName,
                          text: materialText,
                          origin: materialOrigin,
                        })
                      )
                        setMaterialText("");
                    }}
                  >
                    保存来源材料
                  </button>
                  <h3>读取网上资料</h3>
                  <label>
                    公共正文链接
                    <input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={allowFetch}
                      onChange={(e) => setAllowFetch(e.target.checked)}
                    />
                    允许请求此公共网站，读取其静态正文
                  </label>
                  <button
                    disabled={
                      !allowFetch || !sourceUrl.trim() || !!running || !!jobs
                    }
                    onClick={() =>
                      call("material.fetch", {
                        workId: current,
                        url: sourceUrl,
                        allowFetch: true,
                      })
                    }
                  >
                    读取并保存来源
                  </button>
                  <p>
                    不会发送项目材料，不携带浏览器登录信息。动态网页或付费内容请自行提供可用材料；搜索发现与正文事实核查仍需你审阅。
                  </p>
                  <h3>复用项目中已批准的 Skill</h3>
                  {data.details
                    .filter(
                      (x: any) =>
                        x.work.project_id === pid &&
                        x.work.kind === "skill" &&
                        x.work.state === "delivered",
                    )
                    .map((x: any) => {
                      const skill = x.artifacts
                        .filter((a: any) => a.kind === "skill")
                        .at(-1);
                      return (
                        skill && (
                          <button
                            key={skill.id}
                            disabled={!!running}
                            onClick={() =>
                              call("skill.attach", {
                                workId: current,
                                versionId: skill.id,
                              })
                            }
                          >
                            选用 {x.work.name} · v{skill.version}
                          </button>
                        )
                      );
                    })}
                  {d.artifacts
                    .filter((a: any) => a.kind === "source_material")
                    .map((a: any) => (
                      <article key={a.id}>
                        <h3>{a.title}</h3>
                        <p>{a.metadata.origin}</p>
                        <small>
                          版本 {a.id} · SHA-256 {a.object_hash}
                        </small>
                        <Markdown text={a.text} />
                      </article>
                    ))}
                </>
              )}
              {panel === "execution" && (
                <>
                  <h2>来自后台服务的执行记录</h2>
                  <p>
                    Token：已用 {d.budget?.used_tokens ?? 0}，预留{" "}
                    {d.budget?.reserved_tokens ?? 0}；
                    {d.budget?.unknown_usage
                      ? "存在未知用量，需核对"
                      : "已记录当前用量"}
                    。未配置单价时不估算费用。
                  </p>
                  {d.tasks.map((t: any) => (
                    <article key={t.id}>
                      <h3>{t.title}</h3>
                      <p>
                        {t.role} / {t.state} / attempt {t.attempt_count}
                      </p>
                      <small>{t.id}</small>
                    </article>
                  ))}
                  {d.jobs.map((j: any) => (
                    <article key={j.id}>
                      <h3>{j.tool}</h3>
                      <p>
                        {j.execution_mode} / {j.state}
                      </p>
                      <small>{j.id}</small>
                    </article>
                  ))}
                  {d.processes?.map((p: any) => (
                    <article key={p.id}>
                      <h3>{p.executor_ref}</h3>
                      <p>
                        {p.state} / PID {p.pid ?? "API任务不适用"}
                      </p>
                      <pre>
                        {p.logs
                          .map(
                            (l: any) => l.seq + " " + l.stream + " " + l.text,
                          )
                          .join("\n")}
                      </pre>
                    </article>
                  ))}
                  {!d.tasks.length && (
                    <p>当前没有执行；不会显示虚构的代理或Job。</p>
                  )}
                </>
              )}
              {panel === "delivery" && (
                <>
                  <h2>当前约定与版本依据</h2>
                  <p>{w.goal}</p>
                  {d.contract.metadata.deliveryContract.criteria.map(
                    (c: any) => (
                      <article key={c.id}>
                        <small>{c.id}</small>
                        <h3>{c.statement}</h3>
                        <p>结构检查覆盖格式；此条是否满足仍由你审阅正文。</p>
                      </article>
                    ),
                  )}
                  <p className="note">当前指纹：{d.fingerprint}</p>
                  {w.kind === "system" && (
                    <article>
                      <h3>组织团队返工</h3>
                      <p>
                        保留已批准的前序成果，选定阶段与后续成果需重新生成、检查和审阅。实际需求变更请使用变更预演。
                      </p>
                      <select
                        aria-label="返工阶段"
                        value={reworkStage}
                        onChange={(e) => setReworkStage(e.target.value)}
                      >
                        {d.stages.map((s: any) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!!running || !reviewReason.trim()}
                        onClick={() =>
                          call(
                            "system.rework",
                            {
                              workId: current,
                              stage: reworkStage,
                              reason: reviewReason,
                            },
                            w.revision,
                          )
                        }
                      >
                        按审阅意见交回团队
                      </button>
                    </article>
                  )}

                  <label>
                    审阅意见（要求修改时必填）
                    <textarea
                      value={reviewReason}
                      onChange={(e) => setReviewReason(e.target.value)}
                      placeholder="具体缺陷、修改方向与验收期待"
                    />
                  </label>
                  {currentBaseline ? (
                    <>
                      <p>
                        已形成当前版本结构依据。请阅读全部成果，确认语义、来源与局限后选择：
                      </p>
                      <button
                        className="primary"
                        onClick={() =>
                          call(
                            "baseline.decide",
                            {
                              workId: current,
                              fingerprint: d.fingerprint,
                              verdict: "approve",
                              reason:
                                reviewReason ||
                                "用户阅读正文与依据后确认当前阶段约定满足",
                            },
                            w.revision,
                          )
                        }
                      >
                        确认当前版本满足约定
                      </button>
                      <button
                        disabled={!reviewReason.trim()}
                        onClick={() =>
                          call(
                            "baseline.decide",
                            {
                              workId: current,
                              fingerprint: d.fingerprint,
                              verdict: "request_changes",
                              reason: reviewReason,
                            },
                            w.revision,
                          )
                        }
                      >
                        需要修改
                      </button>
                    </>
                  ) : (
                    <p className="note">
                      当前版本没有有效检查基线，审批不可用。
                    </p>
                  )}
                </>
              )}
              {panel === "change" && (
                <>
                  <h2>先看影响，再修改要求</h2>
                  <label>
                    新的目标
                    <textarea
                      value={changeGoal}
                      onChange={(e) => {
                        setChangeGoal(e.target.value);
                        setPreview(null);
                      }}
                    />
                  </label>
                  <label>
                    新的验收标准
                    <textarea
                      value={changeCriteria}
                      onChange={(e) => {
                        setChangeCriteria(e.target.value);
                        setPreview(null);
                      }}
                    />
                  </label>
                  <button
                    onClick={async () =>
                      setPreview(
                        await call("change.preview", {
                          workId: current,
                          goal: changeGoal,
                          criteria: changeCriteria
                            .split("\n")
                            .filter((x) => x.trim()),
                        }),
                      )
                    }
                  >
                    预演影响
                  </button>
                  {preview && (
                    <>
                      <p>
                        受影响成果 {preview.affected.length}{" "}
                        项；旧基线将失效，历史保留。
                      </p>
                      {preview.affected.map((a: any) => (
                        <p key={a.id}>{a.title}</p>
                      ))}
                      <p>{preview.coverage}</p>
                      <button
                        className="primary"
                        onClick={async () => {
                          if (
                            await call(
                              "change.apply",
                              {
                                workId: current,
                                goal: changeGoal,
                                criteria: changeCriteria
                                  .split("\n")
                                  .filter((x) => x.trim()),
                                previewFingerprint: preview.previewFingerprint,
                              },
                              w.revision,
                            )
                          ) {
                            setPanel("");
                            setAllow(false);
                          }
                        }}
                      >
                        应用变更，重新验证
                      </button>
                    </>
                  )}
                </>
              )}
              {panel === "personal" && (
                <>
                  <h2>有来源的方法，由你确认。</h2>
                  <button
                    onClick={async () => {
                      await call(
                        "context.configure",
                        { workId: current, enabled: !d.view.personalEnabled },
                        d.view.revision,
                      );
                    }}
                  >
                    {d.view.personalEnabled
                      ? "本次暂停个人准则"
                      : "本次恢复个人准则"}
                  </button>
                  <label>
                    提议一条个人工作准则
                    <textarea
                      value={memory}
                      onChange={(e) => setMemory(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={!memory.trim() || !d.messages.length}
                    onClick={async () => {
                      const source = await call("conversation.send", {
                        workId: current,
                        text: "提议个人工作准则：" + memory,
                        purpose: "memory-source",
                      });
                      if (!source) return;
                      if (
                        await call("memory.propose", {
                          kind: "preference",
                          scope: "personal",
                          workId: null,
                          statement: memory,
                          sourceRefs: [{ type: "message", id: source.id }],
                          sensitivity: "internal",
                          expiresAt: null,
                          appliesTo: [w.kind],
                        })
                      ) {
                        setMemory("");
                        await loadMemories();
                      }
                    }}
                  >
                    保存为待确认候选
                  </button>
                  {memories.map((m: any) => (
                    <article key={m.id}>
                      <h3>{m.statement}</h3>
                      <p>
                        {m.scope} / {m.status} / v{m.revision}
                      </p>
                      <small>来源：{m.source_refs_json}</small>
                      <div>
                        {m.status === "proposed" && (
                          <button
                            onClick={async () => {
                              await call(
                                "memory.confirm",
                                { memoryId: m.id },
                                m.revision,
                              );
                              await loadMemories();
                            }}
                          >
                            确认准则
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            await call(
                              "memory.disable",
                              {
                                memoryId: m.id,
                                disabled: m.status !== "disabled",
                              },
                              m.revision,
                            );
                            await loadMemories();
                          }}
                        >
                          {m.status === "disabled" ? "重新作为候选" : "禁用"}
                        </button>
                        <button
                          onClick={async () => {
                            const statement = prompt(
                              "纠正准则：修改后回到待确认，不会静默覆盖运行上下文。",
                              m.statement,
                            );
                            if (statement && statement !== m.statement) {
                              const source = await call("conversation.send", {
                                workId: current,
                                text: "纠正工作准则：" + statement,
                                purpose: "memory-source",
                              });
                              if (source) {
                                await call(
                                  "memory.correct",
                                  {
                                    memoryId: m.id,
                                    statement,
                                    sourceRefs: [
                                      { type: "message", id: source.id },
                                    ],
                                  },
                                  m.revision,
                                );
                                await loadMemories();
                              }
                            }
                          }}
                        >
                          纠正
                        </button>
                        <button
                          onClick={async () => {
                            if (
                              confirm(
                                "遗忘将移除所有准则正文；已发送给模型的历史上下文无法撤回。",
                              )
                            ) {
                              await call(
                                "memory.forget",
                                { memoryId: m.id },
                                m.revision,
                              );
                              await loadMemories();
                            }
                          }}
                        >
                          忘记
                        </button>
                      </div>
                    </article>
                  ))}
                </>
              )}
              {panel === "view" && (
                <>
                  <h2>为什么显示{viewText()}？</h2>
                  <p>
                    当前工作：{w.state} / 要求 v{w.revision}
                  </p>
                  <p>目标指纹：{d.view.targetFingerprint}</p>
                  <p>
                    个人准则：{d.view.personalEnabled ? "启用" : "本次暂停"}
                    ；实际适用准则 {d.view.memoryRevisionRefs.length} 条。
                  </p>
                  <p>
                    按当前范围、来源、方法或变更状态选择受控组件。固定显示不会冻结交付风险。
                  </p>
                  <button
                    onClick={() =>
                      call(
                        d.view.pinned ? "viewIntent.unpin" : "viewIntent.pin",
                        d.view.pinned
                          ? { workId: current }
                          : { workId: current, componentId: d.view.component },
                        d.view.revision,
                      )
                    }
                  >
                    {d.view.pinned ? "恢复情境推荐" : "固定当前检查点"}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
