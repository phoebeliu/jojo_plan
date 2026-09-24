# jojo plan 产品与技术调研

日期：2026-09-25｜版本：0.1｜状态：首轮案头调研

## 1. 研究问题与证据边界

研究目标：判断如何把 AI 工程师的技能制作、文档写作和完整研发协作流程，做成可安装的 macOS 应用。

本轮阅读官方仓库和文档；没有安装或运行候选框架，没有性能、成本、成功率对比，也没有访谈其他用户。下文“官方说明”属于文档证据，“判断”属于针对本产品的推论。未找到证据不代表候选产品没有该能力。

已确认的用户需求：macOS 桌面端；按职能加载技能；用户配置模型；制作 Skill、写文档、开发系统；开发系统必须经过产品研究、PRD、UI/UX、宣讲、系统及测试分析设计、开发测试循环和最终综合验收。

本轮用户补充的事实：ontology 模糊需求经资料搜索后产出 8 个 Skill；文档有小白 CI/CD 经验分享与“qwen3.8 27b”测试报告；审计系统需从零交付至生产发布。模型名称按用户原话记录，未核实具体版本。没有获得原始技能、测试数据或审计业务定义。

由此新增的研究问题：如何让一组技能可靠衔接；如何在文档中保持经验/实测/引用的证据边界；如何把发布准备、授权、回滚及生产验证纳入交付。这些是案例引出的产品推论，尚未完成专项调研。

## 2. 先区分三个比较层次

| 层次 | 解决的问题 | 本轮对象 |
| --- | --- | --- |
| 工作方法 | 如何研究、形成规格、分工、评审和纠偏 | BMAD、Spec Kit、MetaGPT |
| 执行与编排 | 如何调用模型和工具、保持状态、执行角色任务 | Hermes、Pi、DeepSeek Harness、LangGraph、CrewAI |
| 桌面承载 | 如何安装、展示成果、管理本地进程和分发 | Electron、Tauri |

这些对象不能放在同一排行榜。方法包不能自动替代持久化运行服务，执行引擎也不等于完整产品。下表不是采购或选型定论。

## 3. 方法与协作参考

| 对象 | 官方说明已确认 | 对 jojo plan 的判断 | 仍须核实 |
| --- | --- | --- | --- |
| BMAD | 提供产品、UX、架构、研发和测试相关工作流；以文档传递上下文，并有评审、修正路径。[S1] | 是当前较贴近用户工作方式的方法参考，适合研究产物模板和交接规则 | 如何落实用户要求的固定阶段、文档版本关联及最终独立验收 |
| Spec Kit | 为编码 Agent 提供规格驱动过程，覆盖 specification、plan、tasks、implementation、convergence；另有问题修复和想法评估入口。[S2] | 可借鉴需求到任务、实现到验证的追踪机制 | 桌面流程控制、UI/UX 交付管理、市场验收需另行评估 |
| MetaGPT | 以 SOP 组织产品经理、架构师、项目经理、工程师等角色，产出需求、API、数据结构及文档。[S3] | 是“模拟软件团队”的直接参考对象 | 长期运行、复杂返工、现有项目接手的实测质量；不能以角色齐全代替交付质量 |

BMAD 官方另有组织内规划说明，强调与组织已有 PRD 和审批流程衔接。[S4] 因此应研究它如何服务现有工作习惯，而不是强制用户迁就框架流程。

## 4. 执行能力参考

| 对象 | 官方说明已确认 | 对 jojo plan 的判断 | 风险或待验证 |
| --- | --- | --- | --- |
| Hermes Agent | 有技能学习、跨会话记忆、多模型接入、隔离子任务及多种执行后端。[S5] | 对技能制作、经验沉淀和个人工作习惯有参考价值 | 自动积累的技能是否经过验证；是否可以稳定嵌入我们的状态与评审模型 |
| Pi | 当前官方仓库由旧地址重定向至 earendil-works/pi；含多模型 API、Agent runtime 和 durable runtime 等包。官方明确不内置文件/进程/网络权限限制。[S6] | 可作为模块化执行候选 | 需另外建立执行边界；必须评估当前版本，不能沿用旧教程对其能力的描述 |
| DeepSeek Harness | 采用 Cordis 插件体系；模型、工具、技能、会话、存储等可组合，官方标为开发者预览。[S7] | 值得验证可替换执行后端及插件扩展 | 核心 API 仍会演进；需要版本固定和升级验证 |
| LangGraph | 提供 checkpoint 和跨线程 store；interrupt 恢复会重新执行所在节点；内存 checkpoint 不能跨进程重启保留。[S8][S9] | 适合评估阶段等待、恢复和条件分支 | 文档保存、命令执行等外部效果仍需去重与核对，恢复状态不等于恢复全部外部操作 |
| CrewAI Flows | 提供事件驱动流程和状态持久化；persist 默认采用 SQLiteFlowPersistence。[S10] | 可作为流程及角色组织候选 | 须验证暂停后恢复、取消传播、并发写入和文档变更后的任务失效机制 |

DeepSeek Harness 的子 Agent 文档列出了不同后端与控制能力。[S11] 这说明多后端编排有参考实现，但不证明各后端的参数、权限、取消和恢复语义完全一致。

## 5. 技能格式与模型接入

Agent Skills 规范以 SKILL.md 为必需入口，可包含 scripts、references 和 assets，并采用逐步加载。allowed-tools 属实验字段，具体支持因实现而异。[S12]

产品判断：技能正文尽量保持可移植；技能版本、验证记录、来源、适用环境和权限策略由工作台额外管理。格式验证只能证明包结构符合规则，不能证明它对真实任务有效。应分别验证触发、正例、反例及缺少依赖时的行为。

模型配置应成为能力配置：文本、工具调用、图片理解、结构化输出、上下文和用量统计分别检测。用户填入一个兼容地址，不意味着所有协议细节都兼容。搜索、浏览器或图片工具也可能需要独立服务配置。该设计尚未通过真实服务接入实验。

## 6. macOS 可行性初筛

Electron 官方提供主进程、渲染进程和可承载 Node.js 工作的 utility process。[S13] 判断：值得评估其对执行服务的承载，但进程分离本身不等于命令沙箱。

Tauri 官方支持 macOS 应用与 DMG 等分发方式，并提供签名、公证指南。[S14][S15] 判断：可列为候选；如果执行引擎依赖其他运行时，打包与通信成本要一并测量。

暂不选 Electron 或 Tauri。后续需要同一功能条件下比较：安装依赖、冷启动、内存、运行服务生命周期、文件与预览能力、升级迁移、签名公证及 Apple Silicon/Intel 支持成本。实际支持的机型和系统版本先由产品范围确定。

本地优先也不等于离线：项目可以保存在本机，调用云模型时仍会发送必要内容。离线阅读成果和离线执行 Agent 是不同要求。

## 7. 差异化假设与反证

假设：用户愿意使用一个明确管理“资料 → PRD → 设计 → 实现 → 测试 → 综合验收”关系的工作台，减少搬运材料、解释背景、核对版本和追踪返工的成本。

反证路径：如果已有工具加一套方法包就能完成这些工作，而且额外流程显著拖慢小任务，独立 APP 的收益可能不足。应拿同一真实任务对比人工组织现有工具与 jojo plan 的流程方案，记录人工介入时间、遗漏、返工和可追溯性。当前没有证据支持市场规模、付费意愿或效率提升百分比。

首轮更有价值的差异化候选：交付物版本关系；结构化宣讲与异议处理；变更影响分析；开发和独立测试的闭环；综合验收证据；技能经验经过验证后沉淀。以上是产品假设，不是声称竞品均不具备。

## 8. 技术验证清单（计划，未执行）

| 实验 | 方法 | 通过依据 |
| --- | --- | --- |
| 模型兼容 | 对同一任务使用选定服务，检查流式、工具调用、结构化结果 | 能识别不支持的能力，不静默忽略失败 |
| 阶段等待 | 等待 PRD 评审时退出并重新启动 | 待评审版本、材料和待决策事项一致 |
| 执行恢复 | 在文件写入后、状态确认前终止进程 | 能核对既有成果，不盲目重复外部操作 |
| 变更传播 | 改变一个已进入研发的需求 | 列出受影响的设计、任务和测试；旧结果不作为新版本通过依据 |
| 多角色协作 | 架构与测试独立产出，再组织差异讨论 | 异议有负责人和结论；未解决的关键矛盾阻止研发基线建立 |
| 修复闭环 | 植入可复现缺陷，执行修复和回归 | 缺陷由测试证据关闭，保留失败与成功记录 |
| 循环终止 | 连续修复无进展、预算耗尽或工具不可用 | 停在可恢复状态并明确原因，不无限循环 |
| 打包 | 在干净的目标 macOS 环境安装并启动 | 不依赖开发者机器已有的隐式环境 |

选型前固定候选版本与模型配置，使用同一任务集；记录成功率、人工时间、模型及工具用量、安装成本。不能用不同模型的结果直接归因于框架优劣。

## 9. 来源索引

均于 2026-09-25 查阅，网页主分支内容会变化，实施选型时需固定 release/commit 再验证。

- [S1 BMAD 官方仓库](https://github.com/bmad-code-org/BMAD-METHOD)
- [S2 GitHub Spec Kit](https://github.com/github/spec-kit)
- [S3 MetaGPT 官方仓库](https://github.com/FoundationAgents/MetaGPT)
- [S4 BMAD：组织内规划](https://docs.bmad-method.org/plan/plan-inside-an-organization/)
- [S5 Hermes 官方仓库](https://github.com/NousResearch/hermes-agent)
- [S6 Pi 官方仓库](https://github.com/earendil-works/pi)
- [S7 DeepSeek Harness 官方介绍](https://www.deepseek.com/harness/)
- [S8 LangGraph 持久化](https://docs.langchain.com/oss/python/langgraph/persistence)
- [S9 LangGraph interrupt 参考](https://reference.langchain.com/python/langgraph/types/interrupt)
- [S10 CrewAI Flows](https://docs.crewai.com/en/concepts/flows)
- [S11 DeepSeek Harness 子 Agent 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)
- [S12 Agent Skills 规范](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx)
- [S13 Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [S14 Tauri 分发](https://v2.tauri.app/distribute/)
- [S15 Tauri macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/)
- [S16 BMAD：规划路径及产物](https://docs.bmad-method.org/plan/choose-a-planning-path/)
