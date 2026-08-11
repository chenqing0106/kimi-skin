# Dark Side

`dark-side` 使用主题系统的可选能力提供首页双击 ASCII 模式和 Kimi Work 额度监视器。两项能力都由当前主题显式声明，其他主题默认不会加载。

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

## Kimi Work 额度监视器

[theme.json](./theme.json) 通过固定组件类型和固定位置启用监视器：

```json
{
  "widgets": [
    {
      "id": "work-quota",
      "type": "kimi-work-quota",
      "surface": "home.top-right"
    }
  ]
}
```

组件显示在首页右上角，不参与标题、Logo 和输入框的文档流布局。它只读调用 Kimi Renderer 已有的 `getDatasourceQuota()`，显示 Kimi Work 总额度的剩余比例和重置时间；首次加载、每 60 秒以及窗口重新可见时刷新。

当前桥接接口不提供“我的额度”设置页里的 5 小时和 7 天 Code 明细，因此组件不抓取设置页，也不伪造这两组数据。读取失败且有历史值时显示 `STALE`，没有历史值时显示 `NO SIGNAL`。

主题只能选择内置的 `kimi-work-quota` 组件和 `home.top-right` 槽位，不能在 manifest 中提供 HTML、脚本、接口名或自定义数据源。额度 DOM、读取逻辑、刷新和清理由主题运行时统一管理，`dark-side` 的 [theme.css](./theme.css) 只负责视觉。

## 素材

- `assets/kimi-ascii.png`：参考 Kimi 首页小人生成的透明像素版本。
- `assets/fonts/fusion-pixel-10px-zh-hans.woff2`：[Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font) 10px 简体中文等宽版本，使用 SIL Open Font License 1.1；许可证保存在 `assets/fonts/OFL.txt`。
