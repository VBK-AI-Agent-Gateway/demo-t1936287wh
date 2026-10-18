#!/usr/bin/env python3
"""把三张断点截图(桌面/平板/手机)合成为一张产品宣传海报 poster.jpg。

- 输入: shot-desktop-1280.png / shot-tablet-768.png / shot-mobile-360.png
- 输出: poster.jpg (1080x1920 竖版)
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1080, 1920

BG_TOP = (11, 15, 26)
BG_BOT = (13, 19, 34)
BLUE = (88, 166, 255)
GREEN = (61, 220, 151)
GOLD = (255, 209, 102)
FG = (238, 242, 255)
MUTED = (159, 176, 208)
LINE = (38, 48, 74)


def font(size, bold=False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_background():
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        c = lerp(BG_TOP, BG_BOT, y / H)
        for x in range(W):
            px[x, y] = c
    # 网格纹理
    d = ImageDraw.Draw(img, "RGBA")
    for x in range(0, W, 64):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 9), width=1)
    for y in range(0, H, 64):
        d.line([(0, y), (W, y)], fill=(255, 255, 255, 9), width=1)
    # 左上蓝色 / 右下绿色光晕
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse([-400, -500, 700, 300], fill=(30, 60, 110))
    g.ellipse([400, 1500, 1500, 2400], fill=(20, 70, 55))
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    px_b, px_g = img.load(), glow.load()
    for y in range(H):
        for x in range(W):
            r, gg, b = px_g[x, y]
            if r or gg or b:
                br, bg_, bb = px_b[x, y]
                px_b[x, y] = (min(255, br + r // 2), min(255, bg_ + gg // 2), min(255, bb + b // 2))
    return img


def fit(img, max_w, max_h):
    r = min(max_w / img.width, max_h / img.height)
    return img.resize((max(1, int(img.width * r)), max(1, int(img.height * r))), Image.LANCZOS)


def card(draw, box, radius=24, fill=(20, 26, 43, 235), outline=(38, 48, 74, 255), width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def main():
    poster = make_background()
    d = ImageDraw.Draw(poster, "RGBA")

    # ---- 顶部 ----
    kicker = "TWO PRODUCTS \u00b7 ONE POSTER"
    fk = font(24, bold=True)
    kw = d.textlength(kicker, font=fk)
    kx, ky, kh = (W - kw) / 2 - 28, 64, 46
    d.rounded_rectangle([kx, ky, kx + kw + 56, ky + kh], radius=kh // 2,
                        outline=(*LINE, 255), width=2, fill=(255, 255, 255, 8))
    d.text((kx + 28, ky + 10), kicker, font=fk, fill=MUTED)

    # 主标题用英文大字保证字体覆盖
    d.text((W / 2, 170), "SDD WORKBENCH", font=font(76, bold=True), fill=BLUE, anchor="ma")
    d.text((W / 2, 260), "\u00d7 BREAKPOINT LAB", font=font(76, bold=True), fill=GREEN, anchor="ma")
    d.text((W / 2, 360), "SDD \u00d7 A11Y \u00b7 PRODUCT POSTER", font=font(26, bold=True),
           fill=MUTED, anchor="ma")
    d.text((W / 2, 410), "From spec to accessible page, one link.",
           font=font(26), fill=MUTED, anchor="ma")

    # ---- 中部: 三张截图拼合 ----
    shots = [
        ("shot-desktop-1280.png", "DESKTOP 1280"),
        ("shot-tablet-768.png", "TABLET 768"),
        ("shot-mobile-360.png", "MOBILE 360"),
    ]
    panel_top, panel_h = 500, 700
    card(d, [48, panel_top, W - 48, panel_top + panel_h], radius=28)

    imgs = []
    for name, label in shots:
        p = os.path.join(HERE, name)
        if os.path.exists(p):
            imgs.append((Image.open(p).convert("RGB"), label))
    if not imgs:
        raise SystemExit("missing screenshots")

    inner = [48 + 24, panel_top + 56, W - 48 - 24, panel_top + panel_h - 24]
    x0, y0, x1, y1 = inner
    avail_w, avail_h = x1 - x0, y1 - y0

    if len(imgs) == 3:
        # 主图(桌面)占左侧 60%
        main_w = int(avail_w * 0.60)
        side_w = avail_w - main_w - 20
        m = fit(imgs[0][0], main_w, avail_h)
        mx = x0 + (main_w - m.width) // 2
        my = y0 + (avail_h - m.height) // 2
        poster.paste(m, (mx, my))
        d.rounded_rectangle([mx - 2, my - 2, mx + m.width + 2, my + m.height + 2],
                            radius=8, outline=(*BLUE, 255), width=3)
        # 右侧上下两张
        sh = (avail_h - 20) // 2
        sy = y0
        for img, label in imgs[1:]:
            s = fit(img, side_w - 8, sh - 8)
            sx = x0 + main_w + 20 + (side_w - s.width) // 2
            yy = sy + (sh - s.height) // 2
            poster.paste(s, (sx, yy))
            d.rounded_rectangle([sx - 2, yy - 2, sx + s.width + 2, yy + s.height + 2],
                                radius=8, outline=(*GREEN, 255), width=3)
            d.text((sx + 6, sy + 4), label, font=font(18, bold=True), fill=GREEN)
            sy += sh + 20
        d.text((x0 + 8, y0 + 4), imgs[0][1], font=font(18, bold=True), fill=BLUE)
    else:
        # 兜底: 横排
        gap = 16
        colw = (avail_w - gap * (len(imgs) - 1)) // len(imgs)
        for i, (img, label) in enumerate(imgs):
            s = fit(img, colw, avail_h)
            sx = x0 + i * (colw + gap)
            yy = y0 + (avail_h - s.height) // 2
            poster.paste(s, (sx, yy))
            d.rectangle([sx, yy, sx + s.width, yy + s.height], outline=(*BLUE, 255), width=3)
            d.text((sx + 6, yy + 4), label, font=font(18, bold=True), fill=BLUE)

    # ---- 双产品卡 ----
    cards_top = panel_top + panel_h + 32
    cards_h = 400
    cw = (W - 96 - 28) // 2
    products = [
        ("PRODUCT 01", "SDD WORKBENCH", BLUE,
         ["SPEC / PLAN / TASKS generated live",
          "Checkable acceptance tasks",
          "axe a11y quick-scan built in",
          "3 breakpoint previews side-by-side"],
         "Zero config \u00b7 run in browser"),
        ("PRODUCT 02", "BREAKPOINT LAB", GREEN,
         ["640 / 960 breakpoints, smooth reflow",
          "3px high-contrast focus ring",
          "aria-live counter announcements",
          "Single-file HTML, double-click to run"],
         "axe \u2705 0 violations \u00b7 0 deps"),
    ]
    for i, (num, name, accent, pts, foot) in enumerate(products):
        cx = 48 + i * (cw + 28)
        box = [cx, cards_top, cx + cw, cards_top + cards_h]
        card(d, box, radius=26)
        d.rounded_rectangle([cx, cards_top, cx + cw, cards_top + 6], radius=3, fill=(*accent, 255))
        d.text((cx + 28, cards_top + 26), num, font=font(18, bold=True), fill=MUTED)
        d.text((cx + 28, cards_top + 58), name, font=font(34, bold=True), fill=accent)
        # chips
        chips = ["Realtime", "A11y", "3-breakpoint"] if i == 0 else ["Zero-dep", "axe-pass", "One-file"]
        chx = cx + 28
        chy = cards_top + 108
        fc = font(17, bold=True)
        for c in chips:
            cw_ = d.textlength(c, font=fc)
            d.rounded_rectangle([chx, chy, chx + cw_ + 24, chy + 34], radius=17,
                                fill=(*accent, 30), outline=(*accent, 120), width=1)
            d.text((chx + 12, chy + 7), c, font=fc, fill=lerp(accent, FG, 0.35))
            chx += cw_ + 34
        fy = cards_top + 166
        fb = font(19)
        for p in pts:
            d.ellipse([cx + 28, fy + 4, cx + 44, fy + 20], fill=(*accent, 255))
            words, line, lines = p.split(), "", []
            for w_ in words:
                test = (line + " " + w_).strip()
                if d.textlength(test, font=fb) > cw - 88:
                    lines.append(line)
                    line = w_
                else:
                    line = test
            lines.append(line)
            for k, ln in enumerate(lines):
                d.text((cx + 56, fy + k * 26), ln, font=fb, fill=(219, 229, 247))
            fy += max(34, len(lines) * 26 + 8)
        d.line([cx + 28, cards_top + cards_h - 52, cx + cw - 28, cards_top + cards_h - 52],
               fill=(*LINE, 255), width=2)
        d.text((cx + 28, cards_top + cards_h - 40), foot, font=font(17, bold=True), fill=GOLD)

    # ---- 数据条 ----
    stat_top = cards_top + cards_h + 28
    stats = [("3", "SECTIONS", BLUE), ("3", "BREAKPOINTS", GREEN), ("0", "DEPENDENCIES", GOLD)]
    sw = (W - 96 - 40) // 3
    for i, (n, l, c) in enumerate(stats):
        sx = 48 + i * (sw + 20)
        card(d, [sx, stat_top, sx + sw, stat_top + 120], radius=20,
             fill=(255, 255, 255, 9))
        d.text((sx + sw / 2, stat_top + 22), n, font=font(48, bold=True), fill=c, anchor="ma")
        d.text((sx + sw / 2, stat_top + 84), l, font=font(18, bold=True), fill=MUTED, anchor="ma")

    # ---- CTA ----
    cta_top = stat_top + 120 + 28
    cta_bot = H - 110
    d.rounded_rectangle([48, cta_top, W - 48, cta_bot], radius=28,
                       fill=(88, 166, 255, 40), outline=(140, 190, 255, 110), width=2)
    d.text((84, cta_top + 42), "Run your spec now", font=font(40, bold=True), fill=FG)
    d.text((84, cta_top + 104), "Paste a rough idea \u2192 get a 3-section spec \u2192 verify breakpoints.",
           font=font(24), fill=(207, 224, 245))
    # 按钮
    btn = "OPEN THE TOOLS \u2192"
    fb = font(26, bold=True)
    bw = d.textlength(btn, font=fb)
    bx1, by1 = W - 84, cta_bot - 46
    bx0, by0 = bx1 - bw - 64, by1 - 72
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=36, fill=(*GOLD, 255))
    d.text(((bx0 + bx1) / 2, (by0 + by1) / 2), btn, font=fb, fill=(4, 18, 31), anchor="mm")

    # ---- 页脚 ----
    d.text((W / 2, H - 78), "SDD \u00d7 A11Y  \u00b7  DUAL PRODUCT LAUNCH  \u00b7  DEMO-T1936287WH",
           font=font(20, bold=True), fill=MUTED, anchor="ma")

    out = os.path.join(HERE, "poster.jpg")
    poster.convert("RGB").save(out, "JPEG", quality=90)
    print("saved", out, poster.size)


if __name__ == "__main__":
    main()