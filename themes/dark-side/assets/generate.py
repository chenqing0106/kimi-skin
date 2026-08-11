#!/usr/bin/env python3
"""dark-side 主题素材生成器。

生成官网海报式 1-bit 点阵半调素材（纯黑白，无彩色）：
  - ../background.png      全屏底色：纯黑虚空 + 底部抖动颗粒衰减 + 稀疏星尘
  - darkmoon.png           点阵月球主视觉：半调明暗半球 + 点阵轨道环 + 十字星芒
  - moons.png              七枚半调月相（新月 -> 满月）
  - fade-down.png          8px 宽抖动垂直衰减 tile（备用）

主题源文件是 ../theme.css，通过相对路径 url("assets/*.png") 引用素材，
harness 加载时自动重写为 data URI，本脚本不参与 CSS 拼装。
"""
import math
import os
import random
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
THEME_DIR = HERE.parent

PAPER = (243, 243, 239, 255)
VOID = (5, 5, 5, 255)


def find_font(env_var: str, candidates: list[str]) -> str:
    """按环境变量 -> 候选路径顺序解析字体，找不到时给出明确报错。"""
    override = os.environ.get(env_var)
    if override:
        return override
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    raise SystemExit(f"找不到可用字体，请通过环境变量 {env_var} 指定字体文件路径")

# Bayer 8x8 有序抖动矩阵
BAYER = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
]


def bayer(x: int, y: int, cell: int = 1) -> float:
    return BAYER[(y // cell) % 8][(x // cell) % 8] / 64.0


# ---------------------------------------------------------------- background
def gen_background() -> Path:
    """960x600，纯黑 + 底部 45% 抖动衰减到深灰 + 稀疏星尘。"""
    w, h = 960, 600
    img = Image.new("RGB", (w, h), VOID[:3])
    px = img.load()
    y0 = int(h * 0.55)
    for y in range(y0, h):
        t = (y - y0) / (h - y0)  # 0 -> 1
        for x in range(w):
            if bayer(x, y, cell=2) < t:
                px[x, y] = (14, 14, 14)
    rng = random.Random(1973)
    for _ in range(150):
        x, y = rng.randrange(w), rng.randrange(int(h * 0.7))
        v = rng.choice([38, 46, 58, 72])
        px[x, y] = (v, v, v - 2 if v > 4 else v)
    for _ in range(14):  # 几颗稍亮的星
        x, y = rng.randrange(w), rng.randrange(int(h * 0.6))
        px[x, y] = (118, 118, 112)
    out = THEME_DIR / "background.png"
    img.save(out, optimize=True)
    return out


# ------------------------------------------------------------------ darkmoon
def cjk_font() -> str:
    return find_font(
        "KIMI_SKIN_FONT_CJK",
        [
            str(Path.home() / "Library/Application Support/kimi-desktop/daimon-share/daimon/runtime/python/fonts/NotoSansCJKsc-Bold.otf"),
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/STHeiti Light.ttc",
        ],
    )


def gen_dot_text(text: str = "月之暗面", rows: int = 22) -> Path:
    """海报同款点阵大字：文字渲染成掩膜 -> 降采样到点阵网格 -> 逐点绘制。"""
    from PIL import ImageFont

    font = ImageFont.truetype(cjk_font(), 240)
    probe = ImageDraw.Draw(Image.new("L", (8, 8)))
    bbox = probe.textbbox((0, 0), text, font=font)
    w0, h0 = bbox[2] - bbox[0], bbox[3] - bbox[1]
    mask = Image.new("L", (w0 + 40, h0 + 40), 0)
    ImageDraw.Draw(mask).text((20 - bbox[0], 20 - bbox[1]), text, font=font, fill=255)

    cols = max(1, round(w0 / h0 * rows))
    grid = mask.resize((cols, rows), Image.LANCZOS)

    cell, dot_r, scale = 5, 1.6, 2
    out = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    draw = ImageDraw.Draw(out)
    for y in range(rows):
        for x in range(cols):
            if grid.getpixel((x, y)) > 105:
                cx, cy = x * cell + cell / 2, y * cell + cell / 2
                draw.ellipse(
                    [cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r],
                    fill=(243, 243, 239, 52),
                )
    out = out.resize((out.width * scale, out.height * scale), Image.NEAREST)
    out_path = HERE / "dot-text.png"
    out.save(out_path, optimize=True)
    return out_path


def gen_darkmoon() -> Path:
    """官网海报式点阵月球：半调明暗半球 + 倾斜点阵轨道环 + 十字星芒。

    220x130 像素画，4 倍放大 -> 880x520，透明底。纯黑白，无彩色。
    """
    w, h, scale = 220, 130, 4
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    cx, cy, r = 108, 66, 40
    lx, ly = -0.55, -0.75  # 光从左上方来，右下为「暗面」

    # 球体点阵：3px 网格，密度随明暗衰减，亮部点更大
    for gy in range(0, h, 3):
        for gx in range(0, w, 3):
            dx, dy = gx - cx, gy - cy
            if dx * dx + dy * dy > r * r:
                continue
            nx, ny = dx / r, dy / r
            light = max(0.0, min(1.0, 0.55 + 0.62 * (nx * lx + ny * ly))) ** 1.35
            if bayer(gx, gy) < light:
                size = 2 if light > 0.72 else 1
                for ox in range(size):
                    for oy in range(size):
                        if gx + ox < w and gy + oy < h:
                            px[gx + ox, gy + oy] = PAPER

    # 抖动光晕：球外一圈 Bayer 衰减
    for gy in range(h):
        for gx in range(w):
            d = math.hypot(gx - cx, gy - cy)
            if r < d <= r + 18 and px[gx, gy][3] == 0:
                t = 1 - (d - r) / 18
                if bayer(gx, gy) < t * 0.26:
                    px[gx, gy] = (243, 243, 239, int(130 * t))

    # 倾斜点阵轨道环：上半藏于球后，下半从球前掠过
    rot = math.radians(-16)
    rx, ry = 84, 22
    for deg in range(0, 360, 2):
        t = math.radians(deg)
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        x = cx + ex * math.cos(rot) - ey * math.sin(rot)
        y = cy + ex * math.sin(rot) + ey * math.cos(rot)
        xi, yi = int(round(x)), int(round(y))
        if not (0 <= xi < w and 0 <= yi < h):
            continue
        dx, dy = xi - cx, yi - cy
        inside = dx * dx + dy * dy <= (r - 1) * (r - 1)
        if inside and yi < cy:
            continue  # 球后方
        px[xi, yi] = (243, 243, 239, 190 if inside else 150)

    # 十字星芒
    for sx, sy, a in [
        (30, 28, 190), (56, 100, 120), (176, 24, 210), (194, 92, 110),
        (152, 112, 90), (18, 66, 110), (204, 52, 90),
    ]:
        for ax, ay in [(0, 0), (0, 1), (0, -1), (1, 0), (-1, 0), (0, 2), (0, -2), (2, 0), (-2, 0)]:
            if 0 <= sx + ax < w and 0 <= sy + ay < h:
                px[sx + ax, sy + ay] = (243, 243, 239, a)

    img = img.resize((w * scale, h * scale), Image.NEAREST)
    out = HERE / "darkmoon.png"
    img.save(out, optimize=True)
    return out


# ----------------------------------------------------------------------- sky
def gen_meteor() -> Path:
    """点阵流星：头部 2x2 亮点 + 向左上衰减的拖尾。48x14，3 倍放大，透明底。"""
    w, h, scale = 48, 14, 3
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    hx, hy = 44, 9
    for ox in range(2):
        for oy in range(2):
            px[hx + ox, hy - oy] = PAPER
    px[hx + 2, hy + 1] = (243, 243, 239, 160)  # 头部微光
    for i in range(1, 41):
        x = hx - i
        y = hy - int(round(i * 0.2))
        if not (0 <= x < w and 0 <= y < h):
            continue
        alpha = int(210 * (1 - i / 42))
        if i > 26 and bayer(x, y) < (i - 26) / 14:  # 尾部抖动消散
            continue
        px[x, y] = (243, 243, 239, alpha)
    img = img.resize((w * scale, h * scale), Image.NEAREST)
    out = HERE / "meteor.png"
    img.save(out, optimize=True)
    return out

def gen_sky() -> Path:
    """主页顶部装饰：两道点阵轨道弧 + 十字星芒 + 稀疏星尘。

    440x64 像素画，3 倍放大 -> 1320x192，透明底，纯黑白。
    """
    w, h, scale = 440, 64, 3
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()

    def arc(cx, cy, rx, ry, alpha, step=2):
        for deg in range(0, 360, step):
            t = math.radians(deg)
            xi = int(round(cx + rx * math.cos(t)))
            yi = int(round(cy + ry * math.sin(t)))
            if 0 <= xi < w and 0 <= yi < h:
                px[xi, yi] = (243, 243, 239, alpha)

    # 两道从顶部掠过的轨道弧（圆心在画布下方远处）
    arc(220, 210, 260, 178, 150)
    arc(118, 260, 300, 232, 100)

    # 十字星芒
    rng = random.Random(73)
    for _ in range(9):
        sx, sy = rng.randrange(8, w - 8), rng.randrange(4, h - 8)
        a = rng.choice([90, 120, 150, 190])
        for ax, ay in [(0, 0), (0, 1), (0, -1), (1, 0), (-1, 0), (0, 2), (0, -2), (2, 0), (-2, 0)]:
            if 0 <= sx + ax < w and 0 <= sy + ay < h:
                px[sx + ax, sy + ay] = (243, 243, 239, a)

    # 稀疏星尘
    for _ in range(60):
        x, y = rng.randrange(w), rng.randrange(h)
        if px[x, y][3] == 0 and bayer(x, y) < 0.5:
            px[x, y] = (243, 243, 239, rng.choice([50, 70, 90]))

    img = img.resize((w * scale, h * scale), Image.NEAREST)
    out = HERE / "sky.png"
    img.save(out, optimize=True)
    return out


# ---------------------------------------------------------------- ascii field
def mono_font() -> str:
    return find_font(
        "KIMI_SKIN_FONT_MONO",
        [
            str(Path.home() / "Library/Application Support/kimi-desktop/daimon-share/daimon/runtime/python/.venv/lib/python3.12/site-packages/matplotlib/mpl-data/fonts/ttf/DejaVuSansMono.ttf"),
            "/System/Library/Fonts/Menlo.ttc",
            "/System/Library/Fonts/Monaco.ttf",
        ],
    )


ASCII_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ0123456789#$%&*+-=<>[]{}?/|~^:;.@"


def gen_charset_sprite(frames: int = 3, fw: int = 468, fh: int = 288) -> Path:
    """官网同款随机 ASCII 字符场：frames 帧横向拼接成 sprite，CSS steps 跳帧即闪烁。

    调色板量化后存 PNG，控制 base64 体积。
    """
    from PIL import ImageFont

    font = ImageFont.truetype(mono_font(), 22)
    cell_w, cell_h = 18, 24
    rng = random.Random(2023)
    alphas = [60, 85, 115, 150, 190]
    weights = [4, 4, 4, 3, 2]

    sprite = Image.new("RGBA", (fw * frames, fh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(sprite)
    for f in range(frames):
        for row in range(fh // cell_h):
            for col in range(fw // cell_w):
                if rng.random() > 0.38:
                    continue
                ch = rng.choice(ASCII_CHARS)
                a = rng.choices(alphas, weights)[0]
                draw.text(
                    (f * fw + col * cell_w, row * cell_h),
                    ch,
                    font=font,
                    fill=(243, 243, 239, a),
                )
    sprite = sprite.quantize(colors=6, method=Image.Quantize.FASTOCTREE)
    out = HERE / "charset.png"
    sprite.save(out, optimize=True)
    return out

def gen_edge_texture(side: str) -> Path:
    """从原创月表线条素材裁出左右稀疏边缘纹理。

    亮度转 alpha（纸白幽灵纹理），内缘与底缘做淡出。
    """
    src = Image.open(HERE / "src" / "lunar-edge-source.png").convert("L")
    w0, h0 = src.size
    if side == "left":
        crop = src.crop((0, 100, int(w0 * 0.24), h0 - 70))
    else:
        crop = src.crop((int(w0 * 0.76), 100, w0, h0 - 70))

    # 稍微降采样让点阵更粗
    crop = crop.resize((int(crop.width * 0.72), int(crop.height * 0.72)), Image.LANCZOS)
    w, h = crop.size

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px_in, px_out = crop.load(), out.load()
    for y in range(h):
        for x in range(w):
            lum = px_in[x, y]
            if lum < 14:
                continue
            a = min(200, int(lum * 0.6))
            # 内缘水平淡出
            if side == "left":
                fx = 1.0 if x < w * 0.5 else max(0.0, 1 - (x - w * 0.5) / (w * 0.5))
            else:
                fx = 1.0 if x > w * 0.5 else max(0.0, x / (w * 0.5))
            # 底缘垂直淡出
            fy = 1.0 if y < h * 0.68 else max(0.0, 1 - (y - h * 0.68) / (h * 0.32))
            px_out[x, y] = (243, 243, 239, int(a * fx * fy))

    out_path = HERE / f"edge-{side}.png"
    out.save(out_path, optimize=True)
    return out_path


# --------------------------------------------------------------------- moons
def gen_moons() -> Path:
    """七枚半调月相横排，99x9，3 倍放大 -> 297x27，透明底。"""
    n, r, gap = 7, 4, 6
    w = n * (r * 2 + 1) + (n - 1) * gap
    h = r * 2 + 1
    densities = [0.04, 0.18, 0.34, 0.50, 0.66, 0.82, 0.97]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for i, density in enumerate(densities):
        cx = i * (r * 2 + 1 + gap) + r
        cy = r
        for y in range(h):
            for x in range(w):
                dx, dy = x - cx, y - cy
                d2 = dx * dx + dy * dy
                if d2 <= (r - 1) * (r - 1):
                    if bayer(x, y) < density:
                        px[x, y] = PAPER
                elif r * r - 1 <= d2 <= r * r + 1:
                    px[x, y] = (243, 243, 239, 150)  # 轮廓
    img = img.resize((w * 3, h * 3), Image.NEAREST)
    out = HERE / "moons.png"
    img.save(out, optimize=True)
    return out


# ------------------------------------------------------------------ fade tile
def gen_fade() -> Path:
    """8x96 抖动垂直衰减（上实下虚），RGBA。"""
    w, h = 8, 96
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        target = 1 - y / h
        for x in range(w):
            if bayer(x, y) < target:
                px[x, y] = VOID
    out = HERE / "fade-down.png"
    img.save(out, optimize=True)
    return out


def main() -> None:
    images = (
        gen_background(),
        gen_darkmoon(),
        gen_sky(),
        gen_meteor(),
        gen_edge_texture("left"),
        gen_edge_texture("right"),
        gen_dot_text(),
        gen_moons(),
        gen_fade(),
        gen_charset_sprite(),
    )
    for p in images:
        print(f"{p.relative_to(THEME_DIR)}  {p.stat().st_size} B")


if __name__ == "__main__":
    main()
