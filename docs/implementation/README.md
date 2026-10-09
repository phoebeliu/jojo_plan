# Jojo Plan 0.1.0：第一阶段开发验收版

2026-10-09。现在已有真实Electron应用和后端，设计稿仍保留在docs/design作为交互参考。该版本实现文本交付切片，不宣称完整软件研发团队、联网研究、生产发布或全产品已完成。

## 安装与开始工作

1. 解压[macOS Apple Silicon安装包](../../release/Jojo%20Plan-0.1.0-arm64-mac.zip)，将Jojo Plan.app拖入你的Applications目录。也可从release/mac-arm64直接打开。
2. 打开「模型与设置」。本机已经登录Codex时可选择该通道；首次实测就是用此通道进行合成文档任务，没有提取/迁移登录凭据。也提供OpenAI-compatible、Anthropic messages接口与本机safeStorage密钥存储；这些自带服务尚未逐供应商实测。
3. 创建项目和工作，写明目标与逐条验收标准；允许发送当前文本和适用准则后开始。
4. 阅读真实成果和结构检查依据，再批准当前版本。结构检查仅覆盖明确格式约束，不能代替语义、专业或事实审阅。
5. 修改要求先预演。旧基线和旧审批不再支持新要求；重新生成、检查和审阅后导出交接ZIP。

实际测试平台为本机Apple Silicon / macOS27.0.1。声明最低macOS14，未完成其他系统版本、Intel或干净机完整测试。安装包未使用Apple开发者签名/公证，为本机开发验收版；正式外部分发在P5完成。

## 本次已落地

- 31个严格校验的第一阶段/S2命令，独立schemaVersion=2；不冒充原完整产品52个v1命令全部实现。
- 三个事务迁移、SQLite WAL、单实例/单写服务、内容寻址与读时校验、不可变成果、要求及成果/检查版本绑定的审批指纹。
- 后端在utility process运行；Renderer无Node、无通用IPC、无网络权限，模型正文按纯文本展示。
- 有来源的个人准则，候选/确认/纠正/禁用/遗忘、有效期、项目/工作/类型范围、本次与全局开关。
- 方法正反例回归与可信依据门槛：接受候选不启用；真实runner记录通过后才能进入新上下文。
- 六种受控情境组件，提案校验、来源解释、固定/恢复推荐；编辑/阅读时不强制切换当前检查点。
- Actor权限在幂等缓存之前核验；Agent只能在可信运行作用域提出候选/视图，不可审批或操作预算。
- 本地备份、checksum验证、恢复时合并遗忘墓碑，防止旧备份复活已忘条目；忘记不等于删除原始对话或撤销已发送的模型上下文。
- 异常中断不自动重放，保留历史并暂停；用量不确定时锁住预算，用户可明确接受完整预留额度的保守计账后继续。
- 真实任务/Job/进程与日志、token已用/预留/未知，交接包包含版本与校验和、未完成项及排除项。

## 验收证据

[阶段报告](phase1-review.md)与[evidence目录](evidence/)记录结果。真实模型合成任务完成生成、重启恢复、变更失效、拒绝旧审批、重新生成和导出；安装包本身也通过原生界面触发了真实模型任务。

当前没有自动扫描屏幕/邮箱、完整自主记忆提炼、任意生成HTML、PPT生成器、PDF/DOCX排版、Web搜索/OCR、容器化系统研发、生产发布和多用户身份。System类型目前只能保存规划，不会因单独安装Docker就自动获得完整研发能力；Skill支持文本草稿，不等于完整技能组启用/执行。

## 开发命令

- npm ci：恢复锁定依赖；npm run dev：编译并启动桌面应用。
- npm run typecheck / npm test：类型与领域反例测试。
- npm run build / npm run package：构建 / 生成arm64应用及ZIP。
- node --import tsx scripts/acceptance-live.ts：两个合成真实模型调用的基础闭环；调用现有本机Codex会使用该账户额度。
- node --import tsx scripts/acceptance-method.ts：两个合成正反例的真实方法回归。
- tests/desktop.cjs：真实Electron回归；JOJO_PACKAGED_APP指定打包后可执行文件，JOJO_DESKTOP_LIVE=1增加一次真实模型调用。

Electron官方包下载慢时，scripts/download-electron.mjs按锁定44.7.0分段获取，再核对npm包自带SHA-256。不会使用未校验的残缺文件。首次安装npm依赖后若postinstall受本地策略影响，需完成官方运行时下载再启动。

模型API密钥只在本地设置输入，不提交Git。测试数据、安装二进制、依赖和构建产物不进入源码提交；发布包checksum与版本清单另记录。
