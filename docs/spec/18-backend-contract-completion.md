# S2.1 后端闭合契约及第一阶段实施范围

2026-10-09。原JP-1.1保持为完整产品目标。第一阶段实现子集及S2新增命令采用独立、严格Schema，避免把原52命令误报为全部实现。

机器契约：[phase1.schema.json](../../packages/contracts/phase1.schema.json)，唯一生成源[contract-source.mjs](../../packages/contracts/contract-source.mjs)。基础迁移为原45表，增量[002-personal-ui.sql](../../packages/storage/migrations/002-personal-ui.sql)增加7表。第一阶段独立传输版本为schemaVersion=2（旧52命令设计保持v1，不宣称载荷兼容）。所有请求包含schemaVersion/requestId/projectId/expectedRevision；未知字段/脚本/未知组件拒绝。

## 完整约束

memory.list/propose/confirm/correct/disable/forget/export/validateMethod、context.preview/configure、viewIntent.propose/explain/pin/unpin的输入全部在Schema。列表无正文跨项目；来源必须存在并与scope匹配，personal来源不得是restricted材料。用户可信入口可确认/纠正/禁用/遗忘，Agent仅可提出候选/视图，不能审批、启用方法、调预算或改权限。候选不注入；confirmed且未过期、未禁用、method已验证且启用个人化才可入新上下文。

方法验证须关联同项目真实test_evidence版本与当前有效检查结果，不接受模型文字冒充runner。每个使用记录绑定memory revision、work、attempt，纠正按新revision；已确认项纠正回到proposed，必须重新确认。忘记在事务内清空所有revision正文/来源，写最小tombstone、清理未来使用；不承诺撤销外部模型已收到的信息。恢复须合并本机tombstone并重建上下文，不恢复旧发布授权。

ViewIntent只允许6组件；reason必须是同工作记录、memory refs必须属于当前可用集合，目标指纹与当前工作一致。过期/旧目标拒绝。组件payload由服务读可信对象，不接受HTML/脚本/URL/命令。固定只固定类型，不冻结数据；编辑/阅读的推荐由用户接受安全边界更新。

## 结果、并发与错误

响应{requestId,ok,result?,error?,eventSequence}。业务错误VALIDATION/NOT_FOUND/SCOPE_DENIED/REVISION_CONFLICT/IDEMPOTENCY_CONFLICT/STALE_BASELINE/STALE_VIEW/METHOD_UNVALIDATED/BUDGET_EXCEEDED/PERMISSION_REQUIRED/PROVIDER_FAILED；错误不含密钥、服务堆栈或原始供应商错误。创建/read expectedRevision=null；现有对象修改必须当前revision。相同requestId同摘要返回原响应，不同摘要冲突。领域事务、事件及幂等响应原子提交；模型工作先持久化运行意图并立即返回。

UI无Node与通用IPC；renderer仅预定义命令。main核验本窗口来源与主frame，safeStorage保管API密钥；utility service唯一写DB，Pi独立上下文不接受宿主文件工具。Codex本机桥接仅作为既有登录的可选模型传输，以只读、无工具、无插件、ephemeral模式使用合成/明确授权输入，不读取或迁移登录凭据。

## 生命周期与验收

迁移有版本记录，在事务应用，失败回滚；启动将未完成attempt标uncertain、工作暂停，禁止自动重放模型/发布；用户选择恢复时新attempt，沿用已保存要求/成果/历史。每次模型调用预留上限，未知用量保守锁住预算；退出终止受控进程。变更apply重核preview指纹，原子失效有关baseline与待执行任务；历史审批保留，新目标不得继承旧通过。

第一阶段目标是一个文档/Skill文本工作项的真实闭环：生成→独立检查→绑定指纹用户审阅→变更后重验→交接ZIP→退出/重启恢复。系统容器研发、搜索/OCR、多格式排版、生产发布、签名公证仍是后续工作包，不冒充第一阶段已实现。安装验收先提供本机可运行的arm64应用，正式分发签名身份需用户提供。

UI、模型输出和静态检查都不能自动做业务通过判断：确定性检查验证格式/必需章节等明确条件，语义与专业结论由绑定版本的用户审阅负责。真实验收证据单独记录。

现已补上memory.configureGlobal、memory.runRegression、budget.reconcile、data.backup/restore。备份按私有目录UUID引用与checksum核验，不接受任意路径；恢复合并本机遗忘墓碑、移除缓存正文，不重放中断任务。方法回归必须正反例、预留预算与用户允许发送，可信本机runner形成证据后仍须显式验证启用。31个已实现第一阶段命令与旧完整产品52命令分开。

003迁移增加消息purpose和准则适用类型。任务补充绑定实际attempt；准则来源不当作普通补充回送。上下文预览即使同requestId也重查可用准则；其他幂等写入返回原响应。审批指纹包含输入、成果及检查版本。

响应包络机器规范见[response.schema.json](../../packages/contracts/response.schema.json)。各方法实体结果按持久模型与源码投影返回；此Schema严格验证成功/错误包络，不冒充已经描述所有完整产品DTO。源码与实体输出映射见运行说明。

## 0.2.0 MVP 增量（2026-10-10）

同一schemaVersion=2增加material.import、material.fetch、skill.attach、system.rework，共35命令；work.start新增可选allowContainer=true，研发阶段强制检查此授权。完整机器契约见packages/contracts/phase1.schema.json，源码生成器为contract-source.mjs。

无需改动已发布三次SQLite迁移：材料与角色阶段结果使用artifact/version及不可变metadata；来源读取记录真实task/attempt/tool_operation/process。审批反馈用受信任消息attachments_json标记，仍遵守purpose原枚举，从普通补充输入指纹中排除。新材料/普通补充进入输入指纹；二者皆空时保留0.1.0原指纹，避免无要求变化的升级失效。

system.nextStage由当前输入指纹下已批准有效基线决定，七阶段按顺序推进。system.rework只能回到已经到达的阶段，失效该阶段及后续依据；不自动跳审。各阶段模型、真实检查和日志记入原持久工作树。正文/Skill门槛属于结构检查，系统研发增加源码合同及真实容器TAP门槛；所有最终语义/业务批准仍是用户动作。

源码导出从implementation的document成果取files，不能误取同阶段更晚test_evidence。固定Dockerfile只COPY合法路径文本源码，基础镜像按摘要锁定，运行无host mount/socket、无网络、非root、只读、资源/时间受限。网页读取限定公共HTTPS，DNS地址校验后固定连接IP，逐次重定向重新校验，1MB下载上限、静态正文截断与失败提示；不能冒充自动搜索发现或浏览器会话访问。

实际验收和边界以docs/implementation/mvp-review.md为准。该增量不会把原v1所有领域、能力供应商与生产集成工作包标记为完成。
