# 主题开发

每个可运行主题位于独立目录中：

```text
themes/<theme-id>/
├── theme.json
├── theme.css
└── assets/        # 可选，本地素材
```

## 本地素材和字体

主题可使用 PNG、JPEG、WebP、WOFF2、WOFF、TTF 和 OTF 文件。所有素材必须位于主题目录内，不能通过远程 URL、绝对路径或 `@import` 加载。

字体通过 `@font-face` 引用本地文件，仍受单个素材 2 MiB 限额约束。中文字体建议只保留主题实际需要的字形。

```css
@font-face {
  font-family: "Theme Pixel";
  src: url("assets/theme-pixel.woff2") format("woff2");
  font-display: swap;
}
```

## 可选交互能力

主题默认只有 CSS 和本地素材，不执行 JavaScript。需要交互状态时，可以在 `theme.json` 中选择性声明由注入器实现的受控能力。

当前支持 `rootStateToggle`：双击指定元素，在 `<html>` 上切换一个主题状态。

```json
{
  "interactions": {
    "rootStateToggle": {
      "triggerSelector": ".home-view .doodle",
      "state": "alternate"
    }
  }
}
```

启用后，双击匹配元素会在以下两种状态间切换：

```html
<html>
<html data-kimi-skin-state="alternate">
```

主题通过普通 CSS 响应状态：

```css
html[data-kimi-skin-state="alternate"] .home-view .doodle {
  filter: grayscale(1);
}
```

约束：

- `triggerSelector` 必须是 `.home-view` 内的单个后代选择器，最长 512 个字符。
- `state` 只能使用小写字母、数字和连字符，最长 32 个字符。
- 事件固定为双击，主题不能提供脚本或执行任意代码。
- 未声明交互的主题不会创建监听器或交互运行状态。
- 热重载会清理旧监听器并保留同一主题的当前状态；切换主题或 `restore` 会清理状态。
- 交互的具体含义、视觉规则和素材约定，应记录在对应主题自己的 README 中。

[dark-side/README.md](./dark-side/README.md) 使用这个通用能力实现了该主题独有的 ASCII 模式。

双态主题的推荐写法（dark-side 与 pasture 均验证）：调色板变量在 `:root` 和
`html[data-kimi-skin-state="..."]` 两处各定义一份同名变量，组件规则只引用变量；
状态块只覆盖变量和个别组件特例，不为每个组件重写整套规则。

## 检查

```bash
kimi-skin validate --theme ./themes/<theme-id>
kimi-skin check-theme --theme ./themes/<theme-id>
```
