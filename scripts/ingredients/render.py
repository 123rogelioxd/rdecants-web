# Render the ingredient drawings to transparent WebP files, locally and offline.
#
#   python scripts/ingredients/render.py              # every drawing
#   python scripts/ingredients/render.py pineapple    # only these ids
#
# Needs Python 3 with Pillow and Microsoft Edge (or Chrome: set BROWSER=path).
# Output: assets/img/ingredients/<id>.webp (192 px) and a review sheet in
# scripts/ingredients/.work/review.png. No network, no paid service.
import contextlib, io, math, os, re, subprocess, sys, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
WEB = HERE.parent.parent
BROWSER = os.environ.get('BROWSER', r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
CELL, OUT_PX = 240, 192
ONLY = set(sys.argv[1:])

ns = {'__name__': 'drawings'}
with contextlib.redirect_stderr(io.StringIO()):
    exec(compile((HERE / 'drawings.py').read_text(encoding='utf-8'), 'drawings.py', 'exec'), ns)
art = {}
for s in ns['OUT']:
    m = re.match(r'\s*<symbol id="ingredient-([^"]+)" viewBox="0 0 96 96">(.*)</symbol>', s, re.S)
    art[m.group(1)] = m.group(2)
for m in re.finditer(r'<symbol id="ingredient-([^"]+)" viewBox="0 0 96 96">(.*?)</symbol>',
                     (HERE / 'donna-approved.svg').read_text(encoding='utf-8'), re.S):
    art[m.group(1)] = m.group(2)
ids = sorted(i for i in art if not ONLY or i in ONLY)

# Shared finish: a soft contact shadow ("volume") and a faint grain ("texture").
shared = '''<svg width="0" height="0" style="position:absolute"><defs>
<filter id="vol" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="1.4"/><feOffset dy="1.6"/>
<feComponentTransfer><feFuncA type="linear" slope=".28"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="tex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3" result="n"/>
<feColorMatrix in="n" type="matrix" values=".33 .33 .33 0 0  .33 .33 .33 0 0  .33 .33 .33 0 0  0 0 0 0 .22" result="g"/><feComposite in="g" in2="SourceAlpha" operator="in" result="gi"/>
<feBlend in="SourceGraphic" in2="gi" mode="soft-light" result="b"/><feComposite in="b" in2="SourceAlpha" operator="in"/></filter>
</defs></svg>'''
cols = 8
rows = math.ceil(len(ids) / cols)
cells = ''.join(
    f'<div style="width:{CELL}px;height:{CELL}px"><svg xmlns="http://www.w3.org/2000/svg" width="{CELL}" height="{CELL}" viewBox="0 0 96 96" '
    f'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'
    f'<g filter="url(#vol)"><g filter="url(#tex)">{art[i]}</g></g></svg></div>' for i in ids)
work = HERE / '.work'
work.mkdir(exist_ok=True)
page, png = work / 'all.html', work / 'all.png'
page.write_text(f'<!doctype html><html><body style="margin:0;background:transparent">{shared}'
                f'<div style="display:grid;grid-template-columns:repeat({cols},{CELL}px)">{cells}</div></body></html>', encoding='utf-8')
png.unlink(missing_ok=True)
subprocess.run([BROWSER, '--headless=new', '--disable-gpu', '--no-first-run', f'--user-data-dir={work / "profile"}', '--hide-scrollbars',
                '--default-background-color=00000000', f'--window-size={cols * CELL},{rows * CELL}', '--force-device-scale-factor=1',
                f'--screenshot={png}', page.as_uri()], check=True, capture_output=True, timeout=120)
for _ in range(60):
    if png.exists() and png.stat().st_size:
        break
    time.sleep(.5)
time.sleep(.5)

sheet = Image.open(png).convert('RGBA')
out = WEB / 'assets/img/ingredients'
out.mkdir(parents=True, exist_ok=True)
review = Image.new('RGB', (cols * 120, rows * 138), '#F0EBE0')
draw = ImageDraw.Draw(review)
try:
    font = ImageFont.truetype('segoeui.ttf', 13)
except OSError:
    font = ImageFont.load_default()
total = 0
for k, i in enumerate(ids):
    x, y = (k % cols) * CELL, (k // cols) * CELL
    tile = sheet.crop((x, y, x + CELL, y + CELL)).resize((OUT_PX, OUT_PX), Image.LANCZOS)
    target = out / f'{i}.webp'
    tile.save(target, 'WEBP', quality=86, method=6, alpha_quality=90)
    total += target.stat().st_size
    small = tile.resize((104, 104), Image.LANCZOS)
    rx, ry = (k % cols) * 120 + 8, (k // cols) * 138 + 4
    review.paste(small, (rx, ry), small)
    draw.text((rx + 52, ry + 116), i, fill='#2b2925', font=font, anchor='mm')
review.save(work / 'review.png')
print(f'{len(ids)} drawings, {round(total / 1024)} KB, review: {work / "review.png"}')
