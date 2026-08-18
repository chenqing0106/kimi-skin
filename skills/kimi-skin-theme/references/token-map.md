# Kimi 状态 token

基础模板只映射最常用角色。遇到具体页面或交互状态仍沿用原生颜色时，按需补充下列 token；不要为了“完整”一次性全部写入主题。

- 页面背景：`--Bg-GroundPC`、`--Bg-GroundPC-hover`、`--Bg-GroundPC-active`
- 主要表面：`--Bg-Primary`、`--Bg-Primary70`、`--Bg-Primary90`，以及各自的 `-hover`、`-active`
- 次级表面：`--Bg-Secondary`、`--Bg-Secondary90`、`--Bg-Tertiary`、`--Bg-Quaternary`，以及各自的 `-hover`、`-active`
- 组合表面：`--BgGp-Primary`、`--BgGp-Secondary`、`--BgGp-Tertiary`，以及各自的 `-hover`、`-active`
- 文字层级：`--Labels-Primary`、`--Labels-Secondary`、`--Labels-Tertiary`、`--Labels-Quaternary`，以及各自的 `-hover`、`-active`
- 分隔线：`--Separators-S1`、`--Separators-S1-hover`、`--Separators-S1-active`
- 填充层级：`--Fills-F1`、`--Fills-F2`、`--Fills-F3`、`--Fills-F4`，以及各自的 `-hover`、`-active`
- 子层背景：`--Others-SubLayerBg`、`--Others-SubLayerBg-hover`、`--Others-SubLayerBg-active`
- 品牌浅底：`--Others-LightBlueBg`、`--Others-LightBlueBg-hover`、`--Others-LightBlueBg-active`
- 主强调色：`--Colors-KMBlue`、`--Colors-KMBlue-hover`、`--Colors-KMBlue-active`

先在真实页面确认哪个原生 token 仍在生效，再映射对应角色。深色块同时显式声明文字色和背景色；具体陷阱见 [pitfalls.md](pitfalls.md)。
