# jojo plan · 替身计划

AI 项目负责人的个人交付替身：按你认可的方法组织工作，用可追溯的依据验收，并提供适合当前任务的交互。个人化与效率优势仍待真实任务验证。

当前已有 **Jojo Plan 0.2.0 可本机试用 MVP**，支持有来源的 Skill/文档交付与七阶段受限系统研发。完整产品文档为JP-1.1＋S2；已实现范围见[运行入口](docs/implementation/README.md)。

- [开发交接包：阅读入口](docs/spec/00-reading-guide.md)
- [需要用户拍板的默认方案](docs/spec/01-owner-decisions.md)
- [产品需求规格](docs/spec/03-prd.md)
- [UI/UX 设计规格](docs/spec/04-ux-spec.md) / [对话工作区交互设计稿](docs/design/screenboard.html)
- [系统分析设计](docs/spec/06-system-design.md)
- [研发计划与需求追踪](docs/spec/12-development-plan.md)
- [交接审阅与验证结果](docs/spec/13-readiness-review.md)

完整文档、SQL/JSON契约和设计素材均在 docs/。历史讨论文档保留作背景，实施以 docs/spec/ JP-1.1 为准。用户未确定的内容已有建议默认值，见待拍板清单。真实模型、安装/发布和领域评测仍须在对应研发工作包中验证。

本轮修订：前六项决定已确认；统一任务对话、可展开的Agent/进程详情、工作包扩展。写PPT已定义后续接入方式，未承诺首版生成能力。

2026-10-02：交互设计升级为 **Design Edition 02**，包含统一视觉体系、常驻执行栏、角色协作卡、快捷搜索和可操作演示。参阅[品质审阅与检查记录](docs/design/quality-review.md)。

战略修订 S1：[为什么值得存在](docs/strategy/00-readme.md) · [竞品研究](docs/strategy/01-competitive-research.md) · [投资人备忘录](docs/strategy/03-business-and-moat.md) · [用户与推广材料](docs/strategy/04-audience-and-launch.md)。当前为设计阶段，没有已验证护城河。

2026-10-08：最新设计为 **Design Edition 03**。交付状态常驻，依据可定位到版本与样本，变更可预演，交接清单与缺口一起查看。入口仍为[交互设计稿](docs/design/screenboard.html)，详见[本轮设计审阅](docs/design/edition-03-review.md)。

2026-10-09：最新定位为 **S2 Personal Delivery AI**，设计为 **Edition 04**。[最新研究与护城河机制](docs/strategy/07-personal-ai-intelligent-ui.md) · [实施补充规格](docs/spec/17-personal-ai-intelligent-ui.md)。新增个人准则、经验候选和可解释情境推荐；该条描述当时的静态演示；现已实现有来源的持久个人准则和受控情境视图，仍未验证自动长期学习。

2026-10-09：[实际阶段验收](docs/implementation/phase1-review.md)，包括真实模型、退出恢复、变更失效与打包后App实测。安装包在release/，二进制不提交源码Git。

2026-10-10：[MVP 运行与安装](docs/implementation/README.md) · [真实验收报告](docs/implementation/mvp-review.md) · [新增待拍板项](docs/implementation/mvp-owner-decisions.md)。三条交付路径已跑通；系统执行范围、模型/发行限制以本次报告为准。
