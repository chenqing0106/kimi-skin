# Assets

本主题无位图或字体素材文件。所有图形均为 CSS 程序生成或内联 SVG data-URI：

- 首页 CAUTION 描边大字（`.home-view::after` 内联 SVG：洋红填充 + 错版黑影，手工编写）
- 警示条纹带（`.home-view::before`、`aside.sidebar::before`：repeating-linear-gradient 纯 CSS）
- 侧栏六角记号（`aside.sidebar .sidebar-footer::after` 内联 SVG，手工编写）
- 半调网点与 45° 排线（`#kimi-skin-bg` 伪元素：radial-gradient / repeating-linear-gradient 纯 CSS）

说明：项目校验器只接受 PNG/JPEG/WebP 图片素材文件，SVG 一律内联为 data-URI，
且单个属性值不超过 1024 字符、SVG 内部不使用 `url(#...)` 引用。

许可：全部图形为本主题原创，随主题一同分发。
创建日期：2026-08-15
