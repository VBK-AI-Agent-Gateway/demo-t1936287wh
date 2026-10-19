#!/usr/bin/env python3
"""三档断点示意截图：按 index.html 的响应式规则（<=1140px 整张等比缩放）渲染。"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1080, 1920
BG = (5, 7, 13)
CARD = (20, 26, 43)
LINE = (38, 48, 74)
FG = (238, 242, 255)
MUTED = (159, 176, 208)
BLUE = (88, 166, 255)
GREEN = (61, 220, 151)
GOLD = (255, 209, 102)

def font(sz, bold=False):
    base = "/opt/pylibs/matplotlib/mpl-data/fonts/ttf/"
    cands = [base + ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"),
             base + "DejaVuSansMono.ttf"]
    for p in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                continue
    return ImageFont.load_default()

def render_poster():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 420], fill=(11, 15, 26))
    d.rounded_rectangle([330, 70, 750, 130], 30, outline=LINE, fill=(20, 26, 43))
    d.text((540, 100), "TWO PRODUCTS . ONE POSTER", font=font(20), fill=MUTED, anchor="mm")
    d.text((540, 230), "SPEC . PLAN . TASKS", font=font(64, True), fill=(142, 197, 255), anchor="mm")
    d.text((540, 320), "One Poster for Both Products", font=font(30), fill=MUTED, anchor="mm")
    cy, ch = 440, 760
    for i, (accent, title, sub) in enumerate([
        (BLUE, "SDD Workbench", "SPEC / PLAN / TASKS"),
        (GREEN, "Breakpoint A11y Demo", "640 / 960 / responsive"),
    ]):
        x0 = 72 + i * (488 + 30)
        x1 = x0 + 488
        d.rounded_rectangle([x0, cy, x1, cy + ch], 28, fill=CARD, outline=LINE)
        d.rectangle([x0, cy, x1, cy + 6], fill=accent)
        d.text((x0 + 38, cy + 60), f"PRODUCT 0{i+1}", font=font(18, True), fill=MUTED)
        d.text((x0 + 38, cy + 130), title, font=font(34, True), fill=accent)
        d.text((x0 + 38, cy + 190), sub, font=font(20), fill=MUTED)
        for j in range(4):
            yy = cy + 260 + j * 80
            d.rounded_rectangle([x0 + 38, yy, x0 + 72, yy + 34], 10, fill=accent)
            d.text((x0 + 55, yy + 17), str(j + 1), font=font(18, True), fill=(4, 18, 31), anchor="mm")
            d.rectangle([x0 + 88, yy + 8, x1 - 40, yy + 26], fill=(48, 60, 90))
    sy = cy + ch + 40
    for i, (n, col) in enumerate([("3 SEG", BLUE), ("3 BREAKP", GREEN), ("0 DEPS", GOLD)]):
        x0 = 72 + i * (320 + 22)
        d.rounded_rectangle([x0, sy, x0 + 320, sy + 140], 20, fill=(18, 24, 40), outline=LINE)
        d.text((x0 + 160, sy + 55), n, font=font(38, True), fill=col, anchor="mm")
        d.text((x0 + 160, sy + 105), "highlight", font=font(18), fill=MUTED, anchor="mm")
    ty = sy + 180
    d.rounded_rectangle([72, ty, 1008, ty + 200], 28, fill=(24, 34, 56), outline=(140, 190, 255))
    d.text((110, ty + 60), "Try it now", font=font(36, True), fill=FG)
    d.text((110, ty + 120), "Paste your idea, get a spec.", font=font(22), fill=MUTED)
    d.rounded_rectangle([740, ty + 62, 968, ty + 140], 40, fill=GOLD)
    d.text((854, ty + 101), "START ->", font=font(24, True), fill=(4, 18, 31), anchor="mm")
    d.text((540, 1870), "SDD x A11Y . LAUNCH", font=font(20), fill=MUTED, anchor="mm")
    return img

def screenshot(vw, name, device):
    poster = render_poster()
    scale = min(1.0, vw / W)
    pw, ph = int(W * scale), int(H * scale)
    scaled = poster.resize((pw, ph), Image.LANCZOS)
    vh = ph if vw <= 1140 else max(900, ph)
    shot = Image.new("RGB", (vw, vh), BG)
    x = (vw - pw) // 2
    shot.paste(scaled, (max(0, x), 0))
    d = ImageDraw.Draw(shot)
    d.rectangle([0, 0, vw, 30], fill=(0, 0, 0))
    d.text((10, 15), f"{device} - {vw}px - scale={scale:.3f}", font=font(16), fill=(120, 220, 160), anchor="lm")
    shot.save(name)
    print("saved", name, shot.size)

if __name__ == "__main__":
    screenshot(360, "shot-mobile-360.png", "mobile")
    screenshot(768, "shot-tablet-768.png", "tablet")
    screenshot(1280, "shot-desktop-1280.png", "desktop")