# 静态设计检查

这些脚本使用Playwright的浏览器API，检查本地交互设计，不使用应用后端，不发送任何消息给真实模型。

需要Node.js、Playwright和已安装的Chromium。若依赖不在项目node_modules，设置NODE_PATH到所在node_modules；设置JOJO_CHROMIUM为现有浏览器可执行文件。脚本从自身位置计算仓库根目录；截图和原始结果写入output/playwright。

```sh
node docs/design/checks/browser-check.cjs
node docs/design/checks/contrast-check.cjs
```

最终浏览器结果见browser-results.json（23组通过），对比度见contrast-results.json（1029个文字采样，无失败）。正式交付截图复制至docs/design；output目录只保留本地工作中间文件，不进入交付包。

对比度检查只覆盖当前可见纯色背景文字，排除渐变、装饰、禁用内容；不能替代完整辅助功能审核。浏览器检查的200%是文字样式放大，不宣称等价系统级缩放。测试中的模拟执行状态用于交互一致性检查，不是运行服务实测。
