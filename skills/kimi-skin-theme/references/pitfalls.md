# 主题创作注意事项

改主题时必须遵守的清单。每条都来自真实界面验证过的教训；
某条被 check-theme 自动化后从这里移除，避免两处维护。

## 颜色与继承

- 深色块组件（按钮、徽章、侧栏选中项）必须成对显式声明 `color` + `background`，不要依赖继承——token 重映射后，继承来的文字色可能与底色同色（墨压墨）。
- 文字、背景、边框的 token 要连同 `-hover` / `-active` 一起映射；漏掉的状态会回落到原生色，在主题色上显得突兀。
- 整页截图看不出小元素的文字可读性。按钮、徽章、切换件要用 CDP 探测计算样式（`color` / `backgroundColor`），或放大裁剪核对。

## 表面与容器

- 边框、背景、阴影只给外壳元素，不要连带 `.composer > *`、`[class*="editor"]` 这类后代通配——内部 wrapper（editor-wrap、composer-toolbar 等）会被刷上同样的边框和底色，形成多层嵌套描边和突兀分割线。后代要显式压平：`border: none; background: transparent; box-shadow: none; backdrop-filter: none`。
- 改表面颜色前，用 `scripts/probe-surface.mjs`（skill 内置，沿祖先链逐层报 `backgroundColor`）找到真正不透明的容器再动手：`.composer-dock`、`.conv-header` 这类原生容器带不透明 token 底色，盖在半透明主面板上会出现色块断层。统一透明化，让底色从主面板透出。
- 同一组件的不同状态（默认 / focus）底色要一致或平滑过渡；状态提示只改描边和光晕，点击瞬间底色跳变会非常突兀。
- 滚动渐隐遮罩（`conversation-title-marquee`、`sidebar-scroll-top-mask`、sidebar-footer）的渐变色必须跟随所在容器的底色，昼夜两态各配一份——沿用原生渐变会在主题底色上露出断层。

## 装饰与布局

- 装饰元素只锚定在不滚动的容器上（sidebar-footer、main-pane），不要固定在滚动列表上方——列表一满必重叠。
- 装饰不压内容：有装饰的区域，要么留真实布局空间，要么确认重叠在视觉上可接受。
- 素材优先用 CSS/SVG 程序生成；单个属性值不超过 1024 字符。
- SVG data-URI 内部不能再出现 `url(...)`（包括 `url(#id)` 滤镜引用），校验器会把它当成缺失的外部素材。

## 验证流程

- 不猜选择器。先写 probe 脚本确认元素存在、类名和计算样式，再写 CSS。
- 每轮只改一件事、只验证一个假设；改完跑 `validate` + `check-theme`，等 2–3 秒热重载后截图复核。
- hover、focus、disabled 态要单独验证可读性，静态截图通过不算完。
- 用户内容、头像、插件图标保持原样；只有暗色主题才考虑反相亮模式插图。
