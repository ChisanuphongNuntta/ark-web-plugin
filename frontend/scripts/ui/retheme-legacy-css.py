"""One-shot migration: replace hard-coded blue/cyan colours in legacy CSS with the UI tokens.

Blue-hued colours (hue 165-265 deg) are classified by luminance:
  dark navy surfaces -> rgb(var(--s-0..3)), mid slate-blue fills -> --s-3, bright cyan -> --acc-300/400,
  near-white / pale blue text -> --ink or --ink-muted.
Alpha is preserved. Non-blue colours (gold, red, green, status) are left alone.

    python -I scripts/ui/retheme-legacy-css.py src/app/frozen.css src/app/tek.css
"""
import colorsys
import re
import sys


def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def lum(r, g, b):
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def classify(r, g, b):
    """Return a token expression for a blue-hued colour, or None to leave it."""
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    hue = h * 360
    if not (165 <= hue <= 265) or s < 0.12:
        return None
    y = lum(r, g, b)
    if y < 0.0045:
        return 's-0'
    if y < 0.0095:
        return 's-1'
    if y < 0.014:
        return 's-2'
    if y < 0.07:
        return 's-3'
    if y < 0.30:
        return 'acc-700' if s > 0.35 else 's-3'
    if y < 0.55:
        return 'acc-400' if s > 0.35 else 'ink-faint'
    if y < 0.75:
        return 'acc-300' if s > 0.35 else 'ink-muted'
    return 'ink' if s < 0.45 else 'acc-200'


hex_rx = re.compile(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])')
rgba_rx = re.compile(r'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)')


def token(name, alpha):
    if alpha is None or alpha >= 0.995:
        return f'rgb(var(--{name}))'
    return f'rgb(var(--{name}) / {alpha:.2f})'


def conv_hex(m):
    h = m.group(1)
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    a = int(h[6:8], 16) / 255 if len(h) == 8 else None
    t = classify(r, g, b)
    return m.group(0) if t is None else token(t, a)


def conv_rgba(m):
    r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
    a = float(m.group(4)) if m.group(4) is not None else None
    t = classify(r, g, b)
    return m.group(0) if t is None else token(t, a)


for path in sys.argv[1:]:
    src = open(path, encoding='utf-8').read()
    out_lines, depth_root = [], False
    changed = 0
    for line in src.split('\n'):
        # leave :root custom-property blocks (token definitions) alone
        if line.strip().startswith((':root', '--')) and ('--' in line):
            out_lines.append(line)
            continue
        n = rgba_rx.sub(conv_rgba, hex_rx.sub(conv_hex, line))
        if n != line:
            changed += 1
        out_lines.append(n)
    open(path, 'w', encoding='utf-8').write('\n'.join(out_lines))
    print(f'{path}: {changed} lines re-themed')
