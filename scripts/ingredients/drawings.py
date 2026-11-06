# RDECANTS ingredient drawings (96 x 96 viewBox), one sym(id, body, defs) per
# vocabulary id. Later definitions of the same id win. Rendered to WebP by render.py.
import math, random, sys

random.seed(7)
OUT = []

def f(v):
    s = f"{v:.1f}"
    return s[:-2] if s.endswith('.0') else s

def leaf(x, y, length, angle, width=None, fill='#5d8a4a', vein='#93b46e', tip=0.5):
    w = width if width is not None else length * 0.32
    l = length
    d = f"M0 0C{f(l*.25)} {f(-w)} {f(l*.7)} {f(-w)} {f(l)} 0C{f(l*.7)} {f(w)} {f(l*.25)} {f(w)} 0 0Z"
    s = f'<path transform="translate({f(x)} {f(y)}) rotate({f(angle)})" fill="{fill}" d="{d}"/>'
    if vein:
        s += f'<path transform="translate({f(x)} {f(y)}) rotate({f(angle)})" fill="none" stroke="{vein}" stroke-width="1.2" stroke-linecap="round" d="M2 0H{f(l*.92)}"/>'
    return s

def serrated_leaf(x, y, length, angle, width, fill, vein, teeth=6):
    l, w = length, width
    top, bot = [], []
    for i in range(1, teeth * 2):
        t = i / (teeth * 2)
        yy = w * math.sin(math.pi * t) * (1.0 if i % 2 else 0.78)
        top.append(f"{f(l*t)} {f(-yy)}")
        bot.append(f"{f(l*t)} {f(yy)}")
    d = "M0 0L" + "L".join(top) + f"L{f(l)} 0L" + "L".join(reversed(bot)) + "Z"
    s = f'<path transform="translate({f(x)} {f(y)}) rotate({f(angle)})" fill="{fill}" stroke-linejoin="round" d="{d}"/>'
    s += f'<path transform="translate({f(x)} {f(y)}) rotate({f(angle)})" fill="none" stroke="{vein}" stroke-width="1.1" stroke-linecap="round" d="M2 0H{f(l*.9)}'
    for i in range(1, 4):
        t = l * (0.22 + i * 0.18)
        s += f"M{f(t)} 0l{f(l*.12)} {f(-w*.55)}M{f(t)} 0l{f(l*.12)} {f(w*.55)}"
    s += '"/>'
    return s

def citrus_slice(cx, cy, r, rind, pith, flesh, light, n=8, rot=0):
    s = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{rind}"/>'
    s += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r*.88)}" fill="{pith}"/>'
    s += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r*.8)}" fill="{flesh}"/>'
    segs = []
    for i in range(n):
        a0 = math.radians(rot + i * 360 / n + 7)
        a1 = math.radians(rot + (i + 1) * 360 / n - 7)
        r1, r0 = r * .74, r * .16
        p = [(cx + r0 * math.cos((a0 + a1) / 2), cy + r0 * math.sin((a0 + a1) / 2)),
             (cx + r1 * math.cos(a0), cy + r1 * math.sin(a0)),
             (cx + r1 * math.cos(a1), cy + r1 * math.sin(a1))]
        segs.append(f"M{f(p[0][0])} {f(p[0][1])}L{f(p[1][0])} {f(p[1][1])}A{f(r1)} {f(r1)} 0 0 1 {f(p[2][0])} {f(p[2][1])}Z")
    s += f'<path fill="{light}" d="{"".join(segs)}"/>'
    s += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r*.1)}" fill="{pith}"/>'
    return s

def grad(id_, stops, kind='radial', **attrs):
    a = ' '.join(f'{k}="{v}"' for k, v in attrs.items())
    st = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    tag = 'radialGradient' if kind == 'radial' else 'linearGradient'
    return f'<{tag} id="{id_}" {a}>{st}</{tag}>'

def shadow(cx=48, cy=86, rx=28, ry=3.2):
    return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="#3b3428" fill-opacity=".08"/>'

def sym(id_, body, defs=''):
    d = f'<defs>{defs}</defs>' if defs else ''
    OUT.append(f'  <symbol id="ingredient-{id_}" viewBox="0 0 96 96">{d}<g stroke="none">{body}</g></symbol>')

# ── Citrus ──────────────────────────────────────────────────────────────────
def whole_citrus(id_, cx, cy, rx, ry, stops, pores, rot=0):
    g = grad(f'ingredient-{id_}-peel', stops, cx='35%', cy='30%', r='75%')
    s = f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" transform="rotate({rot} {f(cx)} {f(cy)})" fill="url(#ingredient-{id_}-peel)"/>'
    dots = ''
    for _ in range(14):
        a = random.uniform(0, 2 * math.pi); rr = random.uniform(.2, .8)
        dots += f'<circle cx="{f(cx + rx*rr*math.cos(a))}" cy="{f(cy + ry*rr*math.sin(a))}" r=".9"/>'
    s += f'<g fill="{pores}" fill-opacity=".55">{dots}</g>'
    s += f'<ellipse cx="{f(cx-rx*.35)}" cy="{f(cy-ry*.4)}" rx="{f(rx*.22)}" ry="{f(ry*.12)}" transform="rotate(-30 {f(cx-rx*.35)} {f(cy-ry*.4)})" fill="#fff" fill-opacity=".45"/>'
    return g, s

g, s = whole_citrus('lemon', 36, 40, 27, 19, [('0', '#fbef8e'), ('.55', '#f0d23c'), ('1', '#d3ae1e')], '#c9a01a', rot=-24)
body = shadow(50, 86, 34) + leaf(52, 20, 22, -28, fill='#5f8a3f', vein='#94b061') + s
body += '<path fill="#e3c22b" d="M10 54c-4 1-6 4-4 6 3 1 5-1 7-3Z"/><path fill="#e3c22b" d="M60 24c3-3 7-3 8 0-1 3-5 3-7 2Z"/>'
body += citrus_slice(64, 63, 21, '#e8c42c', '#fbf4cc', '#f5df6c', '#faeca2')
sym('lemon', body, g)

g, s = whole_citrus('orange', 36, 40, 24, 24, [('0', '#ffc46a'), ('.55', '#f39a2a'), ('1', '#d6701a')], '#c86414')
body = shadow(50, 86, 34) + leaf(40, 17, 22, -40, fill='#4f7f3c', vein='#8bab5c') + s
body += '<circle cx="36" cy="17.5" r="2" fill="#7a6a2a"/>'
body += citrus_slice(64, 63, 21, '#ee9024', '#fdf0d6', '#f7a73e', '#fbc271')
sym('orange', body, g)

g, s = whole_citrus('mandarin', 42, 48, 27, 21, [('0', '#ffb257'), ('.55', '#f5821f'), ('1', '#d55d12')], '#c4540f')
body = shadow(48, 84, 32)
body += leaf(44, 27, 24, -150, fill='#3f7238', vein='#86a65b') + leaf(46, 27, 26, -20, fill='#4b8040', vein='#8eb062')
body += s + '<circle cx="45" cy="28" r="2.2" fill="#6b6a2a"/>'
body += '<path fill="#f69a3a" d="M64 70c6-9 16-11 22-7-2 9-11 14-22 7Z"/><path fill="#fbc077" d="M67 69c5-6 12-7 16-5-2 5-9 8-16 5Z"/>'
body += '<path fill="#f28c2c" d="M54 80c3-9 11-14 19-12 0 8-8 14-19 12Z"/><path fill="#fab46a" d="M57 78c3-6 8-9 13-8-1 5-6 8-13 8Z"/>'
sym('mandarin', body, g)

body = shadow(48, 86, 36)
body += '<path fill="#e98d58" d="M14 52a34 34 0 0 0 68 0Z"/>'
body += citrus_slice(48, 52, 34, '#f0a066', '#fdeedd', '#ee6f62', '#f69a8a', n=10)
body += '<path fill="#f3b07d" d="M14 52a34 8 0 0 0 68 0" fill-opacity="0"/>'
sym('grapefruit', body)

# ── Orchard & tropical fruit ───────────────────────────────────────────────
g = grad('ingredient-apple-skin', [('0', '#d6ec8a'), ('.5', '#9cc94a'), ('1', '#5e8f2c')], cx='35%', cy='35%', r='75%')
body = shadow(48, 86, 28)
body += '<path fill="url(#ingredient-apple-skin)" d="M48 28c-6-5-17-6-25 0-10 8-10 25-3 39 6 12 15 18 22 15 4-2 8-2 12 0 7 3 16-3 22-15 7-14 7-31-3-39-8-6-19-5-25 0Z"/>'
body += '<path fill="#4f7a2a" d="M48 30c-1-7 0-14 4-20l2 1c-3 6-4 12-4 19Z"/>'
body += leaf(51, 15, 20, -18, fill='#4f8a35', vein='#8ec060')
body += '<ellipse cx="31" cy="44" rx="5" ry="10" transform="rotate(20 31 44)" fill="#fff" fill-opacity=".35"/>'
body += '<path fill="none" stroke="#6f9a37" stroke-width="1.2" stroke-linecap="round" d="M42 31c3 2 9 2 12 0"/>'
sym('apple', body, g)

g = grad('ingredient-pear-skin', [('0', '#f1ec9a'), ('.55', '#cfc84f'), ('1', '#99962c')], cx='38%', cy='45%', r='70%')
body = shadow(48, 87, 26)
body += '<path fill="url(#ingredient-pear-skin)" d="M48 20c-7 0-10 7-11 15-1 7-6 11-11 18-7 10-5 23 6 29 9 5 23 5 32 0 11-6 13-19 6-29-5-7-10-11-11-18-1-8-4-15-11-15Z"/>'
body += '<path fill="#5f4a26" d="M47 21c0-6 2-11 5-14l2 1c-3 4-4 8-4 13Z"/>'
body += leaf(52, 11, 18, -10, fill='#5d8a3a', vein='#9cbf65')
body += '<g fill="#a29a3a" fill-opacity=".6"><circle cx="40" cy="62" r=".9"/><circle cx="55" cy="58" r=".9"/><circle cx="60" cy="70" r=".9"/><circle cx="44" cy="74" r=".9"/><circle cx="50" cy="45" r=".9"/></g>'
body += '<ellipse cx="36" cy="60" rx="4" ry="9" transform="rotate(15 36 60)" fill="#fff" fill-opacity=".35"/>'
sym('pear', body, g)

g = grad('ingredient-peach-skin', [('0', '#ffd9a0'), ('.45', '#f6a467'), ('1', '#d9574a')], cx='30%', cy='35%', r='80%')
body = shadow(48, 86, 30)
body += '<path fill="url(#ingredient-peach-skin)" d="M47 26c-14-3-30 8-30 27 0 17 13 29 30 29s30-12 30-29c0-19-15-30-30-27Z"/>'
body += '<path fill="none" stroke="#d26a4c" stroke-width="1.6" stroke-linecap="round" d="M48 28c-6 12-6 33 1 51"/>'
body += leaf(49, 26, 24, -30, fill='#4f7f3c', vein='#8bab5c')
body += '<ellipse cx="32" cy="46" rx="5" ry="9" transform="rotate(25 32 46)" fill="#fff" fill-opacity=".3"/>'
sym('peach', body, g)

g = grad('ingredient-plum-skin', [('0', '#a17aa8'), ('.45', '#6a3c78'), ('1', '#3c1d47')], cx='35%', cy='30%', r='80%')
body = shadow(48, 86, 26)
body += '<ellipse cx="48" cy="56" rx="24" ry="28" fill="url(#ingredient-plum-skin)"/>'
body += '<path fill="none" stroke="#4a2656" stroke-width="1.4" stroke-linecap="round" d="M50 29c4 14 4 37-2 55"/>'
body += '<path fill="#5a4426" d="M48 30c0-6 2-11 6-15l2 1c-3 4-5 9-5 14Z"/>'
body += leaf(54, 17, 20, -15, fill='#4f7f3c', vein='#8bab5c')
body += '<ellipse cx="38" cy="46" rx="5" ry="10" transform="rotate(15 38 46)" fill="#e8dcef" fill-opacity=".35"/>'
sym('plum', body, g)

g = grad('ingredient-cherry-skin', [('0', '#f2706f'), ('.5', '#c21f2e'), ('1', '#7a0f1c')], cx='35%', cy='30%', r='75%')
body = shadow(48, 86, 32)
body += '<path fill="none" stroke="#5e6a2c" stroke-width="2.2" stroke-linecap="round" d="M30 58c4-18 12-34 26-44M64 60c-2-16-4-30-8-46"/>'
body += leaf(56, 14, 22, -10, fill='#4f8a35', vein='#8ec060')
body += '<circle cx="30" cy="66" r="16" fill="url(#ingredient-cherry-skin)"/><circle cx="64" cy="68" r="15" fill="url(#ingredient-cherry-skin)"/>'
body += '<ellipse cx="25" cy="60" rx="3" ry="5" transform="rotate(30 25 60)" fill="#fff" fill-opacity=".5"/><ellipse cx="59" cy="62" rx="3" ry="5" transform="rotate(30 59 62)" fill="#fff" fill-opacity=".5"/>'
sym('cherry', body, g)

g = grad('ingredient-raspberry-drupe', [('0', '#ff8aa1'), ('.55', '#dd2f5c'), ('1', '#9c1438')], cx='35%', cy='30%', r='70%')
body = shadow(48, 86, 26)
body += leaf(48, 26, 20, -150, fill='#4d7f3a', vein=None) + leaf(48, 26, 20, -30, fill='#4d7f3a', vein=None) + leaf(48, 24, 16, -90, fill='#5e9045', vein=None)
pts = []
for row, (yy, n, half) in enumerate([(34, 4, 15), (44, 5, 20), (54, 5, 21), (64, 4, 18), (73, 3, 12), (80, 2, 6)]):
    for i in range(n):
        xx = 48 - half + (2 * half) * (i / (n - 1) if n > 1 else .5)
        pts.append((xx, yy))
body += ''.join(f'<circle cx="{f(x)}" cy="{f(y)}" r="6.2" fill="url(#ingredient-raspberry-drupe)"/>' for x, y in pts)
body += ''.join(f'<circle cx="{f(x-1.8)}" cy="{f(y-2)}" r="1.3" fill="#fff" fill-opacity=".55"/>' for x, y in pts)
sym('raspberry', body, g)

g = grad('ingredient-melon-flesh', [('0', '#ffc27a'), ('.6', '#f79a4c'), ('1', '#e97f35')], kind='linear', x1='0', y1='0', x2='0', y2='1')
body = shadow(48, 86, 36)
body += '<path fill="#a9b56d" d="M8 44c10 30 70 30 80 0Z"/>'
body += '<path fill="#e7e6b8" d="M12 44c10 24 62 24 72 0Z"/>'
body += '<path fill="url(#ingredient-melon-flesh)" d="M15 44c10 20 56 20 66 0Z"/>'
body += '<path fill="#f3c27c" d="M28 44c6 7 34 7 40 0Z"/>'
body += '<g fill="#fff3d6">' + ''.join(f'<ellipse cx="{f(32 + i*4.5)}" cy="{f(46 + (1 if i % 2 else 0))}" rx="1.5" ry="2.6"/>' for i in range(8)) + '</g>'
body += '<path fill="none" stroke="#c8cf96" stroke-width="1" d="M14 52l8 10m6-6 8 9m6-7 6 8m6-8 6 8m6-8 6 6m6-6 4 4M20 60l10-8m2 12 10-8m4 10 10-8m4 8 10-8"/>'
sym('melon', body, g)

g = grad('ingredient-pineapple-body', [('0', '#f6d36a'), ('.55', '#e0a53a'), ('1', '#b8761f')], cx='40%', cy='40%', r='75%')
body = shadow(48, 88, 22)
for i, (a, l) in enumerate([(-90, 28), (-115, 24), (-65, 24), (-140, 18), (-40, 18), (-100, 30), (-80, 30)]):
    col = '#4f8a3c' if i % 2 else '#3f7234'
    body += f'<path transform="translate(48 34) rotate({a})" fill="{col}" d="M0 -3C{f(l*.5)} -3 {f(l*.8)} -1 {l} 0C{f(l*.8)} 1 {f(l*.5)} 3 0 3Z"/>'
body += '<ellipse cx="48" cy="60" rx="20" ry="26" fill="url(#ingredient-pineapple-body)"/>'
lines = ''
for k in range(-4, 5):
    lines += f'M{f(28 + k*9)} 36l{24} 48M{f(68 - k*9)} 36l{-24} 48'
body += f'<clipPath id="ingredient-pineapple-clip"><ellipse cx="48" cy="60" rx="20" ry="26"/></clipPath>'
body += f'<g clip-path="url(#ingredient-pineapple-clip)"><path fill="none" stroke="#a96c1d" stroke-width="1.3" d="{lines}"/></g>'
for yy in range(42, 82, 9):
    for xx in range(34, 64, 9):
        if (xx - 48) ** 2 / 20 ** 2 + (yy - 60) ** 2 / 26 ** 2 < .8:
            body += f'<circle cx="{xx + (4 if (yy // 9) % 2 else 0)}" cy="{yy}" r="1.3" fill="#8b5a17" fill-opacity=".6"/>'
sym('pineapple', body, g)

body = shadow(48, 84, 34)
body += '<ellipse cx="44" cy="54" rx="32" ry="26" fill="#6e4528"/>'
body += '<g fill="none" stroke="#9a6a42" stroke-width="1.2" stroke-linecap="round">' + ''.join(
    f'<path d="M{f(44 + 31*math.cos(a))} {f(54 + 25*math.sin(a))}l{f(3*math.cos(a+.6))} {f(3*math.sin(a+.6))}"/>' for a in [i * .35 for i in range(18)]) + '</g>'
body += '<ellipse cx="44" cy="50" rx="27" ry="19" fill="#f8f4ea"/>'
body += '<ellipse cx="44" cy="52" rx="20" ry="13" fill="#efe6d4"/>'
body += '<path fill="#5b3a22" d="M64 70c6-8 16-9 22-4-4 10-14 12-22 4Z"/><path fill="#fbf7ee" d="M67 68c5-5 12-6 16-3-4 5-10 6-16 3Z"/>'
sym('coconut', body)

# ── Flowers ─────────────────────────────────────────────────────────────────
body = ''
stems = [((48, 90), (32, 22)), ((48, 90), (50, 12)), ((48, 90), (66, 24))]
for (x0, y0), (x1, y1) in stems:
    body += f'<path fill="none" stroke="#6d8c55" stroke-width="2" stroke-linecap="round" d="M{x0} {y0}L{x1} {y1}"/>'
body += leaf(46, 78, 18, -120, width=3, fill='#7f9a63', vein=None) + leaf(50, 76, 18, -60, width=3, fill='#7f9a63', vein=None)
for (x0, y0), (x1, y1) in stems:
    for i in range(9):
        t = 0.05 + i * 0.055
        x = x1 + (x0 - x1) * t; y = y1 + (y0 - y1) * t
        ang = math.degrees(math.atan2(y0 - y1, x0 - x1))
        col = '#8a6bbd' if i % 2 else '#7356a8'
        for side in (-1, 1):
            body += f'<ellipse cx="{f(x + side*2.6)}" cy="{f(y)}" rx="2.6" ry="3.8" transform="rotate({f(ang - 90 + side*25)} {f(x + side*2.6)} {f(y)})" fill="{col}"/>'
    body += f'<circle cx="{f(x1)}" cy="{f(y1)}" r="2.4" fill="#9a7fcc"/>'
sym('lavender', body)

g = grad('ingredient-rose-petal', [('0', '#f6a0b4'), ('.55', '#e0577a'), ('1', '#b02e56')], cx='45%', cy='40%', r='70%')
body = shadow(48, 88, 24)
body += '<path fill="none" stroke="#4f7a3a" stroke-width="2.4" stroke-linecap="round" d="M48 88c0-12 0-22 0-30"/>'
body += serrated_leaf(47, 78, 22, -150, 7, '#4b7a3a', '#86ad5e') + serrated_leaf(49, 74, 22, -30, 7, '#558a42', '#8fb766')
body += '<path fill="url(#ingredient-rose-petal)" d="M48 58c-16 2-26-8-24-22 2-10 10-17 24-18 14 1 22 8 24 18 2 14-8 24-24 22Z"/>'
body += '<path fill="#c63e66" d="M29 38c2-9 10-15 19-15 9 0 17 6 19 15-6-5-12-7-19-7s-13 2-19 7Z"/>'
body += '<path fill="#f08aa4" d="M33 42c4-8 9-11 15-11 7 0 12 4 15 10-5-3-9-4-15-4-6 0-10 2-15 5Z"/>'
body += '<path fill="none" stroke="#9d2348" stroke-width="1.6" stroke-linecap="round" d="M40 40c4-6 13-6 16 0 2 5-3 9-8 8-4-1-5-5-2-7"/>'
body += '<path fill="none" stroke="#f7b8c8" stroke-width="1.2" stroke-linecap="round" d="M28 48c6 6 14 8 20 8m20-8c-5 5-12 8-20 8"/>'
sym('rose', body, g)

body = ''
body += leaf(46, 64, 30, 150, width=10, fill='#2f6a3a', vein='#6d9a64') + leaf(52, 64, 30, 30, width=10, fill='#3a7a44', vein='#76a56b')
body += leaf(48, 70, 24, 95, width=8, fill='#2f6a3a', vein='#6d9a64')
def blossom(cx, cy, r, rot=0):
    s = ''
    for i in range(5):
        a = rot + i * 72
        s += f'<ellipse cx="{f(cx + r*.55*math.cos(math.radians(a)))}" cy="{f(cy + r*.55*math.sin(math.radians(a)))}" rx="{f(r*.5)}" ry="{f(r*.32)}" transform="rotate({f(a)} {f(cx + r*.55*math.cos(math.radians(a)))} {f(cy + r*.55*math.sin(math.radians(a)))})" fill="#fffcf2" stroke="#d9d2bd" stroke-width=".8"/>'
    s += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r*.2)}" fill="#cfd36a"/>'
    for i in range(8):
        a = math.radians(i * 45 + 10)
        s += f'<path fill="none" stroke="#e7b93a" stroke-width="1" stroke-linecap="round" d="M{f(cx)} {f(cy)}l{f(r*.32*math.cos(a))} {f(r*.32*math.sin(a))}"/><circle cx="{f(cx + r*.36*math.cos(a))}" cy="{f(cy + r*.36*math.sin(a))}" r="1.2" fill="#e2a72a"/>'
    return s
body += blossom(34, 40, 22, 10) + blossom(62, 46, 19, -20)
body += '<ellipse cx="56" cy="20" rx="5" ry="8" transform="rotate(20 56 20)" fill="#fbf6e6" stroke="#d9d2bd" stroke-width=".8"/><ellipse cx="70" cy="26" rx="4" ry="6.5" transform="rotate(35 70 26)" fill="#fbf6e6" stroke="#d9d2bd" stroke-width=".8"/>'
sym('orange_blossom', body)

# ── Herbs & leaves ──────────────────────────────────────────────────────────
body = '<path fill="none" stroke="#3f7a3a" stroke-width="2.2" stroke-linecap="round" d="M48 90V20"/>'
for y, l, side in [(74, 30, -1), (70, 30, 1), (56, 26, -1), (52, 26, 1), (38, 20, -1), (35, 20, 1)]:
    body += serrated_leaf(48, y, l, -90 + side * 62, l * .42, '#3f9a4a' if side > 0 else '#35864a', '#8ed08a', teeth=5)
body += serrated_leaf(48, 24, 16, -90, 6, '#4fb05a', '#9bdc93', teeth=4)
sym('mint', body)

body = '<path fill="none" stroke="#7b8a6a" stroke-width="2" stroke-linecap="round" d="M44 90c2-20 4-44 6-72"/>'
for y, l, side, c in [(80, 30, -1, '#8fa37f'), (72, 30, 1, '#9db08c'), (60, 26, -1, '#a3b594'), (50, 26, 1, '#8fa37f'), (38, 22, -1, '#9db08c'), (28, 18, 1, '#a9bb9a')]:
    x = 44 + (90 - y) * 6 / 72
    body += leaf(x, y, l, -90 + side * 55, width=l * .3, fill=c, vein='#c7d3b9')
body += leaf(50, 20, 12, -95, width=4, fill='#b4c4a4', vein=None)
sym('sage', body)

body = '<path fill="none" stroke="#6b5a3a" stroke-width="2.2" stroke-linecap="round" d="M30 88C40 64 52 40 66 12"/>'
for i in range(16):
    t = .08 + i * .055
    x = 30 + 36 * t; y = 88 - 76 * t
    for side in (-1, 1):
        body += f'<path transform="translate({f(x)} {f(y)}) rotate({f(-62 + side*58)})" fill="{"#3e6b44" if side > 0 else "#4a7c50"}" d="M0 -1.6C5 -1.8 10 -1 13 0C10 1 5 1.8 0 1.6Z"/>'
for x, y in [(40, 60), (52, 40), (60, 26)]:
    body += f'<circle cx="{x+5}" cy="{y}" r="2.6" fill="#8fa6d8"/><circle cx="{x+5}" cy="{y}" r="1" fill="#e5ecf8"/>'
sym('rosemary', body)

body = ''
body += shadow(48, 88, 30)
for x, y, a, l, c in [(48, 86, -158, 34, '#7a5a32'), (48, 86, -22, 34, '#8a6a3a'), (48, 86, -125, 50, '#2f5e33'), (48, 86, -55, 50, '#3a6c3a'), (48, 86, -90, 60, '#2b5530')]:
    body += serrated_leaf(x, y, l, a, l * .36, c, '#79a06a' if c.startswith('#2') or c.startswith('#3') else '#b8955f', teeth=7)
body += '<path fill="none" stroke="#4a3a22" stroke-width="2.4" stroke-linecap="round" d="M48 90v-6"/>'
sym('patchouli', body)

body = ''
for i in range(9):
    x = 30 + i * 4.5
    c = ['#c49a5e', '#a77a43', '#d6b07a'][i % 3]
    body += f'<path fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round" d="M{f(x)} 46c{f(-2 + i % 3)} 14 {f(i % 2 * 3 - 2)} 28 {f(-4 + i)} 40"/>'
body += '<path fill="#8b6a3e" d="M28 44h40v8H28Z"/><path fill="none" stroke="#5e4526" stroke-width="1" d="M30 46h36M30 50h36"/>'
for i, (x, a) in enumerate([(34, -110), (40, -100), (48, -90), (56, -80), (62, -70)]):
    body += f'<path transform="translate({x} 44) rotate({a})" fill="{"#7f9a4f" if i % 2 else "#6c8a42"}" d="M0 -2C12 -2 24 -1 36 0C24 1 12 2 0 2Z"/>'
sym('vetiver', body)

body = ''
body += shadow(48, 88, 30)
for i, (a, l, c) in enumerate([(-145, 46, '#9a6a34'), (-35, 46, '#b07a3a'), (-112, 60, '#c48a42'), (-68, 60, '#8a5a2c'), (-90, 66, '#a8743a')]):
    body += leaf(48, 86, l, a, width=l * .3, fill=c, vein='#e2c08a')
    body += f'<path transform="translate(48 86) rotate({a})" fill="none" stroke="#e2c08a" stroke-opacity=".6" stroke-width=".9" stroke-linecap="round" d="M{f(l*.3)} 0l{f(l*.12)} {f(-l*.12)}M{f(l*.3)} 0l{f(l*.12)} {f(l*.12)}M{f(l*.55)} 0l{f(l*.1)} {f(-l*.1)}M{f(l*.55)} 0l{f(l*.1)} {f(l*.1)}"/>'
body += '<path fill="none" stroke="#5e4a2a" stroke-width="2.4" stroke-linecap="round" d="M48 88v-6"/>'
sym('tobacco', body)

# ── Spices ──────────────────────────────────────────────────────────────────
g = grad('ingredient-cardamom-pod', [('0', '#d0e08e'), ('.5', '#a4bd5c'), ('1', '#6e8a36')], cx='40%', cy='35%', r='75%')
body = shadow(48, 84, 32)
for x, y, a in [(12, 46, -24), (46, 30, 18)]:
    body += f'<g transform="translate({x} {y}) rotate({a}) scale(1.35)"><path fill="url(#ingredient-cardamom-pod)" d="M0 0C6 -11 22 -11 28 0C22 11 6 11 0 0Z"/><path fill="none" stroke="#7d9640" stroke-width="1" d="M3 0H25M5 -4C11 -7 17 -7 23 -4M5 4C11 7 17 7 23 4"/><path fill="#8a7a3a" d="M27 -1l4 1-4 1Z"/></g>'
body += '<g transform="translate(26 72) rotate(-8) scale(1.4)"><path fill="url(#ingredient-cardamom-pod)" d="M0 0C6 -13 26 -13 32 0Z"/><path fill="#c3d483" d="M0 0C6 13 26 13 32 0Z"/>'
body += ''.join(f'<circle cx="{f(7 + i*4.2)}" cy="{f(-2 + (i % 2) * 3)}" r="2.4" fill="#2d2a24"/>' for i in range(6)) + '</g>'
sym('cardamom', body, g)

def corns(pts, grad_id, hi='#ffffff', hi_op='.35', r=7):
    s = ''
    for x, y in pts:
        s += f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" fill="url(#{grad_id})"/>'
        s += f'<path fill="none" stroke="{hi}" stroke-opacity="{hi_op}" stroke-width="1" stroke-linecap="round" d="M{f(x-3.5)} {f(y-2)}c2-2 5-2 6 0M{f(x-2)} {f(y+2.5)}c2 1 4 0 5-2"/>'
    return s
g = grad('ingredient-pepper-corn', [('0', '#6b6258'), ('.5', '#3b352f'), ('1', '#1f1b18')], cx='35%', cy='30%', r='75%')
pile = [(28, 74), (42, 76), (56, 76), (70, 74), (35, 63), (49, 64), (63, 63), (42, 52), (56, 52), (49, 41)]
body = shadow(48, 84, 30) + corns(pile, 'ingredient-pepper-corn')
sym('pepper', body, g)

g = grad('ingredient-pink-pepper-berry', [('0', '#ffb3b9'), ('.5', '#e5566b'), ('1', '#a82c45')], cx='35%', cy='30%', r='75%')
body = '<path fill="none" stroke="#8a6a4a" stroke-width="1.6" stroke-linecap="round" d="M48 90C46 70 44 50 30 24M46 62c6-10 14-18 26-24M44 46c-6-8-14-12-22-12"/>'
berries = [(30, 24), (24, 30), (34, 30), (28, 37), (70, 38), (64, 34), (74, 46), (66, 44), (22, 34), (16, 38), (38, 40), (58, 46), (52, 54), (40, 22)]
body += corns(berries, 'ingredient-pink-pepper-berry', r=5.2)
body += leaf(48, 80, 20, -150, width=4, fill='#6f8d55', vein=None) + leaf(48, 76, 20, -30, width=4, fill='#7d9a60', vein=None)
sym('pink_pepper', body, g)

g = grad('ingredient-cinnamon-bark', [('0', '#c77a45'), ('.5', '#9b5228'), ('1', '#6e3618')], kind='linear', x1='0', y1='0', x2='0', y2='1')
body = shadow(48, 84, 34)
for i, (y, rot) in enumerate([(46, -14), (58, -8), (70, -2)]):
    body += f'<g transform="rotate({rot} 48 {y})"><rect x="14" y="{y-6}" width="64" height="12" rx="3" fill="url(#ingredient-cinnamon-bark)"/>'
    body += f'<path fill="none" stroke="#7a3d1c" stroke-width=".9" d="M20 {y-2}h50M24 {y+2}h40"/>'
    body += f'<circle cx="78" cy="{y}" r="6" fill="#b86a38"/><path fill="none" stroke="#7a3d1c" stroke-width="1.2" stroke-linecap="round" d="M78 {y-3}a3 3 0 1 1-2.6 4.5"/></g>'
body += '<path fill="none" stroke="#e7d7b2" stroke-width="2.2" d="M40 36c2 14 2 28 0 42M46 36c2 14 2 28 0 42"/>'
sym('cinnamon', body, g)

g = grad('ingredient-ginger-skin', [('0', '#ecd09b'), ('.55', '#d3a868'), ('1', '#a87a3e')], cx='40%', cy='35%', r='75%')
body = shadow(48, 84, 34)
body += '<path fill="url(#ingredient-ginger-skin)" d="M14 60c0-9 8-12 14-10 2-10 12-14 19-8 4-7 15-8 19 0 9-2 15 5 12 13 6 4 4 14-4 15-6 1-10-3-12-6-6 6-16 6-20 0-6 6-16 7-22 2-5-1-6-3-6-6Z"/>'
body += '<path fill="none" stroke="#a87a3e" stroke-width="1" stroke-linecap="round" d="M24 58c3 1 6 1 8 0m10-6c3 1 6 1 8-1m10 0c2 2 5 3 8 2m-30 18c3 1 6 1 9-1"/>'
body += '<circle cx="74" cy="34" r="12" fill="#d6ad6c"/><circle cx="74" cy="34" r="10" fill="#f6e2a8"/><circle cx="74" cy="34" r="6" fill="#f1d48a" fill-opacity=".7"/>'
sym('ginger', body, g)

g = grad('ingredient-tonka-bean', [('0', '#5a4434'), ('.5', '#33261e'), ('1', '#1b1410')], cx='35%', cy='35%', r='75%')
body = shadow(48, 84, 32)
for x, y, a in [(16, 46, -20), (24, 64, 4), (40, 76, -10)]:
    body += f'<g transform="translate({x} {y}) rotate({a})"><path fill="url(#ingredient-tonka-bean)" d="M0 0C4 -9 44 -11 52 -2C48 7 6 9 0 0Z"/>'
    body += '<path fill="none" stroke="#6e5644" stroke-width="1" stroke-linecap="round" d="M6 -2c6 2 10-2 16 0s10 2 16-1M8 2c8 1 14-1 22 1"/></g>'
sym('tonka_bean', body, g)

g = grad('ingredient-coffee-bean', [('0', '#a06a42'), ('.5', '#6e4024'), ('1', '#3f2314')], cx='35%', cy='30%', r='75%')
body = shadow(48, 84, 30)
for x, y, a in [(32, 58, -30), (60, 44, 20), (58, 72, 60)]:
    body += f'<g transform="translate({x} {y}) rotate({a})"><ellipse rx="16" ry="11" fill="url(#ingredient-coffee-bean)"/><path fill="none" stroke="#2e180c" stroke-width="2" stroke-linecap="round" d="M-13 0c6-4 10 4 16 0s8-2 10 0"/><ellipse cx="-6" cy="-5" rx="5" ry="2" fill="#fff" fill-opacity=".18"/></g>'
sym('coffee', body, g)

# ── Gourmand & resins ───────────────────────────────────────────────────────
g = grad('ingredient-caramel-cube', [('0', '#f4c27a'), ('.5', '#d8893a'), ('1', '#a95d1f')], kind='linear', x1='0', y1='0', x2='1', y2='1')
body = shadow(48, 86, 34)
def cube(x, y, s, gid):
    return (f'<path fill="url(#{gid})" d="M{x} {y+s*.3}L{x+s*.5} {y}L{x+s} {y+s*.3}V{y+s}L{x+s*.5} {y+s*1.3}L{x} {y+s}Z"/>'
            f'<path fill="#f7cf8e" fill-opacity=".7" d="M{x} {y+s*.3}L{x+s*.5} {y}L{x+s} {y+s*.3}L{x+s*.5} {y+s*.6}Z"/>'
            f'<path fill="#a35a1c" fill-opacity=".45" d="M{x+s*.5} {y+s*.6}L{x+s} {y+s*.3}V{y+s}L{x+s*.5} {y+s*1.3}Z"/>')
body += cube(14, 44, 30, 'ingredient-caramel-cube') + cube(50, 40, 32, 'ingredient-caramel-cube')
body += '<path fill="#c97a2e" d="M56 46c4 0 6 2 6 6v8c0 2-3 2-3 0v-5c0-2-3-2-3 0v10c0 3-4 3-4 0v-15c0-2 2-4 4-4Z" fill-opacity=".85"/>'
body += '<ellipse cx="24" cy="54" rx="3" ry="1.4" fill="#fff" fill-opacity=".5"/><ellipse cx="62" cy="50" rx="3" ry="1.4" fill="#fff" fill-opacity=".5"/>'
sym('caramel', body, g)

g = grad('ingredient-honey-drop', [('0', '#ffd66b'), ('.5', '#f0a62a'), ('1', '#c4741a')], cx='40%', cy='35%', r='75%')
body = shadow(48, 88, 22)
body += '<path fill="#a8783e" d="M70 8l4 4-30 30-4-4Z"/>'
body += '<g transform="rotate(45 40 46)"><rect x="24" y="36" width="32" height="20" rx="9" fill="#c8945a"/>'
body += '<path fill="none" stroke="#8a5e2c" stroke-width="2.4" d="M30 37v18M37 36v20M44 36v20M51 37v18"/></g>'
body += '<path fill="url(#ingredient-honey-drop)" d="M34 52c4 6 6 12 6 18 0 8-5 12-10 12s-10-4-10-12c0-6 4-12 8-18Z"/>'
body += '<path fill="url(#ingredient-honey-drop)" d="M30 50c-2 4 0 8 4 8s6-4 4-8Z"/>'
body += '<ellipse cx="26" cy="70" rx="2" ry="4" fill="#fff" fill-opacity=".5"/>'
sym('honey', body, g)

g = grad('ingredient-amber-stone', [('0', '#ffdc8a'), ('.45', '#f0a12e'), ('1', '#a9530f')], cx='35%', cy='30%', r='80%')
body = shadow(48, 86, 32)
body += '<path fill="url(#ingredient-amber-stone)" d="M12 60l8-20 22-6 16 14-4 24-22 8-16-8Z"/>'
body += '<path fill="#ffe7a6" fill-opacity=".55" d="M20 40l22-6-6 16-16 2Z"/><path fill="#b8601a" fill-opacity=".45" d="M58 48l-4 24-22 8 4-18Z"/><path fill="#f7b445" fill-opacity=".5" d="M36 50l22-2-22 14-24-2Z"/>'
body += '<path fill="url(#ingredient-amber-stone)" d="M54 34l12-14 16 4 4 18-12 12-16-4Z"/>'
body += '<path fill="#ffe7a6" fill-opacity=".55" d="M66 20l16 4-10 8-8-2Z"/><path fill="#b8601a" fill-opacity=".45" d="M86 42l-12 12-2-16Z"/>'
body += '<g fill="#7a3a0a" fill-opacity=".45"><circle cx="34" cy="64" r="1.4"/><circle cx="42" cy="58" r="1"/><circle cx="72" cy="40" r="1.1"/></g>'
sym('amber', body, g)

g = grad('ingredient-musk-puff', [('0', '#fffdf8'), ('.6', '#f3ece2'), ('1', '#ddd0c0')], cx='40%', cy='35%', r='70%')
body = shadow(48, 80, 32)
body += '<path fill="url(#ingredient-musk-puff)" d="M22 72c-9 0-15-6-15-14 0-7 5-12 12-13 0-11 9-19 20-19 7 0 13 3 16 9 3-2 6-3 10-3 10 0 17 7 17 16 7 1 11 7 11 13 0 6-5 11-12 11Z"/>'
body += '<path fill="#fff" fill-opacity=".9" d="M28 38c3-5 9-8 15-7-6 2-10 5-12 10Z"/>'
body += '<path fill="none" stroke="#d9cab6" stroke-width="1.2" stroke-linecap="round" d="M22 64c12 3 44 3 56 0M30 54c3 3 8 4 12 3"/>'
body += '<g fill="#e3d4bf"><circle cx="74" cy="22" r="2.4"/><circle cx="83" cy="31" r="1.5"/><circle cx="16" cy="32" r="1.8"/><circle cx="24" cy="22" r="1.2"/></g>'
sym('musk', body, g)

body = shadow(48, 84, 30)
crystals = [(26, 72, 10, 8), (40, 74, 11, 4), (56, 73, 10, -6), (70, 72, 9, 10), (33, 60, 10, -4), (48, 61, 11, 12), (62, 60, 9, -10), (40, 48, 9, 6), (55, 48, 9, -8), (48, 37, 8, 3)]
for i, (x, y, s, a) in enumerate(crystals):
    top = '#ffffff' if i % 2 else '#f6f8fa'
    body += f'<g transform="rotate({a} {x} {y})"><path fill="#dfe6ec" d="M{x-s/2} {y-s/2}h{s}v{s}h{-s}Z"/><path fill="{top}" d="M{x-s/2} {y-s/2}l{s*.25} {-s*.25}h{s}l{-s*.25} {s*.25}Z"/><path fill="#c7d2dc" d="M{x+s/2} {y-s/2}l{s*.25} {-s*.25}v{s}l{-s*.25} {s*.25}Z"/></g>'
body += '<g fill="#fff"><circle cx="44" cy="58" r="1"/><circle cx="60" cy="70" r="1"/><circle cx="30" cy="70" r="1"/></g>'
sym('salt', body)

body = shadow(48, 86, 34)
body += '<path fill="#7b4a2c" d="M12 40c10-6 26-8 40-6 10 1 20 0 32-4l-2 34c-12 6-24 7-36 5-12-2-24 0-34 6Z"/>'
body += '<path fill="#9a643c" d="M12 40c10-6 26-8 40-6 10 1 20 0 32-4-2 6-10 12-26 13-18 1-34 1-46-3Z"/>'
body += '<path fill="#5f3720" d="M12 75c10-6 22-8 34-6 12 2 24 1 36-5l-1 8c-12 6-24 7-36 5-12-2-23 0-33 6Z"/>'
body += '<path fill="none" stroke="#e2c6a2" stroke-width="1.1" stroke-dasharray="3 2.4" stroke-linecap="round" d="M16 46c10-4 24-5 36-4 10 1 20 0 28-3M16 70c10-5 22-6 32-4 12 2 22 1 32-4"/>'
body += '<path fill="#a8744a" fill-opacity=".35" d="M30 54c8-2 18-2 26 0-8 3-18 3-26 0Z"/>'
sym('leather', body)

# ── Woods ───────────────────────────────────────────────────────────────────
g = grad('ingredient-woods-heart', [('0', '#f2d4a2'), ('.6', '#dcb27a'), ('1', '#c4945a')], cx='50%', cy='50%', r='55%')
body = shadow(48, 86, 34)
body += '<ellipse cx="48" cy="50" rx="36" ry="32" fill="#6e4a2c"/>'
body += '<ellipse cx="48" cy="50" rx="31" ry="27" fill="url(#ingredient-woods-heart)"/>'
body += '<g fill="none" stroke="#b9875a" stroke-width="1.2">' + ''.join(
    f'<ellipse cx="{f(48 + i*.6)}" cy="{f(50 - i*.3)}" rx="{f(27 - i*5)}" ry="{f(23 - i*4.3)}"/>' for i in range(5)) + '</g>'
body += '<path fill="none" stroke="#8a5e36" stroke-width="1.4" stroke-linecap="round" d="M48 50l14-16M48 50l-6 22"/>'
body += '<g fill="none" stroke="#4f331d" stroke-width="1.1" stroke-linecap="round"><path d="M16 36l-3-2M14 58l-3 1M82 40l3-2M80 64l3 2M30 78l-1 3M66 78l1 3M34 21l-1-3M62 21l1-3"/></g>'
sym('woods', body, g)

body = '<path fill="none" stroke="#6b4a2c" stroke-width="2.6" stroke-linecap="round" d="M14 80C34 66 52 50 82 22"/>'
def spray(x, y, a, n, c1, c2):
    s = f'<path transform="translate({x} {y}) rotate({a})" fill="none" stroke="{c1}" stroke-width="1.6" stroke-linecap="round" d="M0 0H{n*5}"/>'
    for i in range(n):
        for side in (-1, 1):
            s += f'<path transform="translate({x} {y}) rotate({a}) translate({i*5+2} 0) rotate({side*50})" fill="{c2 if i % 2 else c1}" d="M0 0C2 -2 6 -2 8 0C6 2 2 2 0 0Z"/>'
    return s
for x, y, a, n in [(28, 70, -120, 6), (40, 60, -60, 7), (52, 48, -130, 6), (60, 42, -30, 6), (70, 32, -100, 5), (30, 72, 20, 5)]:
    body += spray(x, y, a, n, '#3f6f45', '#5a8a55')
body += '<g transform="translate(70 66) rotate(-20)"><ellipse rx="9" ry="12" fill="#8a5a34"/><path fill="none" stroke="#5e3a1e" stroke-width="1.2" d="M-8 -4h16M-8 4h16M-5 -10c3 2 7 2 10 0M-5 10c3-2 7-2 10 0M0 -12v24"/></g>'
sym('cedar', body)

g = grad('ingredient-sandalwood-grain', [('0', '#f0c99a'), ('.5', '#d9a36e'), ('1', '#b77d4a')], kind='linear', x1='0', y1='0', x2='1', y2='0')
body = shadow(48, 86, 34)
for i, (y, rot, w) in enumerate([(52, -10, 62), (66, -4, 66)]):
    body += f'<g transform="rotate({rot} 48 {y})"><path fill="url(#ingredient-sandalwood-grain)" d="M{48-w/2} {y-8}h{w}l4 8-4 8h{-w}l-4-8Z"/>'
    body += f'<path fill="none" stroke="#b47744" stroke-width=".9" stroke-linecap="round" d="M{48-w/2+4} {y-4}c12 -2 22 2 34 0s16-1 {w-42} 0M{48-w/2+4} {y+1}c14 1 24-2 36 0s14 1 {w-44} 0M{48-w/2+6} {y+5}c10 1 20-1 30 0"/>'
    body += f'<path fill="#c98d58" d="M{48+w/2} {y-8}l4 8-4 8Z"/></g>'
body += '<g transform="rotate(-24 50 34)"><path fill="url(#ingredient-sandalwood-grain)" d="M30 30h40l3 5-3 5H30l-3-5Z"/><path fill="none" stroke="#b47744" stroke-width=".9" d="M33 34h34M36 37h28"/></g>'
sym('sandalwood', body, g)

# ── Fresh ───────────────────────────────────────────────────────────────────
g = grad('ingredient-marine-wave', [('0', '#a9dcea'), ('.5', '#4fa3c3'), ('1', '#1f6b8f')], kind='linear', x1='0', y1='0', x2='0', y2='1')
body = '<path fill="url(#ingredient-marine-wave)" d="M8 84V60c6-24 26-40 48-38 16 2 26 14 24 26-2 10-12 14-20 10 6-4 6-12 0-16-8-5-20 0-24 12-4 12 0 22 10 28 10 6 26 6 42 0v2Z"/>'
body += '<path fill="#e8f6fa" d="M56 22c16 2 26 14 24 26-2 10-12 14-20 10 8-2 12-8 10-16-2-9-10-15-22-16 2-2 5-4 8-4Z"/>'
body += '<path fill="#2b7da3" d="M8 84c14-4 26-4 40 0s26 4 40 0v4H8Z"/>'
body += '<g fill="#e8f6fa"><circle cx="76" cy="26" r="2"/><circle cx="83" cy="34" r="1.4"/><circle cx="70" cy="20" r="1.2"/></g>'
body += '<path fill="none" stroke="#bfe4ef" stroke-width="1.4" stroke-linecap="round" d="M18 66c4-10 10-18 18-22M14 76c6-2 12-2 18 0"/>'
sym('marine', body, g)


# ── Second batch (frequency tail) ─────────────────────────────────────────
def round_leaf(cx, cy, r, fill, vein, lobes=7):
    pts = []
    for i in range(lobes * 2):
        a = 2 * math.pi * i / (lobes * 2)
        rr = r if i % 2 == 0 else r * .82
        pts.append(f"{f(cx + rr*math.cos(a))} {f(cy + rr*math.sin(a))}")
    s = f'<path fill="{fill}" stroke-linejoin="round" d="M{"L".join(pts)}Z"/>'
    s += f'<path fill="none" stroke="{vein}" stroke-width="1" stroke-linecap="round" d="' + ''.join(
        f"M{f(cx)} {f(cy)}l{f(r*.75*math.cos(2*math.pi*i/lobes))} {f(r*.75*math.sin(2*math.pi*i/lobes))}" for i in range(lobes)) + '"/>'
    return s

body = '<path fill="none" stroke="#5a7a3a" stroke-width="2" stroke-linecap="round" d="M48 88V46M48 60c-8-4-14-4-20 0"/>'
body += round_leaf(30, 70, 14, '#4f7f3c', '#8bab5c') + round_leaf(66, 72, 12, '#5a8a45', '#95b866')
for x, y in [(40, 30), (50, 24), (58, 32), (44, 40), (54, 41), (36, 38), (62, 22)]:
    for i in range(5):
        a = math.radians(i * 72 - 90)
        px, py = x + 3.4 * math.cos(a), y + 3.4 * math.sin(a)
        col = '#e2587a' if (x + y) % 3 else '#f0789a'
        body += f'<ellipse cx="{f(px)}" cy="{f(py)}" rx="3.4" ry="2.6" transform="rotate({f(i*72-90)} {f(px)} {f(py)})" fill="{col}"/>'
    body += f'<circle cx="{x}" cy="{y}" r="1.4" fill="#b8304f"/>'
sym('geranium', body)

g = grad('ingredient-mango-skin', [('0', '#a9c75a'), ('.35', '#f2c94c'), ('.75', '#f08a3a'), ('1', '#d9473a')], kind='linear', x1='0', y1='0', x2='1', y2='1')
body = shadow(48, 86, 30)
body += '<path fill="url(#ingredient-mango-skin)" d="M22 46c0-18 16-28 32-26 18 2 28 16 26 32-2 16-14 28-30 28-12 0-18-6-20-14-1-6-4-8-6-10-2-3-2-6-2-10Z"/>'
body += '<path fill="#6b5a2a" d="M30 26c-2-5-1-10 2-13l2 1c-2 3-3 7-2 11Z"/>'
body += leaf(32, 14, 24, -15, fill='#3f7a3a', vein='#86b064')
body += '<ellipse cx="38" cy="40" rx="5" ry="10" transform="rotate(50 38 40)" fill="#fff" fill-opacity=".35"/>'
body += '<g fill="#7a6a2a" fill-opacity=".35"><circle cx="56" cy="44" r=".9"/><circle cx="62" cy="58" r=".9"/><circle cx="48" cy="64" r=".9"/></g>'
sym('mango', body, g)

g = grad('ingredient-incense-tear', [('0', '#fff8df'), ('.5', '#f1dc9e'), ('1', '#cfae5c')], cx='35%', cy='30%', r='80%')
body = shadow(48, 86, 30)
body += '<path fill="none" stroke="#c9c2b6" stroke-width="2" stroke-linecap="round" d="M52 52c-6-8 6-12 0-20s6-12 2-20"/><path fill="none" stroke="#ddd7cc" stroke-width="1.4" stroke-linecap="round" d="M60 48c4-6-4-10 0-16"/>'
for x, y, r in [(28, 74, 9), (44, 76, 10), (60, 75, 9), (74, 76, 7), (36, 64, 8), (52, 64, 9), (66, 65, 7)]:
    body += (f'<path fill="url(#ingredient-incense-tear)" d="M{x} {f(y-r*1.3)}c{f(r*.7)} {f(r*.6)} {f(r)} {f(r*1.2)} {f(r)} {f(r*1.6)}'
             f'a{r} {r} 0 0 1 {-2*r} 0c0 {f(-r*.4)} {f(r*.3)} {f(-r)} {r} {f(-r*1.6)}Z"/>')
    body += f'<ellipse cx="{f(x-r*.35)}" cy="{f(y-r*.1)}" rx="{f(r*.18)}" ry="{f(r*.32)}" fill="#fff" fill-opacity=".6"/>'
sym('incense', body, g)

body = shadow(48, 86, 36)
body += '<path fill="#9b958a" d="M10 80c2-14 14-24 30-26 20-2 38 4 46 18 2 4 0 8-4 8Z"/>'
for i in range(26):
    x = 14 + (i % 13) * 5.6 + (2 if i >= 13 else 0)
    y = (60 if i >= 13 else 68) - abs(48 - x) * .18
    c = ['#4f7a35', '#6a9440', '#3f6a2e', '#7fa94e'][i % 4]
    body += f'<circle cx="{f(x)}" cy="{f(y)}" r="{4.6 + (i % 3)}" fill="{c}"/>'
for x in range(20, 80, 7):
    top = 56 - abs(48 - x) * .18
    body += f'<path fill="none" stroke="#a9c46a" stroke-width="1.1" stroke-linecap="round" d="M{x} {f(top)}v-7"/><circle cx="{x}" cy="{f(top - 8)}" r="1.4" fill="#c6a45a"/>'
sym('moss', body)

g = grad('ingredient-passion-skin', [('0', '#a27aa6'), ('.5', '#5e3466'), ('1', '#341a3a')], cx='35%', cy='30%', r='80%')
body = shadow(48, 86, 34)
body += '<circle cx="34" cy="44" r="22" fill="url(#ingredient-passion-skin)"/><ellipse cx="27" cy="36" rx="5" ry="8" transform="rotate(30 27 36)" fill="#fff" fill-opacity=".25"/>'
body += '<g fill="#d8c8dc" fill-opacity=".5"><circle cx="40" cy="38" r="1"/><circle cx="30" cy="54" r="1"/><circle cx="44" cy="52" r="1"/></g>'
body += '<circle cx="62" cy="62" r="22" fill="#5e3466"/><circle cx="62" cy="62" r="19" fill="#f7ecd6"/><circle cx="62" cy="62" r="16" fill="#f2b83a"/>'
random.seed(3)
for _ in range(16):
    a = random.uniform(0, 2 * math.pi); rr = random.uniform(2, 13)
    x, y = 62 + rr * math.cos(a), 62 + rr * math.sin(a)
    body += f'<circle cx="{f(x)}" cy="{f(y)}" r="2.6" fill="#f7d36a"/><circle cx="{f(x)}" cy="{f(y)}" r="1.3" fill="#2a2018"/>'
sym('passion_fruit', body, g)

g = grad('ingredient-cocoa-pod', [('0', '#f2b84a'), ('.45', '#d9772a'), ('1', '#8a3a14')], cx='35%', cy='35%', r='80%')
body = shadow(48, 86, 34)
body += '<g transform="rotate(-28 44 44)"><path fill="url(#ingredient-cocoa-pod)" d="M6 44C14 30 34 24 50 25c16 1 28 8 36 19-8 11-20 18-36 19-16 1-36-5-44-19Z"/>'
body += '<path fill="none" stroke="#8a3a14" stroke-opacity=".6" stroke-width="1.5" stroke-linecap="round" d="M10 44h74M14 38c16-6 50-7 66 2M14 50c16 6 50 7 66-2M20 32c14-4 36-4 52 2M20 56c14 4 36 4 52-2"/>'
body += '<path fill="#6b4a26" d="M86 44l6-2v4Z"/></g>'
body += '<path fill="#f7efe0" d="M52 70c4-6 14-8 22-6 6 2 10 6 10 10-6 4-16 6-24 4-6-1-9-4-8-8Z"/>'
for x, y in [(60, 70), (68, 69), (76, 71), (64, 76), (72, 77)]:
    body += f'<ellipse cx="{x}" cy="{y}" rx="4" ry="2.8" fill="#6a3418"/>'
sym('cocoa', body, g)

g = grad('ingredient-peony-petal', [('0', '#ffd6e2'), ('.55', '#f19ab6'), ('1', '#d9688e')], cx='50%', cy='45%', r='60%')
body = '<path fill="none" stroke="#4f7a3a" stroke-width="2.2" stroke-linecap="round" d="M48 88V64"/>'
body += leaf(47, 80, 22, -150, width=7, fill='#4b7a3a', vein='#86ad5e') + leaf(49, 78, 22, -30, width=7, fill='#558a42', vein='#8fb766')
for ring, (r, n, c) in enumerate([(24, 9, '#e98aab'), (18, 8, 'url(#ingredient-peony-petal)'), (12, 7, '#f6b6ca'), (6, 5, '#f19ab6')]):
    for i in range(n):
        a = math.radians(i * 360 / n + ring * 17)
        x, y = 48 + r * .55 * math.cos(a), 44 + r * .5 * math.sin(a)
        body += f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r*.42)}" ry="{f(r*.34)}" transform="rotate({f(math.degrees(a))} {f(x)} {f(y)})" fill="{c}"/>'
body += '<circle cx="48" cy="44" r="3" fill="#f7d36a" fill-opacity=".8"/>'
sym('peony', body, g)

body = '<path fill="none" stroke="#5a7a3a" stroke-width="1.8" stroke-linecap="round" d="M40 88c0-14 0-26-4-38M56 88c0-12 2-24 8-34"/>'
body += '<path fill="#4f7f3c" d="M24 86c-6-10 0-22 12-20 4 8 0 18-12 20Z"/><path fill="#5a8a45" d="M72 86c6-10 0-22-12-20-4 8 0 18 12 20Z"/>'
def violet(cx, cy, r):
    s = ''
    for a, c in [(-125, '#7a4fb0'), (-55, '#7a4fb0'), (180, '#8e64c4'), (0, '#8e64c4'), (90, '#6a3f9e')]:
        x, y = cx + r * .55 * math.cos(math.radians(a)), cy + r * .55 * math.sin(math.radians(a))
        s += f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r*.5)}" ry="{f(r*.4)}" transform="rotate({a} {f(x)} {f(y)})" fill="{c}"/>'
    s += f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r*.16)}" fill="#f2c94c"/>'
    s += (f'<path fill="none" stroke="#f3eefa" stroke-width=".9" stroke-linecap="round" d="M{f(cx)} {f(cy+r*.2)}v{f(r*.4)}'
          f'M{f(cx-r*.2)} {f(cy+r*.15)}l{f(-r*.2)} {f(r*.3)}M{f(cx+r*.2)} {f(cy+r*.15)}l{f(r*.2)} {f(r*.3)}"/>')
    return s
body += violet(36, 42, 20) + violet(64, 50, 17)
sym('violet', body)

# ── Third batch: generic family notes drawn honestly as a mix ─────────────
body = shadow(48, 86, 34)
body += citrus_slice(32, 40, 18, '#e8c42c', '#fbf4cc', '#f5df6c', '#faeca2', rot=10)
body += citrus_slice(64, 44, 18, '#ee9024', '#fdf0d6', '#f7a73e', '#fbc271', rot=-5)
body += citrus_slice(48, 66, 18, '#5f9a35', '#eef3cf', '#b9d363', '#d6e69a', rot=20)
sym('citrus', body)

body = '<path fill="none" stroke="#4f7a3a" stroke-width="2" stroke-linecap="round" d="M48 90V40"/>'
for y, l, a, c in [(84, 34, -150, '#3f7a3a'), (80, 34, -30, '#5a9a45'), (66, 30, -135, '#6aa84f'), (62, 30, -45, '#4f8a3c'), (48, 26, -120, '#7fbf5a'), (46, 26, -60, '#5f9f48'), (40, 22, -90, '#8fcf68')]:
    body += leaf(48, y, l, a, width=l * .3, fill=c, vein='#b7dc93')
sym('green', body)

body = shadow(48, 86, 34)
body += f'<g transform="translate(30 66) rotate(-25)"><rect x="-22" y="-5" width="44" height="10" rx="3" fill="#9b5228"/><circle cx="22" cy="0" r="5" fill="#b86a38"/></g>'
for i in range(8):
    a = math.radians(i * 45)
    body += f'<path transform="translate(62 40) rotate({i*45})" fill="#7a3e1e" d="M0 0L14 -4 18 0 14 4Z"/>'
body += '<circle cx="62" cy="40" r="3" fill="#5a2c14"/>'
g2 = grad('ingredient-spices-corn', [('0', '#6b6258'), ('.5', '#3b352f'), ('1', '#1f1b18')], cx='35%', cy='30%', r='75%')
body += ''.join(f'<circle cx="{x}" cy="{y}" r="4.6" fill="url(#ingredient-spices-corn)"/>' for x, y in [(56, 74), (65, 72), (74, 75), (61, 64)])
body += '<path fill="#e9b13a" d="M20 34c4-6 10-8 16-6-2 6-8 10-16 6Z"/><path fill="#d9862a" d="M24 44c4-4 9-5 13-3-2 5-7 7-13 3Z"/>'
sym('spices', body, g2)

g = grad('ingredient-mineral-stone', [('0', '#e6e3dc'), ('.55', '#b9b4aa'), ('1', '#86817a')], cx='35%', cy='30%', r='80%')
body = shadow(48, 86, 34)
body += '<path fill="url(#ingredient-mineral-stone)" d="M12 76c-2-12 6-22 18-24 12-2 22 6 22 16 0 8-6 14-18 14-10 0-20 0-22-6Z"/>'
body += '<path fill="url(#ingredient-mineral-stone)" d="M46 74c0-14 10-26 24-26 10 0 16 8 16 18 0 10-8 16-20 16-10 0-20-1-20-8Z"/>'
body += '<path fill="url(#ingredient-mineral-stone)" d="M32 50c0-10 8-18 18-18s16 6 16 14c0 6-6 10-16 10s-18 0-18-6Z"/>'
body += '<g fill="#fff" fill-opacity=".45"><ellipse cx="40" cy="40" rx="6" ry="2.5"/><ellipse cx="22" cy="62" rx="5" ry="2"/><ellipse cx="62" cy="58" rx="6" ry="2.4"/></g>'
sym('mineral', body, g)

body = '<path fill="none" stroke="#6b4a2c" stroke-width="2.4" stroke-linecap="round" d="M48 90V14"/>'
for i in range(12):
    y = 22 + i * 5.4; w = 6 + i * 1.6
    c = '#2f5e3a' if i % 2 else '#3a6e45'
    body += f'<path fill="{c}" d="M48 {f(y-4)}C{f(48-w*.6)} {f(y)} {f(48-w)} {f(y+4)} {f(48-w)} {f(y+6)}C{f(48-w*.4)} {f(y+5)} {f(48+w*.4)} {f(y+5)} {f(48+w)} {f(y+6)}C{f(48+w)} {f(y+4)} {f(48+w*.6)} {f(y)} 48 {f(y-4)}Z"/>'
body += '<g transform="translate(70 76)"><circle r="7" fill="#8a7050"/><path fill="none" stroke="#5e4a30" stroke-width="1.1" d="M-6 -2h12M-6 2h12M0 -7v14"/></g>'
sym('cypress', body)

g = grad('ingredient-nutmeg-seed', [('0', '#b07a4a'), ('.5', '#7e4f2a'), ('1', '#4f2e16')], cx='35%', cy='30%', r='75%')
body = shadow(48, 86, 32)
body += '<ellipse cx="34" cy="58" rx="18" ry="15" fill="url(#ingredient-nutmeg-seed)"/>'
body += '<path fill="none" stroke="#4a2a14" stroke-opacity=".6" stroke-width="1.1" stroke-linecap="round" d="M20 54c6-4 12 2 18-2s10 2 12 0M22 62c6 2 12-2 18 2s8 0 10-2"/>'
body += '<ellipse cx="66" cy="54" rx="17" ry="14" fill="url(#ingredient-nutmeg-seed)"/><ellipse cx="66" cy="54" rx="14" ry="11" fill="#e6c9a0"/>'
body += '<path fill="none" stroke="#9a6a3a" stroke-width="1.2" stroke-linecap="round" d="M56 50c4 2 8-2 12 1s6-1 8 2M57 57c4-2 7 2 11 0s6 1 8-1M60 63c3 1 6-1 9 0"/>'
body += '<path fill="#d9472a" d="M28 46c-4-6 0-12 6-14-2 4 0 8 2 10-3 0-6 2-8 4Z"/>'
sym('nutmeg', body, g)

# ── Third pass (2026-11-05, after the iPhone review): textured, volumetric ──
# Overrides earlier drawings of the same id. Rendered to WebP, so filters
# (wood grain, suede nap, crystal shading) are baked in and Safari-proof.

def wood_grain(id_, freq='0.012 0.42', dark='#6b3f1c', op='.55', seed=4):
    return (f'<filter id="{id_}" x="0" y="0" width="100%" height="100%">'
            f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="3" seed="{seed}" result="n"/>'
            f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.35" result="a"/>'
            f'<feFlood flood-color="{dark}" flood-opacity="{op}"/><feComposite in2="a" operator="in" result="lines"/>'
            f'<feComposite in="lines" in2="SourceAlpha" operator="in" result="clip"/>'
            f'<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="clip"/></feMerge></filter>')

def nap(id_, freq='1.6', dark='#3a2414', light='#d9b08a', op='.35', seed=9):
    return (f'<filter id="{id_}" x="0" y="0" width="100%" height="100%">'
            f'<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="2" seed="{seed}" result="n"/>'
            f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 2.4 -1" result="d"/>'
            f'<feFlood flood-color="{dark}" flood-opacity="{op}"/><feComposite in2="d" operator="in" result="dk"/>'
            f'<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.4" result="l"/>'
            f'<feFlood flood-color="{light}" flood-opacity="{op}"/><feComposite in2="l" operator="in" result="lt"/>'
            f'<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="dk"/><feMergeNode in="lt"/></feMerge>'
            f'<feComposite in2="SourceAlpha" operator="in"/></filter>')

# ── Pineapple: whole fruit with scaled rind and crown, plus a fibrous wedge ──
g = grad('ingredient-pineapple-scale', [('0', '#ffd65e'), ('.6', '#e9a52a'), ('1', '#b8701a')], cx='45%', cy='40%', r='65%')
g += grad('ingredient-pineapple-leaf', [('0', '#a9d36a'), ('.5', '#5e9a3a'), ('1', '#2f6a2a')], kind='linear', x1='0', y1='0', x2='1', y2='0')
g += grad('ingredient-pineapple-flesh', [('0', '#fff3a6'), ('.5', '#ffdc52'), ('1', '#f1b923')], kind='linear', x1='0', y1='0', x2='1', y2='1')
g += '<clipPath id="ingredient-pineapple-body"><ellipse cx="54" cy="60" rx="21" ry="25"/></clipPath>'
body = shadow(54, 87, 26)
for a, l in [(-118, 24), (-104, 30), (-90, 34), (-76, 30), (-62, 24), (-130, 18), (-50, 18), (-96, 22), (-84, 22)]:
    body += (f'<path transform="translate(54 37) rotate({a})" fill="url(#ingredient-pineapple-leaf)" '
             f'd="M0 -3.4C{f(l*.35)} -4 {f(l*.75)} -2.4 {l} 0C{f(l*.75)} 1.6 {f(l*.35)} 3.4 0 3.4Z"/>')
body += '<ellipse cx="54" cy="60" rx="21" ry="25" fill="#b8701a"/><g clip-path="url(#ingredient-pineapple-body)">'
for r_ in range(-1, 9):
    for c_ in range(-1, 7):
        cx = 33 + c_ * 7.6 + (3.8 if r_ % 2 else 0); cy = 36 + r_ * 6.6
        body += (f'<path fill="url(#ingredient-pineapple-scale)" stroke="#8a5414" stroke-width=".5" d="M{f(cx)} {f(cy-4.2)}L{f(cx+3.9)} {f(cy)}L{f(cx)} {f(cy+4.2)}L{f(cx-3.9)} {f(cy)}Z"/>'
                 f'<path fill="#6b4512" d="M{f(cx-.8)} {f(cy-1.6)}l.8-1.6.8 1.6Z"/>')
body += '<ellipse cx="46" cy="52" rx="6" ry="13" fill="#fff6c8" fill-opacity=".22"/></g>'
sym('pineapple', body, g)

# ── Sea salt: a mound of irregular crystals ──────────────────────────────
random.seed(11)
g = grad('ingredient-salt-face', [('0', '#ffffff'), ('.6', '#eef2f4'), ('1', '#c4ced5')], kind='linear', x1='0', y1='0', x2='1', y2='1')
body = shadow(48, 84, 36, 4)
crystals = []
for _ in range(170):
    x = random.uniform(12, 84)
    peak = 40 + ((x - 48) / 36) ** 2 * 40
    y = random.uniform(peak, 82)
    crystals.append((y, x, random.uniform(2.6, 5.4), random.uniform(0, 360)))
for y, x, r, a in sorted(crystals):
    pts = []
    for k in range(5):
        ang = math.radians(a + k * 72 + random.uniform(-14, 14))
        rr = r * random.uniform(.7, 1.1)
        pts.append(f'{f(x + rr*math.cos(ang))} {f(y + rr*.85*math.sin(ang))}')
    shade = random.choice(['#ffffff', '#f3f6f8', '#e6ebef', '#d7dee3'])
    body += f'<path fill="url(#ingredient-salt-face)" stroke="#aeb9c1" stroke-width=".35" d="M{"L".join(pts)}Z"/>'
    body += f'<path fill="{shade}" fill-opacity=".55" d="M{pts[0]}L{pts[1]}L{f(x)} {f(y)}Z"/>'
    if random.random() < .35:
        body += f'<circle cx="{f(x - r*.3)}" cy="{f(y - r*.3)}" r=".7" fill="#fff"/>'
sym('salt', body, g)

# ── Sandalwood: a small pile of natural wood sticks with grain ───────────
g = wood_grain('ingredient-sandal-grain', dark='#7a4a22', op='.5')
g += grad('ingredient-sandal-top', [('0', '#f2cf9e'), ('.5', '#ddae74'), ('1', '#c58f55')], kind='linear', x1='0', y1='0', x2='0', y2='1')
body = shadow(48, 84, 38, 4)
def stick(cx, cy, length, thick, ang):
    hl, ht = length / 2, thick / 2
    top = f'M{f(-hl)} {f(-ht)}H{f(hl)}V{f(ht*.3)}H{f(-hl)}Z'
    side = f'M{f(-hl)} {f(ht*.3)}H{f(hl)}V{f(ht)}H{f(-hl)}Z'
    s_ = f'<g transform="translate({f(cx)} {f(cy)}) rotate({f(ang)})">'
    s_ += f'<g filter="url(#ingredient-sandal-grain)"><path fill="url(#ingredient-sandal-top)" d="{top}"/><path fill="#b47a44" d="{side}"/></g>'
    s_ += f'<path fill="#c98e54" d="M{f(hl)} {f(-ht)}l2.4 1.6V{f(ht+1.2)}L{f(hl)} {f(ht)}Z"/>'
    s_ += f'<path fill="none" stroke="#9c6534" stroke-width=".6" d="M{f(hl+.6)} {f(-ht*.4)}c.8 .8 .8 2.4 0 3.2"/>'
    s_ += f'<path fill="none" stroke="#fbe5c2" stroke-opacity=".7" stroke-width=".8" stroke-linecap="round" d="M{f(-hl+2)} {f(-ht+1)}H{f(hl-3)}"/></g>'
    return s_
for cx, cy, l, t, a in [(46, 54, 58, 10, -24), (50, 63, 60, 10.5, 18), (40, 70, 56, 10, -8), (58, 50, 46, 9, 32), (52, 74, 50, 9.5, -30), (32, 58, 40, 9, 40)]:
    body += stick(cx, cy, l, t, a)
sym('sandalwood', body, g)

# ── Suede (ante): a swatch lying flat, nap texture, thickness and one corner turned up ──
g = nap('ingredient-suede-nap', freq='1.5', dark='#3b2414', light='#ecd0ab', op='.34', seed=12)
g += grad('ingredient-suede-top', [('0', '#c99a6c'), ('.55', '#a8784e'), ('1', '#7f5333')], kind='linear', x1='0', y1='0', x2='1', y2='1')
g += grad('ingredient-suede-under', [('0', '#ead0ae'), ('1', '#c9a27a')], kind='linear', x1='1', y1='0', x2='0', y2='1')
g += '<filter id="ingredient-suede-soft"><feGaussianBlur stdDeviation="1.3"/></filter>'
cloth = 'M16 40C34 36 52 33 72 33C78 44 83 55 86 66C62 72 38 76 10 76C12 64 14 52 16 40Z'
body = shadow(48, 84, 38, 4)
body += f'<path transform="translate(0 4)" fill="#55341f" d="{cloth}"/>'
body += f'<g filter="url(#ingredient-suede-nap)"><path fill="url(#ingredient-suede-top)" d="{cloth}"/></g>'
body += '<g filter="url(#ingredient-suede-soft)" fill="none" stroke-linecap="round">'
body += '<path stroke="#4a2c17" stroke-opacity=".45" stroke-width="2.6" d="M22 60C36 54 52 52 66 54M28 70C42 66 58 64 74 62"/>'
body += '<path stroke="#f0d6b2" stroke-opacity=".55" stroke-width="2.2" d="M20 50C34 46 48 44 60 44M26 64C38 60 52 59 64 60"/></g>'
body += '<path fill="#3b2414" fill-opacity=".28" d="M58 34C66 40 74 48 80 56C76 52 66 46 58 34Z"/>'
body += '<g filter="url(#ingredient-suede-nap)"><path fill="url(#ingredient-suede-under)" d="M58 33.6C63 33.2 68 33 72 33C76 40 79 47 81 53C74 49 66 43 58 33.6Z"/></g>'
body += '<path fill="none" stroke="#8a5a36" stroke-width="1" stroke-linecap="round" d="M58 33.6C66 43 74 49 81 53"/>'
sym('leather', body, g)

# ── Bamboo (bambú) ───────────────────────────────────────────────────────
g = grad('ingredient-bamboo-culm', [('0', '#5e8f2e'), ('.35', '#a8cf62'), ('.6', '#86b447'), ('1', '#3f6b22')], kind='linear', x1='0', y1='0', x2='1', y2='0')
body = shadow(48, 88, 26)
for x, top, w in [(38, 14, 11), (56, 24, 10)]:
    body += f'<rect x="{x - w/2}" y="{top}" width="{w}" height="{88 - top}" rx="2" fill="url(#ingredient-bamboo-culm)"/>'
    for y in range(top + 16, 86, 18):
        body += f'<rect x="{f(x - w/2 - .6)}" y="{y}" width="{f(w + 1.2)}" height="2.4" rx="1.2" fill="#4c7a28"/><rect x="{f(x - w/2)}" y="{y + 2.4}" width="{w}" height="1" fill="#cfe59a" fill-opacity=".7"/>'
body += leaf(44, 34, 30, -20, width=5, fill='#4f8a35', vein='#a6d07a') + leaf(42, 44, 26, -150, width=4.5, fill='#5e9a3e', vein='#a6d07a')
body += leaf(61, 40, 26, -35, width=4.5, fill='#3f7a2e', vein='#9cc970') + leaf(61, 52, 22, 20, width=4, fill='#5e9a3e', vein='#a6d07a')
sym('bamboo', body, g)

# ── Moss (musgo): a dense textured clump on a stone ──
g = nap('ingredient-moss-nap', freq='2.2', dark='#1f3d14', light='#b9dc7a', op='.5', seed=21)
g += grad('ingredient-moss-clump', [('0', '#8fbf4f'), ('.55', '#5a8f2e'), ('1', '#35601c')], cx='40%', cy='30%', r='80%')
g += grad('ingredient-moss-stone', [('0', '#c9c4ba'), ('1', '#8a857c')], kind='linear', x1='0', y1='0', x2='0', y2='1')
body = shadow(48, 86, 38, 4)
body += '<path fill="url(#ingredient-moss-stone)" d="M10 80c0-10 10-16 22-17 14-1 28 0 40 2 10 2 16 8 16 15 0 4-4 6-10 6H18c-5 0-8-2-8-6Z"/>'
body += '<g filter="url(#ingredient-moss-nap)"><path fill="url(#ingredient-moss-clump)" d="M14 70c0-12 8-22 18-24 4-8 14-12 22-8 8-4 18 0 22 8 8 4 12 12 10 22-2 6-8 8-14 8H26c-8 0-12-2-12-6Z"/></g>'
for x, h in [(30, 12), (38, 16), (47, 14), (55, 18), (63, 12), (70, 10)]:
    body += f'<path fill="none" stroke="#9c7a3a" stroke-width=".9" stroke-linecap="round" d="M{x} {50 - (x % 7)}v-{h}"/><ellipse cx="{x}" cy="{50 - (x % 7) - h}" rx="1.2" ry="2" fill="#a8682a"/>'
sym('moss', body, g)

# ── White lily (azucena) ─────────────────────────────────────────────────
g = grad('ingredient-lily-tepal', [('0', '#ffffff'), ('.7', '#f6f3e8'), ('1', '#d9dcc0')], kind='linear', x1='0', y1='0', x2='0', y2='1')
body = '<path fill="none" stroke="#4f7a3a" stroke-width="2.4" stroke-linecap="round" d="M50 90C50 74 48 62 46 52"/>'
body += leaf(49, 80, 24, -150, width=4, fill='#4b7a3a', vein=None) + leaf(50, 72, 24, -25, width=4, fill='#558a42', vein=None)
for a in (-150, -90, -30):
    body += f'<path transform="translate(46 50) rotate({a})" fill="#ebe9d8" d="M0 0C6 -9 22 -10 34 -4C28 2 14 6 0 0Z"/>'
for a in (-120, -60, 180, 0):
    body += f'<path transform="translate(46 50) rotate({a})" fill="url(#ingredient-lily-tepal)" stroke="#d3d4bd" stroke-width=".6" d="M0 0C6 -10 24 -12 38 -3C30 4 14 8 0 0Z"/>'
    body += f'<path transform="translate(46 50) rotate({a})" fill="none" stroke="#c9d6a0" stroke-width=".8" d="M4 -1C14 -3 24 -4 34 -3"/>'
body += '<circle cx="46" cy="50" r="5" fill="#cfdc8a" fill-opacity=".8"/>'
for a in (-130, -95, -60, -25, 10):
    x, y = 46 + 16 * math.cos(math.radians(a)), 50 + 16 * math.sin(math.radians(a))
    body += f'<path fill="none" stroke="#9fae5c" stroke-width=".9" d="M46 50L{f(x)} {f(y)}"/><ellipse cx="{f(x)}" cy="{f(y)}" rx="2.2" ry="1.2" transform="rotate({a} {f(x)} {f(y)})" fill="#d9822b"/>'
sym('lily', body, g)

# ── Lily of the valley (muguete): white bells hanging from an arched stem ──
g = grad('ingredient-muguet-leaf', [('0', '#8cc463'), ('.5', '#4f8f3a'), ('1', '#2f6a2a')], kind='linear', x1='0', y1='0', x2='1', y2='0')
g += grad('ingredient-muguet-bell', [('0', '#ffffff'), ('.6', '#f3f3e6'), ('1', '#c9cfb6')], cx='40%', cy='30%', r='80%')
body = shadow(48, 88, 28)
body += '<path fill="url(#ingredient-muguet-leaf)" d="M22 88C12 68 14 44 26 26c6 20 6 42-4 62Z"/>'
body += '<path fill="url(#ingredient-muguet-leaf)" d="M76 88c10-16 12-36 4-54-8 16-10 36-4 54Z"/>'
body += '<path fill="none" stroke="#5e7a3a" stroke-width="2" stroke-linecap="round" d="M44 88C42 60 48 30 72 18"/>'
for t in [.32, .44, .56, .68, .8, .9]:
    x = 44 + (72 - 44) * t ** 1.6 - 2 * (1 - t); y = 88 - (88 - 18) * t
    r = 6.2 - t * 2
    body += f'<path fill="none" stroke="#6b8a45" stroke-width="1" d="M{f(x)} {f(y)}q-1 3 -1 {f(r)}"/>'
    bx, by = x - 1, y + r + 2
    body += (f'<path fill="url(#ingredient-muguet-bell)" stroke="#a7af95" stroke-width=".6" '
             f'd="M{f(bx-r)} {f(by+r*.9)}C{f(bx-r)} {f(by-r*.5)} {f(bx-r*.5)} {f(by-r)} {f(bx)} {f(by-r)}S{f(bx+r)} {f(by-r*.5)} {f(bx+r)} {f(by+r*.9)}'
             f'c-.8 .9-1.6 .2-2.2 .9-.8-.7-1.6-.2-2.4.1-.8-.3-1.6-.8-2.4-.1-.6-.7-1.4 0-2.2-.9Z"/>')
sym('lily_of_the_valley', body, g)

# ── Neutral note: an essence drop (only when no ingredient is drawable) ──
g = grad('ingredient-neutral-drop', [('0', '#fbf3e2'), ('.55', '#e8d2a8'), ('1', '#b98f55')], cx='38%', cy='40%', r='75%')
body = shadow(48, 84, 18, 3)
body += '<path fill="url(#ingredient-neutral-drop)" d="M48 16C40 32 28 44 28 60a20 20 0 0 0 40 0c0-16-12-28-20-44Z"/>'
body += '<path fill="#fff" fill-opacity=".75" d="M38 52c-2 6-2 12 2 16-6-2-8-10-2-16Z"/>'
body += '<ellipse cx="54" cy="68" rx="6" ry="3" fill="#a57a40" fill-opacity=".25"/>'
sym('neutral', body, g)
