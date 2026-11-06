# Cut the 32 ingredient images Roger supplied (4 sheets, 4 x 2 cells with a label)
# into transparent 384 px WebP files. Local, offline (Pillow + OpenCV GrabCut).
#   python cutout.py <images-dir> <out-dir> <review.png>
import sys
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# Two modes:
#   python cutout.py <dir-with-4.webp..7.webp> <out-dir> <review.png>              (first four sheets)
#   python cutout.py --plan sheets.json --sheet NN <sheet-image> <out-dir> <review.png>  (plan sheets)
PLAN_SHEET = None
if sys.argv[1] == '--plan':
    import json
    plan = json.load(open(sys.argv[2], encoding='utf-8'))
    number = int(sys.argv[4])
    PLAN_SHEET = next(s for s in plan['sheets'] + [plan['optionalAccordSheet']] if s['sheet'] == number)
    sheet_image, out, review_path = sys.argv[5], sys.argv[6], sys.argv[7]
else:
    src, out, review_path = sys.argv[1], sys.argv[2], sys.argv[3]
SHEETS = {
    4: ['pineapple', 'salt', 'sandalwood', 'leather', 'vanilla', 'rum', 'bergamot', 'jasmine'],
    5: ['rose', 'lily', 'lily_of_the_valley', 'peony', 'orange_blossom', 'geranium', 'bamboo', 'violet'],
    6: ['apple', 'plum', 'mandarin', 'lime', 'blackcurrant', 'mango', 'passion_fruit', 'apricot'],
    7: ['cedar', 'oud', 'cardamom', 'ginger', 'cocoa', 'cinnamon', 'incense', 'moss'],
}
SIZE = 384

def label_top(cell):
    """Top of the dark serif label at the bottom of the cell."""
    lum = cell.mean(axis=2)
    h, w = lum.shape
    dark_rows = [(lum[y, int(w * .12):int(w * .88)] < 110).sum() for y in range(h)]
    y = h - 6
    while y > h * .55 and dark_rows[y] < 2:
        y -= 1
    while y > h * .55 and dark_rows[y] >= 2:   # inside the text
        y -= 1
    return y

def cut(cell):
    h, w, _ = cell.shape
    bg = np.median(np.concatenate([cell[:6].reshape(-1, 3), cell[:, :6].reshape(-1, 3), cell[:, -6:].reshape(-1, 3)]), axis=0)
    dist = np.sqrt(((cell.astype(float) - bg) ** 2).sum(axis=2))
    # background connected to the border and very close to the cream colour
    near = (dist < 9).astype(np.uint8)
    flood = np.zeros((h + 2, w + 2), np.uint8)
    conn = near.copy()
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if near[seed[1], seed[0]]:
            cv2.floodFill(conn, flood, seed, 2)
    mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    mask[dist < 16] = cv2.GC_PR_BGD
    mask[conn == 2] = cv2.GC_BGD
    mask[:3], mask[-3:], mask[:, :3], mask[:, -3:] = cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(cv2.cvtColor(cell, cv2.COLOR_RGB2BGR), mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = np.isin(mask, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8)
    # keep the main object(s): drop tiny specks
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    keep = np.zeros_like(fg)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > 60:
            keep[lab == i] = 1
    alpha = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 0.9)
    alpha = np.clip(alpha * 1.15, 0, 1)
    # Near the outline, colour close to the cream backdrop (leftover shadow, glass)
    # becomes proportionally transparent; deep inside the object stays opaque.
    depth = cv2.distanceTransform(keep, cv2.DIST_L2, 5)
    c2a = np.clip((dist - 5) / 22, 0, 1)
    protect = np.clip((depth - 6) / 10, 0, 1)
    alpha = alpha * np.maximum(c2a, protect)
    # Unmix the backdrop from semi-transparent pixels so no cream fringe remains.
    a = np.maximum(alpha, 1e-3)[..., None]
    rgb = (cell.astype(np.float32) - (1 - a) * bg) / a
    rgb = np.where(alpha[..., None] > 0.02, np.clip(rgb, 0, 255), cell)
    return np.dstack([rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)])

def square(rgba):
    a = rgba[:, :, 3]
    ys, xs = np.where(a > 8)
    crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape[:2]
    side = int(max(h, w) * 1.08)
    canvas = np.zeros((side, side, 4), np.uint8)
    y0, x0 = (side - h) // 2, (side - w) // 2
    canvas[y0:y0 + h, x0:x0 + w] = crop
    return Image.fromarray(canvas, 'RGBA').resize((SIZE, SIZE), Image.LANCZOS)

tiles = []
jobs = [(sheet_image, [i['id'] for i in PLAN_SHEET['items']])] if PLAN_SHEET else [(f'{src}/{n}.webp', ids) for n, ids in SHEETS.items()]
for path, ids in jobs:
    sheet = np.asarray(Image.open(path).convert('RGB'))
    H, W, _ = sheet.shape
    cw, ch = W / 4, H / 2
    for k, ident in enumerate(ids):
        c, r = k % 4, k // 4
        x0, y0 = int(round(c * cw)) + 4, int(round(r * ch)) + 4
        x1, y1 = int(round((c + 1) * cw)) - 4, int(round((r + 1) * ch)) - 4
        cell = sheet[y0:y1, x0:x1]
        cell = cell[:label_top(cell) - 3]
        img = square(cut(cell))
        img.save(f'{out}/{ident}.webp', 'WEBP', quality=86, method=6, alpha_quality=92)
        tiles.append((ident, img))

# review: every cut-out on the scent block colour and on a dark ground (halo check)
cols, cell = 8, 150
rows = (len(tiles) + cols - 1) // cols
rev = Image.new('RGB', (cols * cell, rows * (cell * 2 + 18)), '#ffffff')
d = ImageDraw.Draw(rev)
try:
    font = ImageFont.truetype('segoeui.ttf', 12)
except OSError:
    font = ImageFont.load_default()
for i, (ident, img) in enumerate(tiles):
    x, y = (i % cols) * cell, (i // cols) * (cell * 2 + 18)
    small = img.resize((cell - 10, cell - 10), Image.LANCZOS)
    rev.paste(Image.new('RGB', (cell, cell), '#F0EBE0'), (x, y))
    rev.paste(small, (x + 5, y + 5), small)
    rev.paste(Image.new('RGB', (cell, cell), '#2b2925'), (x, y + cell))
    rev.paste(small, (x + 5, y + cell + 5), small)
    d.text((x + cell / 2, y + cell * 2 + 9), ident, fill='#222', font=font, anchor='mm')
rev.save(review_path)
print(len(tiles), 'cut-outs')
