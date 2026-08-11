# Dark Side

`dark-side` 使用主题系统的可选 `rootStateToggle` 能力提供首页双击 ASCII 模式。ASCII 是当前主题对通用状态的具体解释，其他主题默认不会加载这个交互。

## 双击 ASCII 模式

[theme.json](./theme.json) 显式声明了首页 Logo 作为触发目标：

```json
{
  "interactions": {
    "rootStateToggle": {
      "triggerSelector": ".home-view .doodle",
      "state": "ascii"
    }
  }
}
```

双击 Logo 后，注入器会在根节点设置：

```html
<html data-kimi-skin-state="ascii">
```

视觉样式在 [theme.css](./theme.css) 中通过这个属性限定，只修改首页 Logo 和标题：

```css
html[data-kimi-skin-state="ascii"] .home-view .doodle {
  /* ASCII 或像素 Logo */
}

html[data-kimi-skin-state="ascii"] .home-view .greeting {
  /* 像素字体 */
}
```

再次双击会恢复普通样式。热重载会清理旧监听器并保留当前模式，`restore` 会清理监听器和根节点属性。

## 素材

- `assets/kimi-ascii.png`：参考 Kimi 首页小人生成的透明像素版本。
- `assets/fonts/fusion-pixel-10px-zh-hans.woff2`：[Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font) 10px 简体中文等宽版本，使用 SIL Open Font License 1.1；许可证保存在 `assets/fonts/OFL.txt`。
