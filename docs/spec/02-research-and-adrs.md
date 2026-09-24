# 调研补充与架构决策

JP-1.0｜2026-09-25。与 [首轮调研](../research.md)共同阅读。证据层级：官方文档确认、产品推论、本地规格校验、实际运行验证分别标记；本轮没有候选框架实测、用户访谈或价格采购结论。

## 1. 替代方案比较

| 对象 | 官方证据 | 对本项目的推论 |
| --- | --- | --- |
| Codex 工作流 | 官方长期任务文章强调文件化项目状态、技能、工作树和持续验证。[R1] 原 app/features 已重定向至 ChatGPT Learn，旧文章不当成所有当前版本特性清单 | 已有工具加方法包是必须比较的基线；不能把一般多 Agent 或技能功能当唯一卖点 |
| Claude Code Agent Teams | 官方说明提供团队任务与消息；同时列出恢复、状态滞后及关闭限制。[R2] | 团队存在不自动解决阶段基线、可靠恢复和业务验收，需独立证明这些能力 |
| OpenCode | 官方说明终端、桌面与 IDE 形态，可接模型服务；权限文档支持 allow/ask/deny。[R3][R4] | 自带模型配置和桌面外壳已有替代；jojo plan 应把长期交付物关系作为比较重点 |
| OpenHands SDK | 官方 Agent Server 文档描述 HTTP/WebSocket、会话与工作区操作。[R5] | 是未来远程运行候选；首版若采用会增加 Python/server 封装，不优先 |
| BMAD / Spec Kit | 已阅读的官方方法包含规划、规格、实现、纠偏与验证，见首轮调研 | 借鉴方法并设计自己的产物契约；不直接将外部提示模板变成硬编码阶段规则 |

本轮没有逐个登录操作产品，所以不能声称这些竞品缺少某功能，也没有得出 jojo plan 优于它们的实验结论。市场规模和付费意愿未证明；第一版定位个人工作效率验证，而非已证实的商业机会。

对比实验（研发后执行）：同一组脱敏任务在“现有工具+方法包”与 jojo plan 中完成，固定模型/材料，人工记录协调时间、丢失信息、恢复、变更追踪和最终质量。先看功能性结果，再看总耗时；不把模型差异归因于产品。

## 2. ADR-01：桌面采用 Electron + TypeScript

决定：React 渲染层；Electron main 处理受控系统能力；utility process 承载持久化服务；每个 Agent 在工作进程执行。底层文档确认 utility process 支持 Node.js，并提供进程通信能力。[R6]

理由：首版多模型和 Agent 候选以 TS 接入可减少跨语言维护；文档预览与多面板交互可复用 Web 组件。此理由是开发成本判断，未通过团队工时测试。

替代：Tauri 已支持 macOS 打包，但需额外处理 TS 执行服务；SwiftUI 对文档/Web 预览和 Node 运行整合成本更高（推论）。不以未经测试的启动/内存数字排名。P0 固定受支持 Electron 稳定版本及 lockfile，验证 macOS 14 arm64；不在文档中虚构最新版本号。

## 3. ADR-02：业务编排自有，Pi 为首个运行适配

决定：复用 Pi 的 pi-ai / pi-agent-core，通过自有 RuntimeAdapter 接入；不启动完整 Pi CLI、不加载其默认文件/命令工具。自建小而明确的数据库状态机、任务队列和 ToolBroker。

依据：Pi 官方 core 包描述自定义工具、abort、事件订阅；pi-ai 文档描述自定义 provider。[R7][R8] 这些是适配可能性的文档证据，不是持久化或权限保证。

理由：本产品的任务、审批、文档与验收生命周期必须独立于模型会话。Agent 只能提出动作和产物，不能直接写入批准状态。取消、检查点和未知执行结果的恢复由我们负责。

替代：Hermes 作为技能/记忆参考；DeepSeek Harness 作为后续插件候选；LangGraph/CrewAI 可减少通用编排代码，但首版只需要有限模板，不同时引入第二套状态源。若 P0 Pi 适配失败，保留同一 RuntimeAdapter，以经兼容验证的供应商 SDK 实现最小循环，形成 ADR 修订，禁止悄悄改变上层契约。

## 4. ADR-03：SQLite + 不可变文件版本

决定：单个服务写数据库，SQLite WAL / foreign_keys=ON / synchronous=FULL；附件放内容寻址对象目录。元数据、批准、任务依赖和事件在数据库；文件内容按 sha256 保存。

理由：本地单用户不需要外部数据库。文件写入与 DB 无法跨介质原子提交，因此采用先写对象再提交引用、启动清理孤立临时对象的协议。实现以 schema.sql 为基准，通过迁移扩展。

## 5. ADR-04：默认受控执行

决定：读取/写入均经 ToolBroker；shell、技能脚本和项目测试在项目容器中，默认无网络、非特权，绑定限定工作区；宿主 Docker socket 只供受控 broker 使用，绝不挂载给 Agent 容器。没有引擎不回退宿主 shell。

Docker 文档说明资源限制需要显式配置。[R9] 我们因此设置默认 2 CPU/4GB、进程数 256、单任务 stdout 截断和超时。容器不被宣称为绝对安全边界；网络、凭据和挂载仍需最小化。

模型访问走可信工作进程；运行容器拿不到模型密钥。生成内容预览在无 Node 权限的隔离视图中。Electron 官方的安全建议及 safeStorage 支持此实现方向。[R10][R11]

## 6. ADR-05：首版能力及依赖边界

- 搜索：一个明确配置的 HTTP 适配器；Tavily 为首个候选，按官方契约实现 [R12]。缺凭据时支持导入材料，但研究状态为“来源受限”。
- 解析：内置文本、DOCX、文本型 PDF、CSV；图片/扫描 PDF 走配置的 OCR/视觉服务，保留坐标与页码；未配置时暂停该解析步骤。
- 输出：Markdown 为内部正文；HTML/PDF 为预览/打印；DOCX 由固定模板转换并验证；不承诺任意复杂 Word 样式往返无损。
- 发布：可注册 HTTPS CI pipeline；由系统保存候选摘要、审批及外部 run id，支持重连查询；没有发布目标时保留“待配置”。
- 版本：编译、运行、schema、提示、工具和模型能力检查结果均记录；第三方依赖在 P0 固定，不在运行时自动更新框架。

## 7. 实测欠账与执行位置

P0 必须验证 Pi 自定义工具/取消、macOS 打包、数据库重启恢复、容器生命周期；后续 P2 验证实际模型/搜索/OCR；P5 验证签名公证、更新及 pipeline 集成。未通过相应验证的能力不能被宣布完成，文档允许实现这些验证而不是等待用户提供答案。

## 官方来源（查阅 2026-09-25）

- [R1 OpenAI：长期任务实践](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex)
- [R2 Claude Code Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [R3 OpenCode Intro](https://opencode.ai/docs)
- [R4 OpenCode Permissions](https://opencode.ai/docs/permissions)
- [R5 OpenHands Agent Server](https://github.com/OpenHands/docs/blob/main/sdk/arch/agent-server.mdx)
- [R6 Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [R7 Pi Agent Core](https://github.com/earendil-works/pi/tree/main/packages/agent)
- [R8 Pi AI](https://github.com/earendil-works/pi/tree/main/packages/ai)
- [R9 Docker Resource Constraints](https://docs.docker.com/engine/containers/resource_constraints/)
- [R10 Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [R11 Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [R12 Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)
