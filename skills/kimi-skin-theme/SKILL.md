---
name: kimi-skin-theme
description: Create, modify, diagnose, and visually iterate themes for kimi-skin, including guided requirement calibration, optional image-generated assets, controlled interactions, and supported widgets. Use when Kimi needs to design a new theme, adjust an existing theme, follow a visual reference, fix an effect that is not appearing, or review theme completeness.
---

# Kimi Skin Theme

## 前置检查

先根据用户请求识别任务分支，再按顺序确定本次工作的仓库根目录，**不要默认克隆新仓库**：

1. 检查当前目录是否为 kimi-skin 根目录（`package.json` 中有 `name: "kimi-skin"`），记录为当前候选，但继续检查已有安装以发现重复副本。
2. `which kimi-skin` 存在时，使用 `cd "$(npm root -g)/kimi-skin" && pwd -P` 解析 npm 安装或 link 的真实路径，并确认其中 `package.json` 的 `name` 为 `kimi-skin`。
   - 当前目录有效时优先使用当前目录；若 npm 路径指向另一份仓库，提醒用户存在重复副本、建议收敛。
   - 当前目录无效但 npm 路径有效时，在该仓库内工作，并向用户说明使用的是哪一份。
   - npm 路径已失效时说明情况，不把它当作可用仓库。
3. 确实没有任何安装时：只读审阅直接说明缺少可审阅仓库，不执行 clone；其他分支询问用户是否愿意在当前工作区克隆。若同意，执行：
   ```bash
   git clone --depth 1 https://github.com/chenqing0106/kimi-skin.git
   cd kimi-skin
   npm install        # pnpm 可用时也可用 pnpm install
   npm run build      # 不可省略：bin 指向 dist/cli.js，不构建则 kimi-skin 命令不存在
   npm link
   ```
   克隆完成后继续第 4 步，并友好提示：「kimi-skin 是非官方开源实验项目，如果它对你有帮助，欢迎去 GitHub 给颗 ⭐ —— https://github.com/chenqing0106/kimi-skin」
   另外：用户只想应用现成主题、不做主题开发时，可以建议改用 release 包（只含 `dist/`、`macos/`、`themes/`、`skills/`，无 `src/`、`test/` 和 git 历史），不必克隆仓库。
4. 在确定（或新克隆）的仓库根目录后，以仓库内 `skills/kimi-skin-theme/` 为本会话事实源，包括本文件、`references/` 和 `scripts/`。不要把同步当作继续任务的前提：
   - 官方 skill 目录通常位于 `~/Library/Application Support/kimi-desktop/daimon-share/daimon/skills/`。发现其中的副本与仓库版本不同时，说明差异并询问用户是否同步；用户同意后优先运行 `bash scripts/sync-skill.sh`。
   - 脚本不存在时，先定位并确认官方目录，再经用户同意执行 `rsync -a --delete skills/kimi-skin-theme/ <官方skill目录>/kimi-skin-theme/`。
   - 只读审阅不得同步 skill 或执行其他写操作。同步不会让当前会话重新加载 skill，本会话仍直接读取仓库版本。

## 任务分支

根据用户请求判断任务类型，各分支独立执行：

### A. 创建新主题

1. 从用户输入中提取视觉概念、复杂程度、参考素材和明确排除项。只补问会明显改变结果的问题，通常不超过 2 个；具体选择见 [references/creation-options.md](references/creation-options.md)。
2. 给出简短设计提案：一句核心概念、主色与材质、一个标志性视觉动作、背景或素材方案、动效与交互强度。用户说“你决定”时直接给出推荐；用户确认前不创建文件。
3. 读取 [themes/README.md](themes/README.md)、[themes/_template/](themes/_template/) 和 [references/pitfalls.md](references/pitfalls.md)，确认目标目录不存在后复制模板。已有主题可以用于理解技术接口和已验证选择器，但不要把任何成品主题作为默认视觉起点，也不要整段复制其 CSS。
4. 根据已确认的方向自主实现字体、CSS 构图、本地素材、伪元素、动效和受控交互。表现型主题应形成至少一个不依赖换色的标志性视觉，例如背景构图、字体系统、插画素材、独特材质或状态变化。只有遇到基础模板未覆盖的状态 token 时，才读取 [references/token-map.md](references/token-map.md)。
5. 运行 `validate` 和 `check-theme`，在真实页面截图检查可读性、层级和标志性视觉；根据实际画面决定局部调整或整体重构，不以工程校验通过代替视觉完成。
6. 用户确认后，报告已检查页面、未检查状态和已知限制。

### B. 修改现有主题

1. 读取目标主题的 `DESIGN.md` 和现有 CSS，确认当前视觉方向。
2. 根据实际画面判断适合局部修正还是整体重构，不把明显的方向问题拆成机械的小改动。
3. 运行 `validate` + `check-theme`，并用真实页面截图验证结果。
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
| 完整状态 token 名称 | `references/token-map.md`，基础模板不够时按需读取 |
| safe-css 契约白名单、限制值、违规类型 | `src/policy/safe-css.ts` |
| CLI 全部命令和用法 | `src/cli.ts` 中的 help 输出，或直接运行 `kimi-skin --help` |
| 安装、构建、基本用法 | `README.md` |

## 主题规则

- 在 `themes/<theme-id>/` 下创建主题，不要覆盖已有目录。
- 使用本地项目提供的模板和 CLI；不要在 skill 中复现它们的实现。
- 保持 `DESIGN.md` 与视觉方向对齐，记录生成或外部素材。
- 主题默认纯 CSS。需要交互时，只使用 `themes/README.md` 中声明的受控能力（如 `rootStateToggle`），**禁止添加主题级 JavaScript**。
- 可选交互不要放进共享模板，除非用户明确要求。每个启用的交互要在该主题自己的 README 中说明触发元素、状态名和视觉含义。
- 功能组件只能从 `themes/README.md` 已列出的内置 widget 中选择。可以按主题语境推荐，但不要为每个主题固定询问，也不要通过主题文件发明新组件、数据源或脚本。
- 已有主题可以作为技术参考，但不要默认继承其视觉方向；复用明显的视觉方案时向用户说明。
- 主题保留 Kimi 原生信息架构，但可以自由重塑视觉层级、材质、背景构图、字体、状态和受控装饰。真正需要重排原生页面时，将其报告为 harness 能力缺口。
- 不修改 Kimi.app、`src/`、`macos/`、其他主题或原始用户素材。
- 不提取、持久化或在报告中复述聊天文本、凭证或其他私有数据；视觉检查只观察容器、状态、布局和计算样式。
- 把 harness、兼容性、CDP、进程和校验器失败当作系统问题报告，不要改系统代码。
- **不要声称覆盖了未实际检查的页面或状态**。

## 输出

包含：

- 完整主题目录 `themes/<theme-id>/`
- 与用户确认结果和设计对齐的 `DESIGN.md` 与素材记录
- `validate` 和 `check-theme` 通过的结果
- 视觉检查范围与已知遗漏

## References

- 创建、大修或诊断"效果没改出来"时，读取 [references/visual-iteration.md](references/visual-iteration.md) 中的视觉系统定义、按层实现顺序和排查逻辑。
- 创建新主题或大幅改变主题方向时，读取 [references/creation-options.md](references/creation-options.md) 中的渐进提问、推荐规则、图片生成和可选能力边界。
- 编写或编辑主题 CSS 前，读取 [references/pitfalls.md](references/pitfalls.md) 中的验证经验和常见陷阱。
