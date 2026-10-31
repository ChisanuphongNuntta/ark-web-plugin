"""Cut the generated ARK UI sheets (frame, buttons, slots) into transparent, web-sized WebP assets.

Sources: scripts/art/ui-texture-sources/ark-{panel-frame,buttons,slots}.jpg (rendered on plain black).
Output:  public/images/ui/ark/*.webp plus ark-kit.json (sizes and 9-slice values for the CSS).

    python -I scripts/art/make_ark_kit.py

The black backdrop becomes transparent by flood fill from the image edge. Button plates are darkened in their centre
until ink text reaches 7:1 (WCAG AAA); the script fails if any centre pixel is still too bright.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'ui-texture-sources')
OUT = os.path.join(HERE, '..', '..', 'public', 'images', 'ui', 'ark')
os.makedirs(OUT, exist_ok=True)

INK = (247, 238, 242)


def lin(c):
    c = c / 255.0
    return np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luminance(rgb):
    return 0.2126 * lin(rgb[..., 0]) + 0.7152 * lin(rgb[..., 1]) + 0.0722 * lin(rgb[..., 2])


def contrast_with_ink(rgb):
    ink = float(luminance(np.array(INK, dtype=float).reshape(1, 1, 3))[0, 0])
    return (ink + 0.05) / (luminance(rgb) + 0.05)


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert('RGB')).astype(np.float32)


def outside_mask(rgb, thr=18):
    """True for the black backdrop: near-black pixels connected to the image edge."""
    dark = rgb.max(axis=2) < thr
    lab, _ = ndi.label(dark)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    return np.isin(lab, list(edge))


def to_rgba(rgb, outside, glow=False):
    alpha = (~outside).astype(np.float32)
    alpha = ndi.binary_erosion(alpha > 0.5, iterations=1).astype(np.float32)  # drop the dark fringe
    out = rgb.copy()
    if glow:
        # soft light outside the body: alpha from brightness, colour un-premultiplied
        bright = np.clip(rgb.max(axis=2) / 255.0 * 1.5, 0, 1)
        halo = outside & (rgb.max(axis=2) >= 18)
        alpha = np.where(halo, bright, alpha)
        out = np.where(halo[..., None], np.clip(rgb / np.maximum(bright[..., None], 1e-3), 0, 255), rgb)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)))
    return np.dstack([out, alpha]).clip(0, 255).astype(np.uint8)


def crop_alpha(img, pad=0, thr=24):
    a = img[..., 3] > thr
    ys, xs = np.where(a)
    y0, y1, x0, x1 = max(ys.min() - pad, 0), min(ys.max() + 1 + pad, img.shape[0]), max(xs.min() - pad, 0), min(xs.max() + 1 + pad, img.shape[1])
    return img[y0:y1, x0:x1]


def save(arr, name, width=None, q=88):
    im = Image.fromarray(arr, 'RGBA')
    if width and im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    path = os.path.join(OUT, name)
    im.save(path, 'WEBP', quality=q, method=6, alpha_quality=95)
    print(f'  {name:22s} {im.width}x{im.height}  {os.path.getsize(path) / 1024:.0f} KB')
    return im.size


kit = {}

# ---------------------------------------------------------------- panel frame (9-slice)
rgb = load('ark-panel-frame.jpg')
outside = outside_mask(rgb)
# the centre recess: flood from the middle through the flat plum fill, stopping at the bright inner rim
cy, cx = rgb.shape[0] // 2, rgb.shape[1] // 2
base = rgb[cy, cx]
near = np.abs(rgb - base).max(axis=2) < 22
lab, _ = ndi.label(near)
centre = lab == lab[cy, cx]
frame = to_rgba(rgb, outside | centre)
frame = crop_alpha(frame)
h, w = frame.shape[:2]
# remove the gold latch (it would stretch with the top edge): blend the columns either side of it across the gap. CSS draws the latch.
lx0, lx1 = w // 2 - 48, w // 2 + 48
span = lx1 - lx0
top_band = slice(0, 70)
left, right = frame[top_band, lx0 - 1].astype(np.float32), frame[top_band, lx1].astype(np.float32)
t = np.linspace(0, 1, span, dtype=np.float32)[None, :, None]
frame[top_band, lx0:lx1] = (left[:, None, :] * (1 - t) + right[:, None, :] * t).astype(np.uint8)
size = save(frame, 'panel-frame.webp', width=640)
kit['panel'] = {'w': size[0], 'h': size[1], 'slice': round(130 * size[0] / w)}

# ---------------------------------------------------------------- buttons (3-slice) with a text-safe centre
rgb = load('ark-buttons.jpg')
outside = outside_mask(rgb, thr=22)
H = rgb.shape[0]
bands = {'normal': (40, 205), 'hover': (215, 385), 'pressed': (395, 545), 'disabled': (560, 725)}
for state, (y0, y1) in bands.items():
    sub = rgb[y0:y1].copy()
    out_sub = outside_mask(sub, thr=120) if state == 'hover' else outside[y0:y1]  # hover: dim halo counts as backdrop
    rgba = to_rgba(sub, out_sub)
    body_ys, body_xs = np.where(~out_sub)
    pad = 0  # the hover glow is a CSS drop-shadow, so every state shares one silhouette
    by0, by1, bx0, bx1 = body_ys.min(), body_ys.max() + 1, body_xs.min(), body_xs.max() + 1
    cy0, cy1, cx0, cx1 = max(by0 - pad, 0), min(by1 + pad, rgba.shape[0]), max(bx0 - pad, 0), min(bx1 + pad, rgba.shape[1])
    rgba = rgba[cy0:cy1, cx0:cx1]
    hh, ww = rgba.shape[:2]
    bw, bh = bx1 - bx0, by1 - by0
    yy, xx = np.mgrid[0:hh, 0:ww]
    ox, oy = bx0 - cx0, by0 - cy0  # body origin inside the crop
    inner = (xx > ox + bw * 0.14) & (xx < ox + bw * 0.86) & (yy > oy + bh * 0.30) & (yy < oy + bh * 0.70)
    feather = ndi.gaussian_filter(ndi.binary_dilation(inner, iterations=10).astype(np.float32), 3)
    base_rgb = rgba[..., :3].astype(np.float32)
    # lower the centre gain step by step until ink text clears 7.1:1 (the first step that passes keeps the plate as bright as allowed)
    gain = 1.0
    while True:
        trial = base_rgb * (1 - feather[..., None] * (1 - gain))
        worst_try = float(contrast_with_ink(trial[inner].reshape(-1, 1, 3)).min())
        if worst_try >= 7.1 or gain < 0.2 or state == 'disabled':
            break
        gain -= 0.02
    rgba[..., :3] = trial.clip(0, 255).astype(np.uint8)
    inner_rgb = rgba[..., :3][inner].astype(np.float32)
    worst = float(contrast_with_ink(inner_rgb.reshape(-1, 1, 3)).min())
    print(f'  button {state:9s} worst ink contrast {worst:.2f}')
    if state != 'disabled' and worst < 7.0:
        sys.exit(f'button {state}: centre contrast {worst:.2f} < 7.0')
    sz = save(rgba, f'btn-{state}.webp', width=560)
    kit.setdefault('btn', {})[state] = {'w': sz[0], 'h': sz[1], 'cap': round(112 * sz[0] / ww)}

# ---------------------------------------------------------------- item slot frames (transparent centre)
rgb = load('ark-slots.jpg')
outside = outside_mask(rgb, thr=20)
Hh, Ww = rgb.shape[:2]
names = ['red', 'gold', 'cyan', 'green', 'violet', 'amber']
cols = [(0, Ww // 3), (Ww // 3, 2 * Ww // 3), (2 * Ww // 3, Ww)]
rows = [(0, Hh // 2), (Hh // 2, Hh)]
i = 0
for (r0, r1) in rows:
    for (c0, c1) in cols:
        sub, out_sub = rgb[r0:r1, c0:c1], outside[r0:r1, c0:c1]
        cy, cx = sub.shape[0] // 2, sub.shape[1] // 2
        near = np.abs(sub - sub[cy, cx]).max(axis=2) < 20
        lab, _ = ndi.label(near)
        centre = lab == lab[cy, cx]
        rgba = crop_alpha(to_rgba(sub, out_sub | centre))
        save(rgba, f'slot-{names[i]}.webp', width=200)
        i += 1
kit['slot'] = {'w': 200, 'names': names}

with open(os.path.join(OUT, 'ark-kit.json'), 'w') as f:
    json.dump(kit, f, indent=1)
print('kit:', json.dumps(kit))
