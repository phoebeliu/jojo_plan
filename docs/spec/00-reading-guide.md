# jojo plan · 替身计划 — 开发交接包

基线：JP-1.1｜2026-09-25｜状态：前六项决定已确认；根据用户反馈修订对话交互与扩展设计，待审阅

用户授权：在其休息期间继续推演至开发团队可以按文档开发；缺失信息按建议处理，单独记录待拍板事项；文档检查后提交本地 Git。本授权用于本次文档工作，不等于授权未来真实生产发布、费用支出或客户数据处理。

## 阅读顺序

| 顺序 | 文档 | 使用者与用途 |
| --- | --- | --- |
| 1 | [待用户拍板](01-owner-decisions.md) | 用户先看默认选择、影响和更改时机 |
| 2 | [调研补充与选型](02-research-and-adrs.md) | 产品/架构理解选型依据及实测缺口 |
| 3 | [PRD](03-prd.md) | 全员共同的产品范围、规则、验收目标 |
| 4 | [UI/UX 设计规格](04-ux-spec.md)及[界面板](../design/screenboard.html) | 设计/前端实现页面与状态；界面板是设计交付物 |
| 5 | [团队交底](05-team-briefing.md) | 角色职责、交接与分歧处理 |
| 6 | [系统分析设计](06-system-design.md) | 组件、架构、数据流和主要时序 |
| 7 | [数据模型](07-data-model.md)及[建表规格](schema.sql) | 后端/数据实现实体、关系和约束 |
| 8 | [接口契约](08-api-contracts.md)及[JSON Schema](contracts.schema.json) | 前后端、运行服务和 Agent 适配契约 |
| 9 | [工作流与 Agent 规范](09-workflows-and-agents.md) | 阶段流转、任务、上下文和权限 |
| 10 | [安全、运行与发布](10-security-and-operations.md) | 本地权限、恢复、交付与发布策略 |
| 11 | [测试分析设计](11-test-design.md) | 测试范围、数据、故障注入和质量门槛 |
| 12 | [研发计划与追踪矩阵](12-development-plan.md) | 可执行工作包、依赖及验收映射 |
| 13 | [交接审阅报告](13-readiness-review.md) | 自检证据、限制与开工顺序 |
| 14 | [对话、执行与工作包扩展](15-conversation-and-extension.md) | 主对话、子代理、进程、消息生效与PPT扩展契约 |
| 附录 | [交付物内容契约](14-artifact-content-contracts.md) | 各类产物必需内容、最终审核团队与覆盖规则 |

旧的 research.md、prd-draft.md、product-proposal.md 等保留为需求演变材料。当前实现以本目录 JP-1.1 为准；不合并旧稿的开放项来覆盖这里的默认决定。外部事实以来源为依据；内部接口和参数是本项目设计。

这份交接包允许团队开始实现，未宣称真实用户验收、模型实测或生产演练完成。基础兼容性验证是研发 P0 工作包，不阻止按稳定的内部契约实现领域逻辑。

JP-1.1 重点先看 [新交互设计](04-ux-spec.md) 与 [扩展协议](15-conversation-and-extension.md)。原14页改为统一对话主线与按需详情；开发团队以本版界面ID和52个命令为准。JP-1.0压缩包保留作历史，不能混用两版契约。

2026-10-02更新：[Design Edition 02品质审阅](../design/quality-review.md)记录视觉重构、交互自检及获奖品质目标。工作区入口仍为同一个screenboard.html；配套CSS/JS需一起保留。

## S1补充（2026-10-02）

定位与设计增加 S1 补充：[战略阅读入口](../strategy/00-readme.md)与[交付闭环规格](16-delivery-contract.md)。与JP-1.1共同阅读，接口数量和运行底座不变。

2026-10-08：当前界面表现以[Design Edition 03审阅](../design/edition-03-review.md)及同路径screenboard为准。设计检查与真实运行验收分开，JP-1.1和S1领域契约继续配套阅读。

## S2补充（2026-10-09）

2026-10-09最新补充：[S2研究与定位](../strategy/07-personal-ai-intelligent-ui.md)、[Personal AI与Intelligent UI规格](17-personal-ai-intelligent-ui.md)、[Edition04设计审阅](../design/edition-04-review.md)。基础JP-1.1不变；S2新增存储/命令未纳入原SQL/API Schema，实施前须版本化扩展。

## 2026-10-09实施更新

当前实现与验收见[原生应用入口](../implementation/README.md)和[实际阶段报告](../implementation/phase1-review.md)。v2第一阶段31命令与旧v1完整52命令分开。

## 2026-10-10 MVP 实施更新

[0.2.0运行入口](../implementation/README.md)、[MVP实际验收](../implementation/mvp-review.md)与[新增范围待拍板项](../implementation/mvp-owner-decisions.md)是当前可执行范围依据。v2现有35命令，加入材料导入/读取、批准Skill复用和系统返工；仍与旧v1完整52命令分开。七阶段团队现已可运行，首个执行栈限无外部依赖Node Web/API；不是原完整技术栈/生产发布能力全部完成。
