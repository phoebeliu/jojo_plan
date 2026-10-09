# 静态设计检查

这些脚本使用Playwright的浏览器API，检查本地交互设计，不使用应用后端，不发送任何消息给真实模型。

需要Node.js、Playwright和已安装的Chromium。若依赖不在项目node_modules，设置NODE_PATH到所在node_modules；设置JOJO_CHROMIUM为现有浏览器可执行文件。脚本从自身位置计算仓库根目录；截图和原始结果写入output/playwright。

```sh
node docs/design/checks/browser-check.cjs
node docs/design/checks/contrast-check.cjs
```

最终浏览器结果见browser-results.json（23组通过），对比度见contrast-results.json（1029个文字采样，无失败）。正式交付截图复制至docs/design；output目录只保留本地工作中间文件，不进入交付包。

对比度检查只覆盖当前可见纯色背景文字，排除渐变、装饰、禁用内容；不能替代完整辅助功能审核。浏览器检查的200%是文字样式放大，不宣称等价系统级缩放。测试中的模拟执行状态用于交互一致性检查，不是运行服务实测。

S1增加交付约定、变更预演、应用后旧依据失效、跨工作不串状态以及重置示例检查；24组浏览器检查。四种宽度亦覆盖交付详情。新增截图delivery-contract、change-preview、change-applied。检查仍只覆盖静态演示；不验证真实baseline事务、模型或专业结论。

2026-10-08 Edition03：browser-check包含26组检查；edition03-check另检查四条新增模态/阅读路径。contrast-check覆盖依据定位、交接清单及变更前后。新增截图evidence-locator、handoff-preview。原版本的24组记录为历史。新增的edition03-results.json同样只验证静态设计，不声明真实运行或获奖。

## S2补充（2026-10-09）

2026-10-09 Edition04新增edition04-check.cjs，验证本次暂停不跨工作、候选接受后仍待验证、固定不冻结交付状态、项目隔离与新面板适配。其结果只代表静态规则演示，不证明真实Personal AI或生成UI。
