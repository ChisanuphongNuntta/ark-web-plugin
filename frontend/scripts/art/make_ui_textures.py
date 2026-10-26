"""Turn the antigravity (Gemini) plate renders into small, seamless, contrast-safe UI textures.

Each source is flattened (large-scale lighting removed), remapped onto a narrow colour ramp and made
tileable.  The ramps are chosen so the text colour used on that plate keeps >= 7:1 on EVERY pixel;
the script asserts it before writing.

    python -I scripts/art/make_ui_textures.py
"""
import os

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'ui-texture-sources')
OUT = os.path.join(HERE, '..', '..', 'public', 'images', 'ui')
TILE = 384


def lum(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def hexrgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def flatten(img, sigma):
    a = np.asarray(img.convert('L'), dtype=float)
    low = np.asarray(Image.fromarray(a.astype('uint8')).filter(ImageFilter.GaussianBlur(sigma)), dtype=float) + 1
    r = a / low
    lo, hi = np.percentile(r, [1, 99])
    return np.clip((r - lo) / (hi - lo), 0, 1)


def tileable(a):
    h, w = a.shape[:2]
    y = np.sin(np.linspace(0, np.pi, h)) ** 2
    x = np.sin(np.linspace(0, np.pi, w)) ** 2
    m = (y[:, None] * x[None, :])[..., None] if a.ndim == 3 else y[:, None] * x[None, :]
    return a * m + np.roll(a, (h // 2, w // 2), (0, 1)) * (1 - m)


def build(name, src, ramp_lo, ramp_hi, text, min_ratio, crop, sigma=40, flip=False):
    img = Image.open(os.path.join(SRC, src)).convert('RGB')
    x0, y0 = crop
    img = img.crop((x0, y0, x0 + 512, y0 + 512)).resize((TILE, TILE), Image.LANCZOS)
    t = flatten(img, sigma)
    if flip:
        t = 1 - t
    lo, hi = hexrgb(ramp_lo), hexrgb(ramp_hi)
    rgb = lo + (hi - lo) * t[..., None]
    rgb = tileable(rgb)
    L = lum(rgb)
    tl = float(lum(hexrgb(text)))
    ratios = (np.maximum(L, tl) + 0.05) / (np.minimum(L, tl) + 0.05)
    worst = float(ratios.min())
    assert worst >= min_ratio, (name, round(worst, 2))
    Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')).save(os.path.join(OUT, f'plate-{name}.webp'), quality=82, method=6)
    print(f'plate-{name}.webp worst text contrast {worst:.2f}:1')


os.makedirs(OUT, exist_ok=True)
# primary: white text; ramp top is no brighter than the existing #a8112b fill (7:1)
build('primary', 'crimson.jpg', '#4a0715', '#a1102a', '#ffffff', 7.0, (256, 256))
# ghost / secondary: light text on gunmetal
build('ghost', 'steel.jpg', '#1d1822', '#383040', '#f7eef2', 7.0, (256, 256))
# gold: dark text on champagne gold
build('gold', 'gold.jpg', '#cfa850', '#f2d487', '#221405', 7.0, (128, 128), sigma=60)
# hull: panel / popup surfaces; ramp stays under the worst-case surface #26202f
build('hull', 'steel.jpg', '#15101a', '#26202f', '#cabdc5', 7.0, (0, 0), sigma=50)
