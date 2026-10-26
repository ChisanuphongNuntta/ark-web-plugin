"""Generate src/app/iris-contrast.css: AAA colour floors for the Tailwind colour classes actually used.

Text on the dark surface scale (s-0..s-3, worst case #26202f) must reach 7:1; white text on a
solid status fill must reach 7:1. The script asserts every target before writing anything.

    python -I scripts/ui/gen-contrast.py
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(SRC, 'app', 'iris-contrast.css')
WORST_SURFACE = '#26202f'


def lum(h):
    h = h.lstrip('#')
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    if la < lb:
        la, lb = lb, la
    return (la + 0.05) / (lb + 0.05)


# family -> {shade: text colour}; shades above 600 are assumed to be dark text on light fills and left alone
TEXT = {}
for fam, c300, c4 in (
    ('rose', '#ffb8c2', '#ff9aa8'), ('red', '#ffb8c2', '#ff9aa8'), ('pink', '#ffb8dc', '#ff9bd0'),
    ('emerald', '#a6f7cc', '#7ff0b4'), ('green', '#a6f7cc', '#7ff0b4'), ('lime', '#d4f59a', '#bdee6b'),
    ('amber', '#ffe3a6', '#ffc766'), ('yellow', '#fff0a6', '#ffe066'), ('orange', '#ffcfa8', '#ffb98a'),
    ('blue', '#c3dcff', '#9fc5ff'), ('indigo', '#d0d4ff', '#aab2ff'),
    ('purple', '#e0d0ff', '#cdb8ff'), ('violet', '#e0d0ff', '#cdb8ff'), ('fuchsia', '#f5c8ff', '#ecaaff'),
):
    TEXT[fam] = {300: c300, 400: c4, 500: c4, 600: c4}
NEUTRAL_TEXT = '#cabdc5'  # n-500: 7:1 even on bg-slate-800 (#342d3a)
TEXT['slate'] = {600: NEUTRAL_TEXT}
TEXT['gray'] = {600: NEUTRAL_TEXT}
TEXT['zinc'] = {500: NEUTRAL_TEXT, 600: NEUTRAL_TEXT}

# solid fills that carry white text
FILL = {
    'rose': '#a8112b', 'red': '#a8112b', 'pink': '#a3175f', 'emerald': '#0a6244', 'green': '#0a6244',
    'blue': '#1b4aa0', 'indigo': '#3b3fb0', 'purple': '#5b2fb0', 'violet': '#5b2fb0', 'fuchsia': '#8a1d9e',
    'orange': '#7d4205', 'amber': '#704005', 'yellow': '#6b5205', 'lime': '#386005',
}

for fam, shades in TEXT.items():
    for shade, col in shades.items():
        r = ratio(col, WORST_SURFACE)
        assert r >= 7, (fam, shade, col, round(r, 2))
for fam, col in FILL.items():
    r = ratio('#ffffff', col)
    assert r >= 7, (fam, col, round(r, 2))
FAINT = '#c4b6bf'
assert ratio(FAINT, WORST_SURFACE) >= 7
assert ratio(NEUTRAL_TEXT, '#342d3a') >= 7
for accent_300 in ('#ffbcc7', '#67e8f9'):
    assert ratio(accent_300, WORST_SURFACE) >= 7

fam_rx = '|'.join(sorted(set(TEXT) | set(FILL)))
tok_rx = re.compile(r'(?<![\w:/-])(text|bg)-(' + fam_rx + r')-(\d{3})(?:/(\d{1,3}))?(?![\w-])')
white_rx = re.compile(r'(?<![\w:/-])text-white(?:/(\d{1,3}))?(?![\w-])')
class_rx = re.compile(r'''(?:className|class)\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})|(?<![\w])['"`]([^'"`\n]{12,300})['"`]''')

text_tokens, fill_tokens, white_tokens = set(), set(), set()
accent_text, tint_caps, soft_tokens = set(), set(), set()
acc_rx = re.compile(r'(?<![\w:/-])text-(cyan|sky|teal)-(300|400|500|600)(?:/(\d{1,3}))?(?![\w-])')
tint_rx = re.compile(r'(?<![\w:/-])bg-(iris-cyan|iris-gold|cyan-\d{3}|sky-\d{3}|teal-\d{3})/(\d{1,2})(?![\w-])')
soft_rx = re.compile(r'(?<![\w:/-])text-(slate|gray|cyan|sky|teal)-(50|100|200|300)/(\d{1,2})(?![\w-])')
status_tint_rx = re.compile(r'(?<![\w:/-])bg-(amber|rose|emerald|red|blue|purple|orange|yellow|green|indigo|violet|pink)-(400|500|600)/(\d{2})(?![\w-])')
STATUS_RGB = {('amber', 400): '251 191 36', ('amber', 500): '245 158 11', ('amber', 600): '217 119 6', ('rose', 400): '251 113 133', ('rose', 500): '244 63 94', ('rose', 600): '225 29 72', ('emerald', 400): '52 211 153', ('emerald', 500): '16 185 129', ('emerald', 600): '5 150 105', ('red', 400): '248 113 113', ('red', 500): '239 68 68', ('red', 600): '220 38 38', ('blue', 400): '96 165 250', ('blue', 500): '59 130 246', ('blue', 600): '37 99 235', ('purple', 400): '192 132 252', ('purple', 500): '168 85 247', ('purple', 600): '147 51 234', ('orange', 400): '251 146 60', ('orange', 500): '249 115 22', ('orange', 600): '234 88 12', ('yellow', 400): '250 204 21', ('yellow', 500): '234 179 8', ('yellow', 600): '202 138 4', ('green', 400): '74 222 128', ('green', 500): '34 197 94', ('green', 600): '22 163 74', ('indigo', 400): '129 140 248', ('indigo', 500): '99 102 241', ('indigo', 600): '79 70 229', ('violet', 400): '167 139 250', ('violet', 500): '139 92 246', ('violet', 600): '124 58 237', ('pink', 400): '244 114 182', ('pink', 500): '236 72 153', ('pink', 600): '219 39 119'}
status_caps = set()
text_hint_rx = re.compile(r'(?<![\w:/-])text-(iris-cyan|iris-gold|cyan-|sky-|teal-)')
for root, _, files in os.walk(SRC):
    for f in files:
        if not f.endswith(('.tsx', '.ts')):
            continue
        s = open(os.path.join(root, f), encoding='utf-8', errors='ignore').read()
        for m in re.finditer(r'["\'`]([^"\'`\n]{6,400})["\'`]', s):
            chunk = m.group(1)
            if 'text-' not in chunk and 'bg-' not in chunk:
                continue
            has_white = bool(re.search(r'(?<![\w:/-])text-white(?![\w/-])', chunk))
            for t in tok_rx.finditer(chunk):
                kind, fam, shade, alpha = t.group(1), t.group(2), int(t.group(3)), t.group(4)
                if kind == 'text' and fam in TEXT and shade in TEXT[fam]:
                    text_tokens.add((fam, shade, alpha))
                if kind == 'bg' and fam in FILL and shade in (500, 600, 700) and has_white and (alpha is None or int(alpha) >= 70):
                    fill_tokens.add((fam, shade, alpha))
            for sft in soft_rx.finditer(chunk):
                if int(sft.group(3)) < 85:
                    soft_tokens.add((sft.group(1), sft.group(2), sft.group(3)))
            for a in acc_rx.finditer(chunk):
                accent_text.add((a.group(1), a.group(2), a.group(3)))
            if text_hint_rx.search(chunk):
                for t in tint_rx.finditer(chunk):
                    if int(t.group(2)) > 12:
                        tint_caps.add((t.group(1), t.group(2)))
            if re.search(r'(?<![\w:/-])text-', chunk):
                for st in status_tint_rx.finditer(chunk):
                    if int(st.group(3)) > 18:
                        status_caps.add((st.group(1), int(st.group(2)), st.group(3)))
            for w in white_rx.finditer(chunk):
                if w.group(1) and int(w.group(1)) <= 70:
                    white_tokens.add(int(w.group(1)))


def esc(tok):
    return tok.replace('/', '\\/')


lines = [
    '/* GENERATED by scripts/ui/gen-contrast.py. Do not edit. AAA colour floors for classes in use. */',
]
for alpha in sorted(white_tokens):
    lines.append(f'body .{esc(f"text-white/{alpha}")} {{ color: {FAINT}; }}')
for fam, shade, alpha in sorted(text_tokens, key=lambda x: (x[0], x[1], x[2] or '')):
    name = f'text-{fam}-{shade}' + (f'/{alpha}' if alpha else '')
    lines.append(f'body .{esc(name)} {{ color: {TEXT[fam][shade]}; }}')
for fam, shade, alpha in sorted(fill_tokens, key=lambda x: (x[0], x[1], x[2] or '')):
    name = f'bg-{fam}-{shade}' + (f'/{alpha}' if alpha else '')
    lines.append(f'body .{esc(name)} {{ background-color: {FILL[fam]}; }}')
for fam, shade, alpha in sorted(accent_text, key=lambda x: (x[0], x[1], x[2] or '')):
    name = f'text-{fam}-{shade}' + (f'/{alpha}' if alpha else '')
    lines.append(f'body .{esc(name)} {{ color: rgb(var(--acc-300)); }}')
for fam, shade, alpha in sorted(soft_tokens):
    lines.append(f'body .{esc(f"text-{fam}-{shade}/{alpha}")} {{ color: rgb(var(--ink-muted)); }}')
TINT_COLOR = {'iris-cyan': 'var(--acc-400)', 'iris-gold': 'var(--gold)'}
for base, alpha in sorted(tint_caps):
    col = TINT_COLOR.get(base)
    if col is None:
        fam, shade = base.split('-')
        col = f'var(--acc-{shade})'
    lines.append(f'body .{esc(f"bg-{base}/{alpha}")} {{ background-color: rgb({col} / 0.12); }}')
for fam, shade, alpha in sorted(status_caps):
    lines.append(f'body .{esc(f"bg-{fam}-{shade}/{alpha}")} {{ background-color: rgb({STATUS_RGB[(fam, shade)]} / 0.14); }}')
open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'wrote {OUT}: {len(white_tokens)} white, {len(text_tokens)} text, {len(fill_tokens)} fill, {len(accent_text)} accent text, {len(tint_caps)} tint caps')
