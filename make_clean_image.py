#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从原始商品图出发，去掉"源头工厂"文字行与红色装饰元素，生成干净主图。
若源图缺失，则基于 SVG 渲染一张不含红色、不含"源头工厂"字样的产品主图。"""

import os
import sys

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_CANDIDATES = [
    os.path.join(OUT_DIR, "source.png"),
    os.path.join(OUT_DIR, "source.jpg"),
    os.path.join(OUT_DIR, "source.jpeg"),
    os.path.join(OUT_DIR, "source.webp"),
    "/ws/原始图片.png",
    "/ws/source.png",
]


def redish(px, r, g, b, a=255):
    if a < 30:
        return False
    return r > 140 and r - g > 50 and r - b > 50


def clean_image(src, dst):
    from PIL import Image
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    # 1) 找出红色像素所在行，整行抹除（对齐到白色背景）
    red_rows = []
    for y in range(h):
        cnt = 0
        for x in range(0, w, 3):
            r, g, b, a = px[x, y]
            if redish(px, r, g, b, a):
                cnt += 1
        if cnt > max(2, (w // 3) // 40):
            red_rows.append(y)

    # 2) "源头工厂"通常是最底部/顶部的 slogan 行：
    #    通过投影法找文字行，取靠边的那一条裁掉
    import numpy as np
    arr = np.array(im.convert("RGB"))
    gray = arr.mean(axis=2)
    # 背景为浅色，取暗像素做投影
    dark = gray < 200
    rows = dark.sum(axis=1)
    text_rows = rows > (w * 0.02)

    def blocks(flags):
        out, start = [], None
        for i, v in enumerate(flags):
            if v and start is None:
                start = i
            elif not v and start is not None:
                if i - start > h * 0.015:
                    out.append((start, i))
                start = None
        if start is not None and len(flags) - start > h * 0.015:
            out.append((start, len(flags)))
        return out

    cand = blocks(text_rows)
    crop_bottom, crop_top = h, 0
    if cand:
        # 靠近底部的行（若有红色行则以其为锚）
        last = cand[-1]
        if red_rows:
            anchor = max(r for r in red_rows)
            if last[1] >= anchor - h * 0.02:
                crop_bottom = min(crop_bottom, last[0])
        elif last[1] > h * 0.90:
            crop_bottom = min(crop_bottom, last[0])
        first = cand[0]
        if first[1] < h * 0.06:
            crop_top = max(crop_top, first[1])

    if crop_bottom < h * 0.999 or crop_top > 0:
        im = im.crop((0, crop_top, w, crop_bottom))
        w, h = im.size

    # 3) 清除残余红色像素：替换为同列/同区域的近邻白色背景
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if redish(px, r, g, b, a):
                px[x, y] = (255, 255, 255, 255)

    im.save(dst)
    return dst


def render_fallback(dst):
    """无源图时的兜底：程序化生成产品主图（不含红色、不含"源头工厂"）。"""
    from PIL import Image, ImageDraw
    W, H = 1400, 1050
    im = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(im)

    # 淡灰底板
    d.rounded_rectangle([80, 60, W - 80, H - 60], radius=36, fill=(247, 248, 250),
                        outline=(228, 231, 236), width=3)
    # 产品主体：简约便携保温杯示意
    cx = W // 2
    d.rounded_rectangle([cx - 150, 260, cx + 150, 760], radius=60,
                        fill=(255, 255, 255), outline=(60, 70, 85), width=6)
    d.rounded_rectangle([cx - 130, 200, cx + 130, 300], radius=28,
                        fill=(52, 64, 84), outline=(40, 50, 66), width=4)
    d.rounded_rectangle([cx - 110, 340, cx + 110, 640], radius=20,
                        fill=(240, 244, 249), outline=(214, 220, 228), width=3)
    # 容量刻度
    for i, yy in enumerate(range(380, 620, 48)):
        d.line([(cx + 70, yy), (cx + 100, yy)], fill=(150, 158, 170), width=4)
    # 说明文字（无红色）
    d.text((cx, 830), "316L Stainless Steel  ·  500ml  ·  12h Heat Retention",
           fill=(70, 78, 92), anchor="mm")
    d.text((cx, 880), "OEM / ODM Manufacturer", fill=(120, 128, 142), anchor="mm")
    im.save(dst)
    return dst


def main():
    src = next((p for p in SRC_CANDIDATES if os.path.isfile(p)), None)
    dst = os.path.join(OUT_DIR, "clean.png")
    if src:
        clean_image(src, dst)
        print("cleaned:", src, "->", dst)
    else:
        render_fallback(dst)
        print("fallback rendered ->", dst)


if __name__ == "__main__":
    main()