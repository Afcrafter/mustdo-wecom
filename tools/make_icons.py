#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 PWA 占位图标 icon-192.png / icon-512.png（暗色 #0d1117）
全出血方形（不透明）→ 同时兼容 any / maskable 用途。
字形「必」保持中心安全区内，便于系统裁切。
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = r"F:\自制项目\mustdo-wecom\public"
os.makedirs(OUT_DIR, exist_ok=True)

BG = (13, 17, 23)        # #0d1117
ACCENT = (110, 168, 254)  # #6ea8fe
FG = (230, 237, 243)      # #e6edf3
SS = 4                    # 超采样倍数

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]


def pick_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def render(size):
    S = size * SS
    cx = cy = S / 2.0

    # 1) 背景
    img = Image.new("RGBA", (S, S), BG + (255,))

    # 2) 中心柔光（多层半透明圆叠加）
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(1, 47):
        r = S * 0.36 * (i / 46.0)
        a = int(48 * (1 - i / 46.0) ** 2.2)
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT + (a,))
    img = Image.alpha_composite(img, glow)

    # 3) 外圈圆角描边
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    pad = S * 0.105
    radius = S * 0.17
    width = max(2, int(S * 0.021))
    rd.rounded_rectangle([pad, pad, S - pad, S - pad], radius=radius,
                         outline=ACCENT + (235,), width=width)
    img = Image.alpha_composite(img, ring)

    # 4) 字形「必」
    d = ImageDraw.Draw(img)
    font = pick_font(int(S * 0.46))
    txt = "必"
    bbox = d.textbbox((0, 0), txt, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), txt, font=font, fill=FG + (255,))

    return img.convert("RGB").resize((size, size), Image.LANCZOS)


for sz in (192, 512):
    out = os.path.join(OUT_DIR, f"icon-{sz}.png")
    render(sz).save(out, "PNG", optimize=True)
    print("wrote", out, os.path.getsize(out), "bytes")
