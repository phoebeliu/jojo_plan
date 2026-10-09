# 竞品事实、替代方案与反证

核查日期 2026-10-02。方法：三轮桌面研究，读取厂商官网、官方文档或官方仓库。没有安装并运行这些竞品，没有横向性能、成本或质量测量。页面动态更新；发布比较稿前复核。文档中没看到某项能力不等于产品没有，也不等于插件无法做到。

## 第一轮：用户点名的四个产品

| 产品 | 官方已描述的能力与来源 | 对 jojo 的实际威胁 | 合理选择它的情形 |
| --- | --- | --- | --- |
| Hermes | 桌面应用覆盖 macOS；技能、记忆、工具与 Agent 有图形入口。[H1](https://hermes-agent.nousresearch.com/desktop)；技能、子代理、定时任务、MCP 见[H2](https://hermes-agent.nousresearch.com/docs/user-guide/features/overview/) | 「桌面 + 会成长的技能助手」不是空白；积累方法本身也不独家 | 希望通用个人助理、跨会话记忆和广泛自动化 |
| DeepSeek Harness | 插件化 harness，有 Web UI，处于 developer preview。[D1](https://github.com/deepseek-ai/deepseek-harness)；后台任务有 jobs 子系统。[D2](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/jobs.md) | 工作区、后台 jobs、可扩展工具不是壁垒；我们的界面可借鉴可观测性 | 喜欢自行组合插件和执行环境的开发者 |
| Codex | 支持可检查的子代理活动与自定义 Agent。[O1](https://learn.chatgpt.com/docs/agent-configuration/subagents)；Goals 支持围绕验收标准持续执行和验证。[O2](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex) | 「一直做到完成」「多 Agent」「按验收工作」均不能宣称独创 | 以代码库研发、修复和可验证技术任务为主 |
| Claude Code | 官方描述计划、构建、验证、技能、记忆、MCP、多种使用界面与后台代理。[C1](https://code.claude.com/docs/en/overview)；Agent Teams 仍有实验性说明。[C2](https://code.claude.com/docs/en/agent-teams) | 「模拟团队接需求」可由已有工具与方法组合实现 | 已熟悉 Claude 工具链、希望贴近现有工程环境 |
| jojo plan 当前 | 本地文档、数据/API 设计、静态交互演示；未实现真实 Agent 运行 | 正在与已可使用的工具比较，成熟度有显著差距 | 目前适合参与需求评审，不能要求用户迁移生产工作 |

上述是能力核查，不是综合排名。Codex 的部分旧文档入口已转到共享的 ChatGPT Learn；只采用明确标注 Codex 可用的条目，不把 ChatGPT Work 的云端能力自动算到每种 Codex 客户端。Claude Teams 的实验性不代表其全部子代理功能都实验性。DSH preview 不代表其后台任务不可用。

## 第二轮：主动寻找能推翻定位的替代品

**BMAD 比单个 Agent 更接近我们的原始设想。** 官方已有产品、架构、UX、开发、测试视角，以及从规划到审查、修正的交付路径，还可放进现有编码工具。因此「虚拟研发团队」不成立为独家卖点。[B1：官方仓库](https://github.com/bmad-code-org/BMAD-METHOD)

**Spec Kit 已覆盖规格驱动和可扩展流程。** 官方描述 Specify、Plan、Tasks、Implement、Converge，跨产物分析、多种 Agent 集成及扩展机制。不能声称竞争者只会写代码，或只有 jojo 支持文档/PPT 等非编码扩展。[S1：官方文档](https://github.github.com/spec-kit/)

**需求追溯和变更影响分析也不是新发明。** Jama Connect 能分析变更对上下游条目的影响。因此我们的机会是降低 AI 交付场景中建立、维护这些关系的操作成本，而非发明关系图。[J1：官方帮助](https://help.jamasoftware.com/ah/en/manage-content/coverage-and-traceability/run-impact-analysis.html)

## 第三轮：更强的比较问题

应比较「jojo」与「用户最熟悉的 Agent + BMAD/Spec Kit 或等价方法 + Git/测试工具」，不是拿一个空白聊天框作陪衬。还要比较纯交付模板/插件：如果轻量插件能获得相同收益，独立桌面应用可能不是合适产品形态。

| 原候选卖点 | 核查后判定 | 改为怎样的产品要求 |
| --- | --- | --- |
| Mac 界面、聊天和 Agent 列表 | 基础体验，非差异 | 保留；突出当前阻碍交付的事项 |
| 自主写 Skill、经验复用 | 有强同类能力 | 记录适用边界、验收失败与回归样本，证明复用更可靠 |
| 产品/设计/架构/开发/测试流水线 | 方法工具已有 | 按复杂度启用，不能每篇短文都走完整研发仪式 |
| 自动验收、始终坚持完成 | 已有目标与验证机制 | 把「针对哪个输入版本的哪条要求、由谁用什么验证」做成可审查关系 |
| 跨模型与多工作类型 | 易复制的架构能力 | 降低交接成本；PPT 复用同一验收模型，不增导航 |
| 版本绑定的证据链与影响分析 | 亦有成熟先例 | 作为待验证的组合体验；必须测建立关系的成本、遗漏和误报 |

## 可公开的差异表达

jojo **计划重点优化**一个交付负责人跨研究、文档和工程产物进行验收与变更的体验。尚无证据证明四款产品不能提供相似工作流，也无证据证明我们的组合更优。潜在差异在默认体验、关系维护质量与负责人总投入，而非能否调用同一个模型。

开放研究缺口：各竞品在我们的真实任务上表现如何；插件能否低成本重现闭环；跨项目关系维护误差；使用者是否愿意维护验收条件。由[对照实验](05-validation-plan.md)回答，不由官网阅读推断。以上来源不证明任何市场规模、使用率或付费意愿。

## S2补充（2026-10-09）

[S2研究](07-personal-ai-intelligent-ui.md)补充Google Personal Intelligence、Generative UI、A2UI、Claude与OpenAI记忆。记忆、可携带资料和生成界面已有强竞品，不作为独家卖点。
