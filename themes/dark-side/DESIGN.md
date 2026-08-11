# Dark Side · 月之暗面

## 概念

官网海报式 1-bit 点阵半调视觉：纯黑白，无彩色。主页点阵月球 + 星弧流星 + 两侧月表纹理，侧栏月相序列 + ECG 心跳线。

## 颜色与材质

- 虚空黑底（#050505）+ 纸白点阵（#f3f3ef）
- 材质全部来自半调点阵与抖动纹理，无渐变纯色块

## 素材

全部由 `assets/generate.py` 程序化生成（依赖 PIL），`theme.css` 以相对路径 `url("assets/*.png")` 分层引用，改素材即热重载。

- `background.png` — 全屏底色：纯黑虚空 + 底部抖动颗粒 + 稀疏星尘（manifest 主背景）
- `assets/darkmoon.png` — 点阵月球主视觉
- `assets/moons.png` — 七枚半调月相
- `assets/sky.png` / `assets/meteor.png` — 星空与流星
- `assets/edge-left.png` / `assets/edge-right.png` — 由原创 AI 生成素材 `assets/src/lunar-edge-source.png` 转换的稀疏月表边缘纹理
- `assets/charset.png` / `assets/dot-text.png` / `assets/fade-down.png` — 字符点阵、点阵文字、衰减 tile（备用）
## 内容处理

不处理图片、头像和用户内容；只覆盖背景、侧栏、面板等结构性表面。

## 不做的范围

Chat 网页界面保持原始视觉；不做彩色变体。
