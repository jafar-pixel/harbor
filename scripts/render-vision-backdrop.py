import numpy as np
from PIL import Image, ImageFilter
import sys
W, H = 2560, 1440
rng = np.random.default_rng(7)
img = np.zeros((H, W, 3), np.float32)

def stamp(xs, ys, cols, sizes, alpha):
    # Additive soft dots.
    for r in sorted(set(sizes)):
        m = sizes == r
        if not m.any():
            continue
        k = int(r * 3) + 1
        yy, xx = np.mgrid[-k:k + 1, -k:k + 1]
        g = np.exp(-(xx ** 2 + yy ** 2) / (2 * r * r))[..., None]
        for x, y, c in zip(xs[m], ys[m], cols[m]):
            x0, y0 = int(x) - k, int(y) - k
            if x0 < 0 or y0 < 0 or x0 + 2 * k + 1 >= W or y0 + 2 * k + 1 >= H:
                continue
            img[y0:y0 + 2 * k + 1, x0:x0 + 2 * k + 1] += g * c * alpha

def palette(t):
    # orange -> red -> magenta -> violet
    stops = np.array([[1.0, 0.62, 0.15], [1.0, 0.28, 0.12], [0.95, 0.15, 0.55], [0.55, 0.18, 0.95]])
    t = np.clip(t, 0, 0.999) * (len(stops) - 1)
    i = t.astype(int)
    f = (t - i)[..., None]
    return stops[i] * (1 - f) + stops[i + 1] * f

# Wave ribbons of particles: lines of dots along flowing curves.
for ribbon in range(3):
    phase = rng.uniform(0, 6.28)
    amp = rng.uniform(140, 260)
    base = H * (0.35 + 0.1 * ribbon)
    lines = 34
    for li in range(lines):
        u = np.linspace(-0.05, 1.05, 380)
        v = li / lines
        x = u * W
        y = (base + amp * np.sin(u * 5.2 + phase + v * 1.6) * (0.6 + 0.4 * np.sin(u * 2.1 + ribbon))
             + v * 220 - 110 + 60 * np.sin(u * 13 + v * 4))
        depth = 0.5 + 0.5 * np.sin(u * 3.1 + v * 3 + ribbon)
        cols = palette((u * 0.7 + v * 0.3 + ribbon * 0.12) % 1.0)
        bright = (0.2 + 0.8 * depth ** 2) * (0.3 + 0.7 * np.sin(np.pi * v)) * 1.5
        sizes = np.round(0.9 + depth * 1.4, 1)
        stamp(x, y, cols * bright[:, None], sizes, 1.0)

# Bokeh specks.
n = 260
xs = rng.uniform(0, W, n); ys = rng.uniform(0, H, n)
cols = palette(rng.uniform(0, 1, n)) * rng.uniform(0.15, 0.6, n)[:, None]
sizes = np.round(rng.choice([2.0, 3.0, 5.0, 8.0], n, p=[0.5, 0.3, 0.15, 0.05]), 1)
stamp(xs, ys, cols, sizes, 0.8)

# Glow: blurred copy added back, then tone map.
pic = Image.fromarray(np.clip(img * 255, 0, 255).astype(np.uint8))
glow = np.asarray(pic.filter(ImageFilter.GaussianBlur(28)), np.float32) / 255
out = img + glow * 1.8
out = 1 - np.exp(-out * 1.25)
# Ambient light, like the sky of a visionOS environment: soft orange low left, violet high right.
yy, xx = np.mgrid[0:H, 0:W]
def blob(cx, cy, r, col, k):
    d = ((xx - cx) ** 2 + (yy - cy) ** 2) / (r * r)
    return np.exp(-d)[..., None] * np.array(col) * k
out = out + blob(W * 0.15, H * 0.85, W * 0.45, [1.0, 0.42, 0.12], 0.16) + blob(W * 0.85, H * 0.15, W * 0.4, [0.55, 0.2, 0.95], 0.14)
# Vignette and a deep base tone.
vig = 1 - 0.55 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / 2
out = out * vig[..., None] + np.array([0.02, 0.012, 0.03])
Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8)).save(sys.argv[1], quality=82)
