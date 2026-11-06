# Cut ingredient sheets (4 x 2 labelled cells on an ivory backdrop) into
# transparent 384 px WebP files. Local and offline (Pillow + OpenCV GrabCut).
#
#   python cutout.py --batch batch.json <review.png>
#       batch.json: [{"image": "...", "ids": [8 ids, row by row], "mode": "photo" | "accord",
#                     "solid": [white subjects], "only": [ids to (re)make]}]
#       photo  → assets/img/ingredients/photo/<id>.webp   (object cut out, soft shadow kept)
#       accord → assets/img/ingredients/accord/<id>.webp  (round medallion: accords are not materials)
#   python cutout.py --plan sheets.json --sheet NN <sheet-image> <review.png>
#       same, ids taken from the plan sheet NN (check the labels first: map by label, not order)
#
# Never overwrites an existing file unless --force is given.
import json, sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WEB = Path(__file__).resolve().parent.parent.parent
OUT = {'photo': WEB / 'assets/img/ingredients/photo', 'accord': WEB / 'assets/img/ingredients/accord'}
SIZE = 384


def label_top(cell):
    """Top of the dark serif label at the bottom of the cell."""
    lum = cell.mean(axis=2)
    h, w = lum.shape
    dark_rows = [(lum[y, int(w * .12):int(w * .88)] < 110).sum() for y in range(h)]
    y = h - 6
    while y > h * .55 and dark_rows[y] < 2:
        y -= 1
    while y > h * .55 and dark_rows[y] >= 2:
        y -= 1
    return y


def backdrop(cell):
    return np.median(np.concatenate([cell[:6].reshape(-1, 3), cell[:, :6].reshape(-1, 3), cell[:, -6:].reshape(-1, 3)]), axis=0)


def cut(cell, solid=False):
    h, w, _ = cell.shape
    bg = backdrop(cell)
    dist = np.sqrt(((cell.astype(float) - bg) ** 2).sum(axis=2))
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
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    keep = np.zeros_like(fg)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > 60:
            keep[lab == i] = 1
    alpha = np.clip(cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 0.9) * 1.15, 0, 1)
    # near the outline, colour close to the ivory backdrop (old shadow, glass) turns
    # proportionally transparent; deep inside the object stays opaque
    depth = cv2.distanceTransform(keep, cv2.DIST_L2, 5)
    if not solid:  # solid: white subjects (sugar, rice) keep their body opaque
        alpha = alpha * np.maximum(np.clip((dist - 5) / 22, 0, 1), np.clip((depth - 6) / 10, 0, 1))
    a = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.where(alpha[..., None] > 0.02, np.clip((cell.astype(np.float32) - (1 - a) * bg) / a, 0, 255), cell)
    return np.dstack([rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)])


def square(rgba):
    ys, xs = np.where(rgba[:, :, 3] > 8)
    crop = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape[:2]
    side = int(max(h, w) * 1.08)
    canvas = np.zeros((side, side, 4), np.uint8)
    canvas[(side - h) // 2:(side - h) // 2 + h, (side - w) // 2:(side - w) // 2 + w] = crop
    return Image.fromarray(canvas, 'RGBA').resize((SIZE, SIZE), Image.LANCZOS)


def medallion(cell):
    """Accords: the drop and its context in a soft-edged circle (never a cut-out material)."""
    h, w, _ = cell.shape
    side = min(h, w)
    y0, x0 = (h - side) // 2, (w - side) // 2
    sq = cell[y0:y0 + side, x0:x0 + side]
    yy, xx = np.mgrid[:side, :side]
    r = np.sqrt((yy - side / 2) ** 2 + (xx - side / 2) ** 2) / (side / 2)
    alpha = np.clip((0.96 - r) / 0.08, 0, 1)
    return Image.fromarray(np.dstack([sq, (alpha * 255).astype(np.uint8)]), 'RGBA').resize((SIZE, SIZE), Image.LANCZOS)


def process(image, ids, mode, force=False, solid=(), only=None):
    sheet = np.asarray(Image.open(image).convert('RGB'))
    H, W, _ = sheet.shape
    cw, ch = W / 4, H / 2
    made = []
    for k, ident in enumerate(ids):
        if only and ident not in only:
            continue
        c, r = k % 4, k // 4
        cell = sheet[int(round(r * ch)) + 4:int(round((r + 1) * ch)) - 4, int(round(c * cw)) + 4:int(round((c + 1) * cw)) - 4]
        cell = cell[:label_top(cell) - 3]
        img = medallion(cell) if mode == 'accord' else square(cut(cell, solid=ident in solid))
        target = OUT[mode] / f'{ident}.webp'
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and not force:
            print(f'skip (exists): {target.name}')
        else:
            img.save(target, 'WEBP', quality=84, method=6, alpha_quality=90)
        made.append((ident, img))
    return made


def review(tiles, path):
    """Each image at the real modal size (64 px) and at 150 px, on the scent-block cream."""
    cols, cell = 8, 170
    rows = (len(tiles) + cols - 1) // cols
    rev = Image.new('RGB', (cols * cell, rows * (cell + 30)), '#F0EBE0')
    d = ImageDraw.Draw(rev)
    try:
        font = ImageFont.truetype('segoeui.ttf', 12)
    except OSError:
        font = ImageFont.load_default()
    for i, (ident, img) in enumerate(tiles):
        x, y = (i % cols) * cell, (i // cols) * (cell + 30)
        big = img.resize((126, 126), Image.LANCZOS)
        small = img.resize((64, 64), Image.LANCZOS)
        rev.paste(big, (x + 4, y + 4), big)
        rev.paste(small, (x + 104, y + 100), small)
        d.text((x + cell / 2, y + cell + 12), ident, fill='#222', font=font, anchor='mm')
    rev.save(path)


if __name__ == '__main__':
    args = sys.argv[1:]
    force = '--force' in args
    args = [a for a in args if a != '--force']
    if args[0] == '--batch':
        jobs = json.loads(Path(args[1]).read_text(encoding='utf-8'))
        review_path = args[2]
    else:
        plan = json.loads(Path(args[1]).read_text(encoding='utf-8'))
        sheet = next(s for s in plan['sheets'] + [plan['optionalAccordSheet']] if s['sheet'] == int(args[3]))
        jobs = [{'image': args[4], 'ids': [i['id'] for i in sheet['items']], 'mode': 'accord' if sheet['family'] == 'acorde' else 'photo'}]
        review_path = args[5]
    tiles = []
    for job in jobs:
        tiles += process(job['image'], job['ids'], job.get('mode', 'photo'), force, job.get('solid', ()), job.get('only'))
    review(tiles, review_path)
    print(len(tiles), 'images')
