# 接口与运行契约

JP-1.0｜规范传输为 typed IPC，不是公开 REST API。机器可校验格式见 [contracts.schema.json](contracts.schema.json)。文件中 Command 的每个方法都有载荷定义；Runtime 和事件定义位于 $defs。

## 1. 通用约定

Command：{schemaVersion:1, requestId:UUID, projectId:UUID|null, method, expectedRevision:int|null, payload}。服务从可信入口确定 actor，不接受客户端自报权限。create/list 类 expectedRevision=null；修改现有对象必须匹配目标 revision，例外是 operation 幂等重查。

Response：{requestId, ok, result?, error?, eventSequence}；失败 error={code,message,retryable,details?}。列表 result={items,nextCursor}；创建返回{id,revision}；耗时动作返回{operationId,state}；获取返回实体快照及revision。错误不回显密钥、原文敏感片段或内部堆栈。

相同 requestId+规范请求摘要重复发送返回原响应；相同 requestId 不同参数返回 IDEMPOTENCY_CONFLICT。请求摘要包括 method/projectId/revision/payload，排除传输时间。下游外部动作使用持久化 operationId 作为幂等键。

命令大小 ≤1MB，文件经受控 file token 导入，不把 base64 大文件塞 IPC。常规命令超时 10s，耗时操作先返回 accepted。查询分页默认50、最大200；events.list 返回序号>afterSequence 的事件与最后游标，按项目过滤，跨项目只允许全局用户视图。

## 2. 方法及结果

| 方法 | 行为 / 主要结果 | 前置规则 |
| --- | --- | --- |
| project.create/list/get/configure/archive/delete | 项目身份、目录令牌、状态 | 根目录需用户选定；delete 先停止活跃工作 |
| work.create/get/start/control | 工作与运行快照；control=pause/resume/cancel | start 检查模型、预算及必需权限；resume 重查基线 |
| provider.list/save/check | 保存配置/密钥令牌，返回能力检测 operation | secretToken 由 main 生成；check 绑定 provider revision |
| artifact.create/import/list/read/saveDraft/publishVersion | 源文件解析 operation、版本正文、草稿 revision、新版本 | 读取受 scope 控制；publish 校验 baseVersion 未过期 |
| source.register | 导入公开URL为来源记录并触发受控抓取 | URL及重定向校验；抓取失败也保留状态 |
| baseline.submit/decide | 封存成员与摘要；用户通过/驳回或假设记录 | submit 校验必需产物；decide 携 fingerprint，旧摘要拒绝 |
| decision.resolve | 记录选项和假设/正式决定 | assume 仅 explore 可用；普通决策不能等同生产授权 |
| task.list/retry | 任务快照或新 attempt 排队 | uncertain 先核对，达到预算需调整；不覆盖历史 |
| change.preview/apply | 影响清单；原子失效并重排任务 | apply 需对应 previewFingerprint 未过期 |
| skill.list/validate/enable/groupSave | 验证 operation、启用状态、组版本草案 | enable 要当前版本检查+评审通过；groupSave 校验 DAG |
| test.run/results | 测试 operation及逐项结果 | 锁定 target/version；isSimulation 必填 |
| issue.list/update | 负责、状态、备注、证据 | closed 需对应新测试结果；accepted 只用户可执行 |
| release.targets/configure/prepare/authorize/execute/status | 目标、候选、授权、外部 attempt、状态 | 下文发布契约；禁止普通 Agent dispatcher 调 authorize |
| permission.set | 创建或撤销范围授权 | actor 必须用户；仅声明范围，不支持模型扩大 |
| events.list | {events,nextSequence} | 严格 sequence 去重，payload 经脱敏 |
| data.backup/restore/export | 后台 operation 和受控输出引用 | restore 需暂停运行；export 默认排除密钥与受限原件 |

所有方法必须校验 projectId 与 payload 引用所属项目一致；provider.list/save/check 和 project.list/create 可用 projectId=null。跨项目技能引用只读经显式共享授权，不通过传入其他项目 ID 越权。

## 3. 核心错误码

VALIDATION_FAILED、NOT_FOUND、REVISION_CONFLICT、IDEMPOTENCY_CONFLICT、BASELINE_STALE、GATE_UNSATISFIED、CAPABILITY_MISSING、PERMISSION_DENIED、BUDGET_EXHAUSTED、USAGE_UNKNOWN、OPERATION_UNCERTAIN、DEPENDENCY_CYCLE、FILE_TOO_LARGE、DISK_FULL、PROVIDER_AUTH、PROVIDER_RATE_LIMIT、PROVIDER_TIMEOUT、RUNTIME_UNAVAILABLE、RELEASE_AUTH_EXPIRED、INTEGRITY_ERROR。

只有只读操作和明确可重试的 provider 超时/限流返回 retryable=true；发布超时用 OPERATION_UNCERTAIN，必须 status 查询。401 不自动不断重试；provider 429 按 Retry-After（上限120s）或指数退避，最多3次，每次保持预算记账。

## 4. RuntimeAdapter（内部 TypeScript 接口设计）

```typescript
interface RuntimeAdapter {
  inspect(config: ModelConfigRef): Promise<CapabilityReport>;
  run(spec: RoleRunSpec, sink: RuntimeSink, signal: AbortSignal): Promise<RunOutcome>;
  reconcile(attemptId: string): Promise<Reconciliation>;
}
```

RoleRunSpec 包含 taskId/attemptId/role、objective、inputBaselineId/fingerprint、inputVersionIds、skillVersionIds、modelConfigRef/modelConfigRevision、allowedTools、maxTurns、maxOutputTokens、workspaceRef。modelConfigRef为providerId，revision必须匹配attempt持久化的配置快照，运行中不读取更新后的配置；密钥经 broker 按需提供适配器，不在 spec 或事件中传输。

RuntimeSink 只接受 message(delta/final)、toolIntent、artifactProposal、question、usage、finished。每个事件带 attemptId、sequence、timestamp；重复去重、乱序缓冲上限100，缺号超时转核对。工具由 broker 执行后返回标准 result，runtime 不自己 spawn shell。

RunOutcome=completed/needs_input/failed/cancelled，不包含 approved/delivered。完成时以结构化 JSON 给出 outputVersionProposals、checks、openQuestions、suggestedNextAction。服务校验结构及证据，最多允许一次结构纠正重试；失败保留草稿不推进。

Pi 原生 API 由适配层转换，不作为整个系统公共契约。任何取消只代表停止本地新动作，不能抹掉已发送的模型调用或外部发布。

## 5. 发布契约

prepare：校验最终验收基线有效、严重问题关闭、manifest 引用完整、target 存在；输出 candidate fingerprint。authorize：必须可信用户调用，绑定指纹、action 与过期时间（默认30分钟），一次性使用。

execute：事务消费授权并写入 tool_operation intent、release_attempt；外部调用带 Idempotency-Key=operationId、candidateDigest、environment、artifactRef。服务重启后先按 operationId 或 externalRunId 查状态。外部平台无幂等/查询能力时只支持生成发布包，不允许自动触发。

状态适配统一 queued/running/succeeded/failed/unknown；供应商字段由声明式 mapping 转换，未知值按 unknown。外部 succeeded 后进入 verifying，通过已定义 smoke checks 才设置 delivered；回滚需独立 rollback 授权或原授权中明确预授权的回滚动作（首版默认独立确认）。

## 6. 事件目录

project.changed、work.changed、run.state_changed、stage.changed、task.changed、artifact.version_created、baseline.submitted、baseline.decided、baseline.invalidated、decision.changed、operation.changed、usage.updated、test.finished、issue.changed、release.changed、permission.changed。payload 至少 entityId/revision/state?，大正文通过版本 ID 读取。

UI 先订阅/读取 lastSequence，再获取快照及snapshotSequence，丢弃≤snapshotSequence的事件并重放后续；避免快照与事件之间漏消息。sequence 是数据库提交顺序，不代表 LLM token 顺序。
