# 对话、执行与工作包扩展协议

JP-1.1｜落实用户2026-09-25反馈。本文补齐对话生命周期、Agent观察与类型扩展，旧版的14页导航和固定kind枚举被本版替代。业务审批、版本/证据、预算、工具隔离维持原约束。

## 1. 对象边界与生命周期

一个Project含多个WorkItem；一个WorkItem对应一个主Conversation。主对话跨阶段、跨重试持续存在。主协调Agent是运行角色，Conversation是业务记录；上下文窗口裁剪不能删除用户记录或已确认事实。子代理每个attempt有隔离运行上下文，其可见消息带attemptId存储；不创建独立全局工作入口。

工作包由(kind, version)确定，work_item锁定该组合，workflow_run.config_json保存包摘要、模板版本、角色/技能/模型/能力选择快照。运行后不能更换kind/version；新版本对新工作生效。草稿切换类型先预览丢弃的未启动计划，保留用户输入与附件。包可禁用新启动，但不删除被历史工作引用的版本；撤销工具权限即时阻止新工具操作。

关系：WorkTypeVersion → WorkItem → Conversation → Message；WorkItem → WorkflowRun → StageRun → Task(parentTaskId) → RunAttempt → ToolOperation → ExecutionProcess。父子任务关系用于责任与取消范围；task_dependency仍独立表达执行先后，不能以树替代DAG。

## 2. 发送、排队和介入的精确定义

conversation.send只接受已有workId、客户端messageId、正文、已导入attachmentVersionIds、可选targetTaskId。sender由可信用户入口确定；正文长度1–20,000（附件消息可写说明）。服务在事务内验证项目归属、写入消息/事件和去重记录，返回messageId、conversationId、state=accepted、revision、eventSequence；落盘前不显示发送成功。重试相同ID/内容返回同一结果，不同内容返回IDEMPOTENCY_CONFLICT。

accepted → queued → applied 或 needs_action。消息创建后原文不可变；后续纠正发新消息。调度服务为每工作按消息seq逐条分发；运行中等待下一个工具/模型调用前的安全边界，最多只保留已派发操作继续结束。applied表示内容已纳入指定目标的下一轮输入快照，不意味着成果已完成或用户已批准。落盘状态变更、appliedAttemptId和appliedAt应与派发输入快照同事务；崩溃后不得二次应用为新指令。未有可用目标/目标已结束/工作已取消时标needs_action并说明下一步，不能静默丢弃。

暂停期间消息保留queued，恢复后应用；终态工作接收消息为needs_action，引导创建后续工作或变更。首次草稿的消息可存储，但work.start前不派发Agent；启动计划/预算/权限仍需确认。定向补充只作用于目标任务及后续重试；若影响共享范围，则协调者提出变更。并发两条补充按seq处理，冲突不得自行混合成新要求。

对已批准基线的实质修改：协调者根据消息提出change.preview，卡片展示受影响项；只有change.apply成功才令旧任务失效并重排。未应用的补充不能驱动在旧批准版本上越范围写代码。一般解释性追问可答复，不改基线。聊天中的确认句不调用baseline.decide或release.authorize。

主协调者和子代理输出使用服务内部append接口，trusted runtime标记sender=agent及attemptId；客户端不能指定sender。连续delta先以(attemptId, upstreamSequence)去重，最长500ms或4KB批量落盘，final原子封存；中断显示interrupted。未落盘片段重启后可能丢失，UI不得显示已保存。最终正文不可变；状态、应用位置单独更新。

## 3. 执行树、日志和控制

execution.snapshot(workId,cursor?)返回snapshotSequence与节点数组，节点含id、parentId、kind(coordinator/task/attempt/tool/process)、entityId、label、state、lastActivityAt、summary、detailsRef。节点ID带类型前缀，parentId只引用同工作节点；当前页树最多500节点，更多节点通过execution.snapshot的cursor分页加载。节点超过限额返回truncated=true并提供游标，不静默遗漏。cursor绑定同一snapshotSequence，服务保留快照60秒；过期返回CURSOR_EXPIRED并要求重新获取快照。客户端取齐快照分页后，重放大于该snapshotSequence的事件。

根coordinator是可观察的编排投影，可为idle/waiting/running；不宣称一个模型始终后台思考。子代理来自持久化task/attempt。process只由ToolBroker创建，包含容器/执行器ID、PID(可空)、启动/退出时间、状态、退出码。运行服务或模型网络请求不是OS进程时不要虚构PID。

execution.logs(processId,afterSeq,limit)返回已脱敏chunk数组(id,seq,stream,text,createdAt)、nextSeq、hasMore、truncatedBeforeSeq。默认100/max200块，每块UTF-8不超过16KB；每进程默认10MB环形保留，丢弃最早块并更新truncatedBeforeSeq，UI明确截断。需长期保留的测试证据由独立不可变artifact保存，不依赖环形日志。脱敏失败时丢弃原文并保存redaction_failed提示，禁止先落原始秘密再遮盖UI。工具输出内容始终是数据，不能作为UI脚本或权限指令。

execution.cancelTask(taskId,reason)由可信用户触发，目标范围为该task及递归子任务；服务同事务写取消意图和事件、阻止新子任务派发，再向活跃attempt发abort。依赖任务标blocked/waiting；兄弟任务不受影响。10秒后未结束本地受控进程执行容器内终止；外部副作用转核对，不显示已撤回。cancelTask返回operationId及pending，最终状态通过事件跟进；completed的目标返回当前终态不重新改变历史。树循环/跨项目parent/多父关系均拒绝；最大深度4、单工作最多1000任务、并发额度含协调者的模型调用与所有子代理，不能靠嵌套绕过。

事件增补：conversation.message_created、conversation.message_updated、execution.process_changed、execution.log_available、worktype.changed。都复用全局seq；消息正文和日志从读取接口取，事件只带引用与revision。断线按游标补，快照和增量按snapshotSequence去重。过程汇总不伪造模型隐藏推理。

## 4. 工作包契约：扩展业务，而不是扩展导航

见 [注册清单](work-type-registry.json) 与 [清单Schema](work-type.schema.json)。字段：kind、version、label、status、templateRef、roles、skills、requiredCapabilities、artifactKinds、viewerKeys、exportFormats。version为不可变包版本；skills为版本化选择器，work.start解析并锁定真实skillVersionIds，缺失必需项返回CAPABILITY_MISSING。清单里的*-core@1.0.0是待W-10/W-20实现的内置技能包标识，不代表已有可执行技能文件；研发必须实现并通过验证，不能用空包满足依赖。模板和角色配置随包发行，哈希进入运行快照；status仅控制新启动可用性。

首版包随应用审核发布，禁止manifest直接带可执行脚本、shell片段、远程模块URL或任意HTML。kind为[a-z][a-z0-9-]{1,63}，服务查注册表；数据库用外键替换三值CHECK。接口接受合法key，注册不存在返回WORK_TYPE_UNKNOWN；规划中返回WORK_TYPE_UNAVAILABLE。未知合法key通过语法校验但不能开始执行，这是语法与业务校验的区别。

渲染器是应用代码中经过审核的viewerKey注册表，artifactKind映射到viewerKey；未知viewer只显示元数据/受控下载，不执行文件内容。工具适配器同样由broker能力注册表解析。普通工作包只组合已有能力；若引入PPTX等新格式，必须开发导出、渲染与安全检查适配器，包不能自行获得权限。缺能力可保存草稿并显示差项，但不能运行依赖步骤。

## 5. PPT作为具体扩展验收样例（后续，不算本版生成能力）

输入：主题、听众、演讲目的/时长、页数范围、企业模板、资料和可引用图片范围；未知项可建议并记录。工作流：intake → storyline → slide-content → layout-render → verify → review → delivered。最少角色协调者/研究/叙事/设计/审阅；可按任务实际需要裁减，不能只为动画虚构团队。

产物：brief、storyline、slide-deck-spec（逐页标题/目的/内容/来源/演讲备注/版式）、editable-pptx、page-previews、render-review。PPTX必须可打开编辑，页数与spec一致，字体替代/溢出/遮挡/缺图经真实渲染核查；没有渲染器只能交付草案，不标已交付PPT。来源和授权跟随图片/数据保留；审阅后新改一页也要使相应渲染与整包交付摘要失效。

接入步骤：①开发并注册pptx.generate、pptx.render能力及安全预览；②添加工作包与模板、锁定技能；③安装可编辑导出和页面预览/演讲备注渲染器；④运行合成材料端到端、文件打开、视觉与证据测试；⑤验证通过后status从planned转enabled。导航组件、会话服务、调度器不因“presentation”新增switch分支。用户仍在原对话看到故事线、设计子代理和成果，点击PPT卡看页面缩略图。

本版注册表将presentation标planned，例子仅用于描述和负向验收，不能出现在可启动列表。自动推荐如识别PPT应解释尚不可用，并可由用户选择先写大纲（新document工作），不能悄悄换成交付完成。

## 6. 接口补充及错误

| 方法 | 请求 | 响应/规则 |
| --- | --- | --- |
| worktype.list | includePlanned:boolean | items为已验证manifest；全局只读可projectId=null |
| conversation.list | workId,afterSeq?,limit? | conversationId,messages,nextSeq,hasMore；seq为对话内递增序号，非事件seq |
| conversation.send | workId,messageId,text,attachmentVersionIds,targetTaskId? | messageId,conversationId,state,revision；不等价work.start |
| execution.snapshot | workId,cursor? | nodes,snapshotSequence,truncated,nextCursor；只读快照 |
| execution.logs | processId,afterSeq,limit? | chunks,nextSeq,hasMore,truncatedBeforeSeq；同项目授权 |
| execution.cancelTask | taskId,reason | operationId,state；expectedRevision对应task |

work.create增加workTypeVersion，kind由注册表验证；初版三个内置包version=1.0.0。data.export.format变为格式注册key，导出时检测能力/产物，不能因字符串允许pptx就宣称支持。读取不需要expectedRevision；conversation.send为追加，expectedRevision=null，采用messageId幂等而不因背景事件增长丢消息。除worktype.list外新接口均须projectId并核验所有引用归属。新增错误WORK_TYPE_UNKNOWN、WORK_TYPE_UNAVAILABLE、TARGET_FINISHED、TREE_LIMIT、CURSOR_EXPIRED；日志已截断作为成功返回附截断字段，不冒充完整。

## 7. 持久化与实现顺序

schema.sql整合work_type_version、conversation、conversation_message、execution_process、process_log_chunk五张表，以及task.parent_task_id和work_item.work_type_version。服务校验同工作归属、树无环、状态机、权限及注册能力，SQL提供外键/唯一/基本状态/不可变内容保护，不声称仅靠DDL完成业务校验。

当前没有运行中的应用DB，建表规格按JP-1.1新建；若工程已用JP-1.0建试验库，先备份、暂停运行、事务重建work_item并回填三类版本1.0.0，再增加消息/进程表；旧工作生成空主对话及“导入历史工作”系统消息，旧任务保持parent=NULL，不能伪造历史聊天。外键核验、完整性检查失败回滚。真正迁移实现与恢复测试属于W-02/W-19。

## 工作区常驻执行栏（用户补充）

对话上方常驻显示“当前工作 · N个智能体工作中 · M个后台Job”，不随聊天滚动消失。数字按钮可分别打开Agent树和后台Job列表；旁边显示活跃角色摘要、排队或待核实提示。切换工作后只统计当前workId，不混入其他项目；0显示0，状态尚未加载/断连显示“同步中/数据截至时间”，不能用0冒充未知。

智能体数按当前工作有效running attempt去重，等待工具结果的活跃attempt仍计入；纯等待子任务事件的协调器、排队任务和历史尝试不计。后台Job是持久化工具操作的后台执行单元，例如容器校验、导入解析、导出或发布；同一个operationId及其子进程只计一次，模型流式回答不计Job。M为已派发且尚未终结的后台操作数；排队、待核实单独显示，不与运行中相加。智能体和Job分别统计，不能相加当作工作总数。

execution.snapshot结果增加activitySummary={activeAgentCount,runningJobCount,queuedJobCount,uncertainJobCount,asOfSequence,observedAt}及jobs数组，来源与树使用同一快照。后台操作必须记录executionMode=background及workId（持久化为tool_operation.execution_mode和work_id；服务验证work与project及attempt归属一致），不能由前端看名称猜测；列表将操作intent显示为queued，其余映射为running/uncertain/succeeded/failed/cancelled；数据库沿用intent状态。Job详情显示operationId、所属Agent/attempt（系统任务可为空）、名称、状态、开始时间、最后活动、执行器、进程引用、结果/日志引用。历史分页复用执行快照游标；终态从活跃计数移除但保留记录。收到operation/process/attempt事件后更新同一投影；重连先核对再显示状态。

W-19/T-43追加验收：长对话滚动仍可见执行栏；两个Agent共享一个后台操作只计一个Job；一个Job有多个进程不重复计数；失败/退出/断线恢复后计数与列表一致；其他项目任务不混入；空闲协调者不虚增活跃数量。设计稿“2个智能体、1个Job”为演示数据。
