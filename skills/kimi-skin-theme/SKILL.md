---
name: kimi-skin-theme
description: Create, modify, diagnose, and visually iterate themes for kimi-skin. Use when Kimi needs to design a new theme, adjust an existing theme, follow a visual reference, fix an effect that is not appearing, or review theme completeness.
---

# Kimi Skin Theme

## 前置检查

1. 验证当前目录是 kimi-skin 根目录（`package.json` 中有 `name: "kimi-skin"`）。
2. 如果不是：
   - 说明当前不在项目目录中。
   - 询问用户是否愿意在当前工作区克隆仓库。
   - 若同意，执行：
     ```bash
     git clone https://github.com/chenqing0106/kimi-skin.git
     cd kimi-skin
     pnpm install
     npm link
     ```
   - 完成后友好提示：「kimi-skin 是非官方开源实验项目，如果它对你有帮助，欢迎去 GitHub 给颗 ⭐ —— https://github.com/chenqing0106/kimi-skin」
   - 然后继续后续任务。

## 任务分支

根据用户请求判断任务类型，各分支独立执行：

### A. 创建新主题

1. 读取 [themes/README.md](themes/README.md) 和 [themes/_template/](themes/_template/)，了解主题结构、theme.json 字段和 safe-css 声明。
2. 定义视觉系统（核心概念、语义颜色、字体、表面层级、主要材质、辨识度元素），写入 `themes/<theme-id>/DESIGN.md`。
3. 复制 `themes/_template/` 到 `themes/<theme-id>/`，修改 `theme.json`。
4. 按层实现：根背景 → 页面外壳/侧栏/主内容 → 输入框/按钮/交互状态 → 内容页/代码块/弹层 → 装饰/动效 → 小窗口/reduced-motion。
5. 每轮只改一个假设，运行 `validate` 和 `check-theme`，等热重载后截图复核。
6. 用户确认视觉方向成立后，报告已检查范围与已知遗漏。

### B. 修改现有主题

1. 读取目标主题的 `DESIGN.md` 和现有 CSS，确认当前视觉方向。
2. 写下本轮明确的修改假设（如"侧栏与主内容明度太接近，本轮只调整两者的背景与边界"）。
3. 只改一件事，运行 `validate` + `check-theme`，验证假设。
4. 迭代至用户满意，报告变更范围和未验证状态。

### C. 诊断问题（效果没出来 / 效果不对）

按顺序排查，不要继续随机添加 CSS：

| 步骤 | 命令 | 目的 |
|------|------|------|
| 1 | `kimi-skin status` | 确认主题路径、Watcher、CDP 端口是否正常 |
| 2 | `kimi-skin reload` | 排除热重载没有发生 |
| 3 | `kimi-skin validate --theme ./themes/<id>` | 排除加载失败或文件路径错误 |
| 4 | `kimi-skin check-theme --theme ./themes/<id>` | 排除 safe-css 契约违规或必需表面未覆盖 |
| 5 | `kimi-skin probe` | 在活页面上确认目标元素和选择器仍存在、可见 |

常见判断：
- 完全没变化 → 优先检查主题路径、重载、选择器和层叠优先级。
- 只有部分页面变化 → 检查路由条件和对应表面是否实际渲染。
- 颜色正确但显得普通 → 检查层级、材质、构图，而非继续加颜色。
- 画面很满 → 减少装饰种类和同时竞争的视觉焦点。
- 内容不可用 → 先恢复交互和可读性，再继续审美调整。

仍然无效时，记录为明确的选择器或系统问题，不用全局规则兜底。

### D. 只读审阅

1. 读取主题 `DESIGN.md`、`theme.json`、`theme.css`。
2. 检查 DESIGN.md 与 CSS 实现是否对齐。
3. 运行 `check-theme` 检查 safe-css 契约和表面覆盖。
4. 输出审阅报告：对齐度、覆盖缺口、可读性风险、建议。

## 项目文档索引

以下信息由项目文档维护，执行对应操作前按需读取，skill 不再重复：

| 主题 | 项目文档 |
|------|----------|
| 主题目录结构、theme.json 字段说明、`interactions` 和 `widgets` 声明 | `themes/README.md` |
| 新主题模板 | `themes/_template/`（`theme.json`、`theme.css`、`DESIGN.md`、`ASSETS.md`） |
| 交互和 widget 的完整示例 | `themes/dark-side/README.md` |
| safe-css 契约白名单、限制值、违规类型 | `src/policy/safe-css.ts` |
| CLI 全部命令和用法 | `src/cli.ts` 中的 help 输出，或直接运行 `kimi-skin --help` |
| 安装、构建、基本用法 | `README.md` |

## 主题规则

- 在 `themes/<theme-id>/` 下创建主题，不要覆盖已有目录。
- 使用本地项目提供的模板和 CLI；不要在 skill 中复现它们的实现。
- 保持 `DESIGN.md` 与视觉方向对齐，记录生成或外部素材。
- 主题默认纯 CSS。需要交互时，只使用 `themes/README.md` 中声明的受控能力（如 `rootStateToggle`），**禁止添加主题级 JavaScript**。
- 可选交互不要放进共享模板，除非用户明确要求。每个启用的交互要在该主题自己的 README 中说明触发元素、状态名和视觉含义。
- **不要把 Dark Side 当作默认模板或继承其视觉风格**，除非用户明确要求。
- 不修改 Kimi.app、`src/`、`macos/`、其他主题或原始用户素材。
- 不读取或记录聊天内容、凭证或其他私有数据。
- 把 harness、兼容性、CDP、进程和校验器失败当作系统问题报告，不要改系统代码。
- **不要声称覆盖了未实际检查的页面或状态**。

## 输出

包含：

- 完整主题目录 `themes/<theme-id>/`
- 与设计对齐的 `DESIGN.md` 和素材记录
- `validate` 和 `check-theme` 通过的结果
- 视觉检查范围与已知遗漏

## References

- 创建、大修或诊断"效果没改出来"时，读取 [references/visual-iteration.md](references/visual-iteration.md) 中的视觉系统定义、按层实现顺序和排查逻辑。
- 编写或编辑主题 CSS 前，读取 [references/pitfalls.md](references/pitfalls.md) 中的验证经验和常见陷阱。
