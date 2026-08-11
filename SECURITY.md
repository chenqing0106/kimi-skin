# 安全策略

## 范围

kimi-skin 是非官方的实验性主题工具，只通过本机 Chrome DevTools Protocol（CDP）通道与 Kimi 桌面端交互。本文档说明安全模型、项目行为边界，以及漏洞报告方式。

## 安全模型

harness 长期保持以下不变量，任何削弱这些边界的贡献都会被拒绝：

- **不修改应用包** — 不写入 `/Applications/Kimi.app`，不解包或替换 `app.asar`，不触碰 Kimi 的代码签名和更新机制。
- **只绑定回环** — CDP 调试端口只绑定本机回环地址，启动时动态分配，并校验端口属于 harness 启动的 Kimi 进程树。
- **不碰用户数据** — 主题不读取、保存或上传聊天内容、Cookie、凭证和 API Key。主题是受限 CSS：禁止 `@import`、禁止远程 URL、禁止 JavaScript。
- **恢复可验证** — 退出主题模式会停止 Watcher、移除主题、关闭调试实例、普通重启 Kimi，并复核官方可执行文件摘要。任何一步无法验证时，harness 停止操作而不是猜测。

## 支持版本

- 仅在 macOS 上验证过 Kimi 桌面端 **3.1.7**。
- Kimi 更新后必须先重新检查兼容性再应用主题。`node dist/cli.js doctor` 会报告检测到的版本。

## 报告漏洞

如果你发现安全问题——尤其是可能触及用户数据、突破回环边界或修改应用包的问题——请**不要**开公开 issue，通过 GitHub Security 页面的 "Report a vulnerability" 私密渠道报告，并附上：

- 受影响的版本和环境（macOS 版本、Kimi 版本）
- 复现步骤
- `node dist/cli.js doctor` 和 `node dist/cli.js status` 的输出

我们会在 72 小时内确认收到报告。
