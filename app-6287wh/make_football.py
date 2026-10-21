#!/usr/bin/env python3
"""Replace mooncake with a football. Memory-lean: crop-space processing, small scratch arrays."""
import gc, os, base64
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SRC = '/ws/source.png'
OUTDIR = '/ws/app-6287wh'
OUT_BEFORE = OUTDIR + '/before.jpg'
OUT_AFTER = OUTDIR + '/result.jpg'
os.makedirs(OUTDIR, exist_ok=True)

def stage(tag):
    import resource
    print(tag, 'rss_kb=', resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, flush=True)

# 1) detect golden mooncake pixels (bbox only, keep memory tiny)
src = Image.open(SRC).convert('RGB')
W, H = src.size
r0c0 = None
# scan on a downscaled view for bbox, then refine locally (cheap + low mem)
small = src.resize((W // 4, H // 4), Image.BILINEAR)
a = np.asarray(small).astype(np.int16)
del small
r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
gold = (r > 150) & (g > 110) & (r - b > 60) & (g - b > 35) & (r - g < 90)
ys, xs = np.nonzero(gold)
x0, x1 = int(xs.min()) * 4, int(xs.max()) * 4
y0, y1 = int(ys.min()) * 4, int(ys.max()) * 4
del a, r, g, b, gold, ys, xs
gc.collect()
print('mooncake bbox:', x0, y0, x1, y1, flush=True)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
rad = max(x1 - x0, y1 - y0) / 2 * 1.02
stage('detect')

# 2) inpaint the mooncake area (work in crop space only)
PAD = 60
bx0, by0 = max(0, x0 - PAD), max(0, y0 - PAD)
bx1, by1 = min(W, x1 + PAD), min(H, y1 + PAD)
patch = src.crop((bx0, by0, bx1, by1))
pw, ph = patch.size
yy, xx = np.mgrid[0:ph, 0:pw]
pcx, pcy = cx - bx0, cy - by0
d = ((xx - pcx) / rad) ** 2 + ((yy - pcy) / rad) ** 2
del yy, xx
pa = np.asarray(patch).astype(np.float32)
b1 = np.asarray(patch.filter(ImageFilter.GaussianBlur(40))).astype(np.float32)
b2 = np.asarray(patch.filter(ImageFilter.GaussianBlur(150))).astype(np.float32)
fill = b1 + (b2 - b2.mean(0)) * 0.25
mask = np.clip(1.25 - d, 0, 1)
del d, b2
m = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(22)), np.float32) / 255.0
del mask
patched = pa * (1 - m[..., None]) + fill * m[..., None]
del pa, fill, b1
rng = np.random.default_rng(3)
noise = rng.normal(0, 6.0, (ph // 3 + 1, pw // 3 + 1, 3)).astype(np.float32)
gimg = Image.fromarray(np.clip(noise * 20 + 128, 0, 255).astype(np.uint8)).resize((pw, ph), Image.BILINEAR)
patched += ((np.asarray(gimg, np.float32) - 128) / 20) * m[..., None]
del noise, gimg, m
patched = np.clip(patched, 0, 255).astype(np.uint8)
src.paste(Image.fromarray(patched), (bx0, by0))
del patched
gc.collect()
stage('inpaint')

# 3) draw a classic football (small canvases)
S = 384
SH = 48
yy2, xx2 = np.mgrid[0:SH, 0:SH]
cc = SH / 2
rr = SH / 2 - 1
dd = np.clip(np.sqrt((xx2 - cc) ** 2 + (yy2 - cc) ** 2) / rr, 0, 1)
shade = np.clip(1.18 - 0.62 * np.clip(dd * 0.75 + (yy2 - cc) / rr * 0.35 + (xx2 - cc) / rr * 0.25, 0, 1.25), 0.35, 1.2)
base = np.zeros((SH, SH, 3), np.float32)
base[..., 0] = 244 * shade
base[..., 1] = 244 * shade
base[..., 2] = 242 * shade
del yy2, xx2, dd, shade
rim = None
spec = None
base = np.clip(base, 0, 255)
shade_img = Image.fromarray(base.astype(np.uint8)).resize((S, S), Image.BICUBIC)
del base
gc.collect()
stage('shade')

ball = shade_img.convert('RGBA')
del shade_img
gc.collect()

# pentagons
d2 = ImageDraw.Draw(ball)
BLACK = (18, 18, 20, 255)
EDGE = (60, 60, 64, 255)

def draw_pent(ox, oy, R, ang, fill=BLACK):
    pts = []
    for k in range(5):
        t = -np.pi / 2 + ang + k * 2 * np.pi / 5
        pts.append((ox + R * np.cos(t), oy + R * np.sin(t)))
    d2.polygon(pts, fill=fill)

R0 = S * 0.175
draw_pent(S / 2, S / 2, R0, 0)
for k in range(5):
    t = -np.pi / 2 + k * 2 * np.pi / 5
    ox = S / 2 + R0 * 1.62 * np.cos(t)
    oy = S / 2 + R0 * 1.62 * np.sin(t)
    draw_pent(ox, oy, R0 * 0.92, np.pi + (t + np.pi / 2))
pts = [(S / 2 + R0 * np.cos(-np.pi / 2 + k * 2 * np.pi / 5),
        S / 2 + R0 * np.sin(-np.pi / 2 + k * 2 * np.pi / 5)) for k in range(5)]
d2.line(pts + [pts[0]], fill=EDGE, width=5)
stage('pentagons')

# circular clip with feathered alpha
alpha = Image.new('L', (S, S), 0)
ImageDraw.Draw(alpha).ellipse([6, 6, S - 6, S - 6], fill=255)
alpha = alpha.filter(ImageFilter.GaussianBlur(3))
ball.putalpha(alpha)
del alpha
gc.collect()
stage('ball')

# 4) composite: drop shadow + ball
src = src.convert('RGBA')
D = int(rad * 2)
ball_r = ball.resize((D, D), Image.LANCZOS)
del ball
sh = Image.new('RGBA', src.size, (0, 0, 0, 0))
sx0, sy0 = int(cx - D * 0.52), int(cy + D * 0.34)
ImageDraw.Draw(sh).ellipse([sx0, sy0, sx0 + int(D * 1.04), sy0 + int(D * 0.30)], fill=(0, 0, 0, 110))
sh = sh.filter(ImageFilter.GaussianBlur(22))
src = Image.alpha_composite(src, sh)
del sh
bx, by = int(cx - D / 2), int(cy - D / 2)
src.alpha_composite(ball_r, (bx, by))
del ball_r
gc.collect()
stage('composite')

# 5) save + base64 assets
final = src.convert('RGB')
del src
before = Image.open(SRC).convert('RGB')
before.save(OUT_BEFORE, quality=85, optimize=True)
del before
final.save(OUT_AFTER, quality=90, optimize=True)
del final
gc.collect()
stage('saved')

def dataurl(p):
    with open(p, 'rb') as f:
        return 'data:image/jpeg;base64,' + base64.b64encode(f.read()).decode()

with open(OUTDIR + '/assets.js', 'w') as f:
    f.write('window.BEFORE_IMG="%s";\n' % dataurl(OUT_BEFORE))
    f.write('window.AFTER_IMG="%s";\n' % dataurl(OUT_AFTER))
stage('assets')
print('done. ball dia:', D, 'files:', os.path.getsize(OUT_AFTER), os.path.getsize(OUTDIR + '/assets.js'), flush=True)