# kimi-skin

> 非官方社区实验项目，与 Moonshot AI（月之暗面）没有关联，也未获其授权或认可。“Kimi”商标归其所有者所有。项目仍处于 alpha 阶段。

为 Kimi macOS 桌面端提供可恢复、低侵入的自定义主题能力。

kimi-skin 通过本机 Chrome DevTools Protocol 向 Kimi Work Renderer 注入受限 CSS，不修改 Kimi.app、不解包 `app.asar`，恢复后会关闭调试会话并以普通方式启动 Kimi。

当前只支持 **macOS、Kimi 3.1.7 和 Work 界面**。

## 下载与使用

从 Releases 下载 `kimi-skin-<version>-macos.zip` 并解压。完整包提供三个双击入口：

- `macos/Apply Theme.command`：检查环境、选择并应用 `themes/` 中的主题
- `macos/Check Status.command`：查看 Kimi、主题和 Watcher 状态
- `macos/Restore Kimi.command`：移除主题并恢复普通 Kimi

这些脚本复用 Kimi 自带的签名 Node 运行时，不要求普通用户另外安装 Node.js。切换主题前需要先恢复当前主题会话。

仓库当前包含 **Dark Side · 月之暗面**：黑白半调点阵、月相序列和 ECG 心跳线。

## 从源码运行

要求 Node.js 22+ 和 pnpm：

```bash
pnpm install
pnpm check
pnpm test
pnpm build
pnpm release:pack
```

`release:pack` 会先完成检查、测试和干净构建，再生成可直接分发的 macOS zip。

常用命令：

```bash
node dist/cli.js doctor                              # 检查环境
node dist/cli.js themes                              # 查看已有主题
node dist/cli.js apply                               # 交互选择主题
node dist/cli.js apply --theme ./themes/dark-side    # 直接指定主题
node dist/cli.js reload                              # 立即重新注入
node dist/cli.js status                              # 查看状态
node dist/cli.js restore                             # 恢复普通 Kimi
```

`apply` 会在重启 Kimi 前请求确认。主题目录中的 CSS、清单或素材变化后，Watcher 会自动热重载。

## 主题

每个可运行主题位于 `themes/<theme-id>/`：

```text
theme.json
theme.css
assets/        # 可选，本地图片素材
```

背景图可在 `theme.json` 中通过 `background` 声明，也可完全使用 CSS。主题可使用本地 PNG、JPEG 和 WebP 素材，但不能加载远程资源、`@import` 或 JavaScript。声明 `safe-css` 能力的主题会在加载时执行白名单契约；使用 `check-theme` 查看具体违规和界面覆盖情况。

```bash
node dist/cli.js validate --theme ./themes/<theme-id>
node dist/cli.js check-theme --theme ./themes/<theme-id>
node dist/cli.js probe
```

仓库内的 `skills/kimi-skin-theme/` 用于让 AI Agent 创建和修改主题。目前仍在整理，具体工作流以 [SKILL.md](./skills/kimi-skin-theme/SKILL.md) 为准。

## 边界

- 不修改 Kimi.app、代码签名、更新机制、登录状态或用户内容
- 不读取、保存或上传聊天内容、Cookie、凭证和 API Key
- 调试端口只绑定本机回环地址
- Kimi 版本不兼容或关键状态无法验证时停止应用
- 暂不支持 Chat 网页、Windows、自动主题切换和图形化主题管理器

完整威胁模型与漏洞报告方式见 [SECURITY.md](./SECURITY.md)。

## License

[MIT](./LICENSE) © kimi-skin contributors
