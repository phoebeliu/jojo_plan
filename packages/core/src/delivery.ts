// Work types share one shell; each type supplies its stages and output contract.
export const stages = {
  document: [{ id: "compose", role: "writer", title: "文档写作与依据核查" }],
  skill: [{ id: "compose", role: "skill-author", title: "可复用 Skill 编写" }],
  system: [
    { id: "research", role: "product", title: "需求研究与范围" },
    { id: "product", role: "product", title: "PRD 与验收标准" },
    { id: "design", role: "uiux", title: "界面、状态与交互设计" },
    { id: "architecture", role: "architect", title: "团队宣讲与系统分析设计" },
    { id: "test-design", role: "tester", title: "测试分析与用例设计" },
    { id: "implementation", role: "developer", title: "研发与容器测试" },
    { id: "final-review", role: "reviewer", title: "产品、市场与技术终审" },
  ],
};
export function instructions(kind: keyof typeof stages, stage: string) {
  if (kind === "skill")
    return `输出单个可复用 SKILL.md。以 YAML frontmatter 开始，含 name（小写英文和连字符）、description（何时使用）。正文有 # 标题，输入、步骤、输出、正反例、验收与边界。没有材料支持的事实要标记待核实，不虚构检索。`;
  if (kind === "document")
    return `输出完整 Markdown 文档，含标题、目标、正文、来源、假设与局限。引用材料用 [材料:版本ID]；没有原始测试记录不能编造测试结果。`;
  const map: Record<string, string> = {
    research:
      "形成研究报告：问题、用户、已提供材料、事实与假设、方案比较、待用户决策、MVP范围。禁止声称未执行的联网调研。",
    product:
      "形成完整PRD：目标、角色、用户故事、功能、非功能、异常、范围与不做项、逐条可测试验收标准。",
    design:
      "按PRD形成UIUX规格：信息架构、页面清单、每页组件和状态、操作与反馈、异常、空态、键盘与可访问性。",
    architecture:
      "形成团队宣讲与系统分析设计：需求追踪、模块、接口、数据模型、Mermaid架构图/ER图/data flow、边界、安全、部署与回滚。MVP实现限定无外部依赖的Node.js Web/API，数据可用本地JSON。",
    "test-design":
      "形成测试分析设计：需求与测试矩阵、正常/异常/权限/回归用例、预期结果、测试数据、验收与发布门槛。不要把设计当实测。",
    implementation: `根据已批准的PRD、UX、架构和测试设计交付源码。输出 # 研发交付，说明假设与局限，然后且仅一个 fenced json 代码块：{"files":[{"path":"package.json","content":"..."},{"path":"server.mjs","content":"..."},{"path":"test/system.test.mjs","content":"..."}]}。文件最多40个，总内容最多200KB，只允许相对路径，不含依赖、锁文件、密钥或二进制。实现无外部依赖Node.js Web/API，所有测试使用 node:test（以 .test.mjs 结尾），含实质性正常与异常断言。固定runner运行 node --test。package.json需有 start:node server.mjs，type:module。可增加 public/ 页面、src/ 模块、README.md。测试导入服务时不得常驻listen，使用显式入口/工厂。根据上次真实失败日志修复；不能假称已通过。`,
    "final-review":
      "作为独立终审角色，从产品完整性、用户价值/市场说明、UX、技术、安全和实测证据检查已批准的成果。输出缺陷、严重度、需求追踪、未验证事项、部署与回滚步骤及建议。不能用测试绿灯代替业务验收，最终批准由用户。",
  };
  return map[stage];
}
export function parseFiles(text: string): { path: string; content: string }[] {
  const matches = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (matches.length !== 1) throw Error("需要唯一的源码 JSON 块");
  const data = JSON.parse(matches[0][1]);
  if (
    !Array.isArray(data.files) ||
    !data.files.length ||
    data.files.length > 40
  )
    throw Error("源码文件数量无效");
  const seen = new Set<string>();
  let size = 0;
  for (const f of data.files) {
    if (
      typeof f.path !== "string" ||
      typeof f.content !== "string" ||
      !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(f.path) ||
      f.path.split("/").some((p: string) => p.startsWith(".")) ||
      !/\.(?:mjs|js|json|html|css|md|svg)$/.test(f.path) ||
      /(?:node_modules|package-lock|credentials|secrets)/i.test(f.path) ||
      seen.has(f.path.toLowerCase())
    )
      throw Error("源码路径无效或重复");
    seen.add(f.path.toLowerCase());
    size += Buffer.byteLength(f.content);
  }
  if (size > 200000) throw Error("源码超过 200KB");
  const pkg = JSON.parse(
    data.files.find((f: any) => f.path === "package.json")?.content || "{}",
  );
  if (
    Object.keys(pkg.dependencies || {}).length ||
    Object.keys(pkg.devDependencies || {}).length ||
    pkg.type !== "module" ||
    pkg.scripts?.start !== "node server.mjs" ||
    !seen.has("server.mjs") ||
    !data.files.some((f: any) => f.path.endsWith(".test.mjs"))
  )
    throw Error("需要无外部依赖的服务、启动约定和 node:test 用例");
  return data.files;
}
export function skillCheck(text: string) {
  return (
    /^---\s*\nname:\s*[a-z][a-z0-9-]{0,63}\s*\ndescription:\s*\S[^\n]*\n---/.test(
      text,
    ) &&
    /输入/.test(text) &&
    /步骤/.test(text) &&
    /输出/.test(text) &&
    /例/.test(text)
  );
}
