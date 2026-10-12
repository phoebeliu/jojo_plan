# Jojo Plan 0.3.0 · 可本机试用的 MVP

2026-10-12。[本轮材料/Python验收](v03-review.md)。定位仍为“AI 项目负责人的个人交付替身”。这个版本已跑通 Skill、文档和小型系统三种交付路径；完整产品目标仍见 JP-1.1＋S2。[MVP 验收报告](mvp-review.md)区分真实模型、合成用例、协议 fixture 和尚未验证的能力。

## 安装与开始

1. 解压 [Apple Silicon 安装包](../../release/Jojo%20Plan-0.3.0-arm64-mac.zip)，打开 Jojo Plan.app。替换旧版本前先退出旧 App，数据沿用同一用户目录。当前按用户决定仅本机使用，不安排外部发行或签名/公证采购。
2. 在“模型与设置”添加模型。已登录的本机 Codex 可作开发试用通道；也支持 OpenAI-compatible / Anthropic messages 接口，密钥由 macOS safeStorage 加密保存。已验证两种接口的本机 SSE 协议回路，尚未逐一验证你的真实供应商。
3. 创建项目，再创建 Skill、文档或系统工作。**审计项目**里可以分别建销售穿行、IPO 审计工作；**护照校验项目**另建项目，与审计同级。这里是研发工作，不是已经认证的护照或审计判定服务。
4. 在“材料与来源”选择 UTF-8 的 MD/TXT/CSV/JSON，或粘贴材料。文本单文件最多200KB；PDF/PNG/JPEG原件8MB，一次最多10个。PDF可选页，图片在本机OCR，保留原件、来源和坐标；模型接收提取文字，原图不自动上传。也可请求公共 HTTPS 正文链接；不携带浏览器登录态，不读取内网。静态提取不等于事实核实，动态网页可能需手动导入。
5. 选择模型，明确允许发送当前目标、工作材料、前序成果和适用准则。“发送并开始”保存补充后生成；运行中补充会中止当前尝试，后续需核对用量再重新开始，不自动重复扣用量。
6. 阅读成果和依据，在“交付约定与审阅”批准或填具体修改意见。所有审批绑定当前要求、材料、输出和检查版本。新材料/新补充/变更要求会失效旧依据。
7. 导出 ZIP：文档有 document.md；Skill 有 skills/<name>/SKILL.md；系统有 system/ 源码、package.json、测试及说明。包内有版本、校验和、未完成项和排除项。

## 三条交付路径

| 路径 | MVP 可用能力 | 交付与审阅 |
|---|---|---|
| Skill | 根据材料编写标准 frontmatter、输入/步骤/输出/正反例/边界；检查格式；选择当前项目已批准 Skill 在另一工作中复用 | 标准单 Skill 目录；冻结选定版本，显式使用，不自动获得宿主工具权限 |
| 文档 | 基于有来源的文本写作、补充修订、Markdown 阅读、结构检查与当前版本审批 | Markdown 与完整依据 ZIP；语义、专业结论和事实仍需用户审阅 |
| 系统 | 研究 → PRD → UI/UX → 架构/团队宣讲 → 测试设计 → 研发/容器测试 → 产品/市场/技术终审 | 每个阶段独立角色调用、独立成果与批准；源码和实际日志传给下一阶段。阶段批准不会提前标记整项交付 |

系统 MVP 支持**无外部依赖的 Node.js 或 Python 标准库 Web/API**：可含 HTML/CSS 页面、Node 模块和 node:test，用本地内存/JSON 明确限定数据能力。架构可交付 Mermaid 图定义，当前阅读器不自动渲染图。源码最多40文件/200KB。Python入口server.py，测试tests/test_*.py，固定unittest runner；执行栈写入合同，不可混用。研发时明确允许 Docker 和首次下载官方 Node 镜像；Docker Desktop 需已完成初始化。

固定 runner 以摘要锁定官方基础镜像，只使用受信任 Dockerfile 的 COPY，不执行模型写的安装/构建脚本；测试容器断网、非 root、只读、无宿主挂载、无 Docker socket，限制内存/CPU/进程数和时间。至少两条未跳过的真实测试才可通过机器门槛。测试绿灯仍不证明全部业务正确。

测试失败后，真实日志进入下一次研发调用；同一 runner/输入最多 4 次研发尝试。用户填意见后可把任务交回任一已到达阶段，保留前序批准、失效该阶段及后续依据。需求改变则使用变更预演；不会悄悄修改原 PRD。

## Personal AI 与 Intelligent UI

有来源且经过确认的个人准则按项目/工作/类型进入上下文；候选、有效期、纠正、禁用、遗忘、全局和本次开关延续 0.1.0。方法需要真实正反例回归，确认候选本身不启用方法。

工作区使用稳定对话 shell、当前阶段、真实 Agent/Job/进程日志和六类受控情境视图。固定组件不固定风险数据；编辑时保留阅读检查点。没有任意 HTML/脚本生成，也不允许 Agent 自行审批。长期自动经验提炼、跨客户效果与护城河假设尚待真实日常任务验证。

## 支持边界

MVP 不是完整 JP-1.1：暂不自动搜索发现网页、不做扫描PDF OCR、复杂Word/表格结构解析、PDF/DOCX/PPT 排版、8 节点 Skill 组自动编排、任意技术栈/第三方依赖、自主生产发布、多用户/云端常驻。PPT 继续作为后续工作类型接入同一对话与成果框架，不增加全局导航页。

本机 Codex 通道没有抽取登录凭据，但当前桥接不构成通用的严格文件访问隔离证明；0.2.0模型验收全用合成输入；0.3.0增加公开IPO文本，未发送护照原图。敏感客户材料建议配置你认可的数据处理模型服务，检查当前发送范围。App 的“允许发送”是实际动作授权，不能当成供应商合规认证。

实际验证 Apple Silicon / macOS 27.0.1；最低 macOS 14 为配置目标，Intel/干净机/其他版本尚未验收。后续范围选择已获用户确认，见[决定记录](mvp-owner-decisions.md)；首批领域任务使用[网上公开护照样本与IPO案例](public-case-acceptance.md)。方向确认不代表这些后续能力已完成。

## 开发与验收

- npm ci；npm run dev；npm run typecheck；npm test；npm run package。
- npm test 包含本机随机端口 SSE fixture，受限执行沙箱可能需允许 loopback；不连接真实外部供应商。
- scripts/acceptance-mvp.ts：真实模型七阶段、源码复测/失败反例、Skill 导出；JOJO_MVP_DIR 指定合成数据目录。JOJO_MVP_RESUME=1 恢复已保存阶段证据，不重跑前序。
- scripts/acceptance-document.ts：实际容器日志＋已批准 Skill → 真实文档生成、精确来源引用、审阅和导出。
- scripts/acceptance-sources.ts / acceptance-container.ts：公共网页读取/私网拒绝、容器边界实际检查。
- tests/desktop.cjs / desktop-mvp.cjs：实际 Electron 和独立合成数据；JOJO_PACKAGED_APP 可指定安装包中的可执行文件。Playwright 由本机 bundled runtime 提供。

真实模型脚本会使用当前模型账户额度；合成数据不随安装包发布。异常中断保留历史、暂停工作，不自动重放；未知用量需人工接受保守计账后继续。本地提交不等于公开发布，安装二进制不进入源码 Git。

- scripts/acceptance-materials.ts：公开PDF/本机示例OCR、原件导出、Python正反例；JOJO_MATERIALS_LIVE=1增加公开文本模型调用。
- scripts/acceptance-python-model.ts：真实模型生成Python标准库系统的单独执行验证；tests/desktop-materials.cjs验证打包后材料路径。
