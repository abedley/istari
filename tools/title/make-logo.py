"""
Cuts the title logo (tools/title/logo-source.jpg, gold letters on black) into
app/title/logo.webp: cropped to the letters and their glow, with the black made
transparent (alpha from brightness, colour un-premultiplied), so the glow sits
on the valley rather than on a black box.

    python3 tools/title/make-logo.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
src = np.asarray(Image.open(ROOT / 'tools/title/logo-source.jpg').convert('RGB')).astype(np.float32) / 255

# Alpha from brightness: the near-black of the backdrop (jpeg noise) goes, the glow fades out, and
# the letters, even their dark stone, are solid. The colour is divided by alpha, so the logo over
# black looks as it did.
level = src.max(axis=2)
t = np.clip((level - 0.04) / 0.26, 0, 1)
alpha = t * t * (3 - 2 * t)
rgb = np.clip(src / np.maximum(alpha, 1e-4)[..., None], 0, 1) * (alpha[..., None] > 0)

ys, xs = np.nonzero(alpha > 0.06)
pad = 24
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, src.shape[0])
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, src.shape[1])

rgba = np.dstack([rgb, alpha])[y0:y1, x0:x1]
out = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')
# It shows at most ~360px wide: enough for a 2.5x screen.
out = out.resize((900, round(900 * out.height / out.width)), Image.LANCZOS)
out.save(ROOT / 'app/title/logo.webp', quality=82, alpha_quality=80, method=6)
print(out.size)
