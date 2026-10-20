#!/usr/bin/env python3
"""本地生成三档断点示意图（模拟渲染，无浏览器依赖）。"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), "shots")
os.makedirs(OUT, exist_ok=True)

def font(sz):
    for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except: pass
    return ImageFont.load_default()

def draw_scene(W, H, label):
    img = Image.new("RGB", (W, H), (21, 26, 34))
    d = ImageDraw.Draw(img)
    # sky
    for y in range(int(H*0.65)):
        t = y / (H*0.65)
        d.line([(0,y),(W,y)], fill=(27+int(20*t), 36+int(20*t), 52+int(10*t)))
    gy = H - 90
    # hills
    import math
    for par, col, by in [(0.15,(35,45,63), gy-60),(0.3,(43,55,75), gy-30)]:
        pts=[(0,H)]
        for x in range(0,W+20,20):
            pts.append((x, by - math.sin(x/60+par*10)*30 - math.sin(x/29)*10))
        pts += [(W,H)]
        d.polygon(pts, fill=col)
    # ground
    d.rectangle([0, gy, W, H], fill=(90,66,31))
    d.rectangle([0, gy, W, gy+8], fill=(76,122,52))
    # pit
    px0, px1 = int(W*0.55), int(W*0.68)
    d.rectangle([px0, gy, px1, H], fill=(18,22,30))
    # tank
    tx, ty = int(W*0.35), gy
    d.rounded_rectangle([tx-40, ty-16, tx+40, ty], 8, fill=(31,36,41))
    d.rounded_rectangle([tx-34, ty-34, tx+34, ty-14], 4, fill=(62,92,49))
    d.ellipse([tx-12, ty-48, tx+22, ty-28], fill=(51,80,42))
    d.line([(tx+6,ty-42),(tx+46,ty-46)], fill=(34,53,29), width=6)
    # barrel
    bx=int(W*0.47)
    d.rectangle([bx-12, gy-34, bx+12, gy], fill=(192,57,43))
    d.rectangle([bx-12, gy-28, bx+12, gy-22], fill=(231,76,60))
    # hud
    d.rectangle([0,0,W,44], fill=(10,12,16))
    f = font(16)
    d.text((14,13), "分数 120    距离 120m    油桶 2    lives ❤❤❤", font=f, fill=(255,209,102))
    d.text((W-120,13), label, font=f, fill=(139,148,158))
    return img

specs = [("desktop",1440,900,"Desktop 1440x900"),
         ("tablet",768,1024,"Tablet 768x1024"),
         ("mobile",390,844,"Mobile 390x844")]
for name,w,h,lab in specs:
    img = draw_scene(w,h,lab)
    img.save(os.path.join(OUT, f"{name}.png"))
    print(name, img.size)