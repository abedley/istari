#!/usr/bin/env python3
"""
Cuts the title screen's picture (tools/title/source.jpg, a painting of the Shire) into depth layers for its
parallax zoom, as app/title/layer-N.webp (0 farthest). Dev-only; needs Pillow and numpy.

    python3 tools/title/make-layers.py

The picture is scaled to WIDTH pixels wide. Each layer is a hand-drawn region (REGIONS, in pixels of
the picture at REF wide).
Where a nearer layer covers a farther one, the farther one is filled in a little way under the nearer
layer's edge (by diffusing the colors around it), so the gap a camera move opens shows scenery rather
than a hole.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'tools/title/source.jpg'
OUT = ROOT / 'app/title'

WIDTH = 900    # the layers' width in pixels (sharp on a phone at 2x, and not too heavy)
REF = 600      # the width REGIONS are drawn at (the picture is 600 x 1075 there)
UNDER = 22     # px a layer is filled in under the edge of the layers in front of it, at REF

# Far to near, after the sky (layer 0, the whole picture). Polygons are (x, y) at REF.
REGIONS = {
    # The mountains at the head of the valley, and everything below them. Haze: a soft edge.
    'mountains': dict(feather=5, polys=[
        [(0, 468), (50, 462), (100, 468), (150, 484), (200, 478), (250, 466), (300, 453), (350, 454), (400, 470),
         (430, 478), (470, 458), (500, 444), (550, 432), (600, 425), (600, 1075), (0, 1075)],
    ]),
    # The green valley: its hills, the far smials, the great tree, the river and its bridge.
    'valley': dict(feather=3, polys=[
        [(0, 522), (40, 516), (70, 510), (95, 506), (120, 518), (160, 520), (200, 530), (260, 522), (300, 526),
         (345, 522), (362, 514), (388, 511), (412, 520), (430, 540), (470, 546), (520, 548), (560, 540), (600, 545),
         (600, 1075), (0, 1075)],
    ]),
    # The hillside with the blue-door smial, the fences and the winding path.
    'hillside': dict(feather=4, polys=[
        [(0, 742), (150, 735), (250, 725), (330, 705), (380, 682), (440, 665), (500, 650), (560, 638), (600, 630),
         (600, 1075), (0, 1075)],
    ]),
    # The meadow in front: long grass, bushes and flowers.
    'meadow': dict(feather=5, polys=[
        [(0, 852), (100, 860), (200, 885), (300, 895), (370, 880), (400, 862), (450, 855), (520, 862), (560, 880),
         (600, 880), (600, 1075), (0, 1075)],
    ]),
}
ORDER = ['sky', *REGIONS]


def polygon_mask(size, polys, k):
    img = Image.new('L', size, 0)
    draw = ImageDraw.Draw(img)
    for poly in polys:
        draw.polygon([(x * k, y * k) for x, y in poly], fill=255)
    return np.asarray(img) > 0


def grow(mask, r):
    """The mask grown by about r pixels."""
    if r < 1:
        return mask
    blurred = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(r)))
    return blurred > 0


def soften(mask, r):
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)))


def box(a, r):
    """A box blur of radius r along both axes of a float array (edges clamped)."""
    for axis in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[axis] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad, mode='edge'), axis=axis)
        n = a.shape[axis]
        a = (np.take(c, range(2 * r + 1, 2 * r + 1 + n), axis=axis) - np.take(c, range(n), axis=axis)) / (2 * r + 1)
    return a


def smooth(a, r):
    """About a Gaussian blur of radius r: three box blurs."""
    r = max(1, round(r / 1.7))
    for _ in range(3):
        a = box(a, r)
    return a


def fill_in(img, hole):
    """The picture with the hole painted from the colors around it, coarse to fine (normalized blur)."""
    known = (~hole).astype(np.float32)
    out = img.astype(np.float32) * known[..., None]
    result = out.copy()
    filled = known > 0
    for r in (2, 4, 8, 16, 32, 64, 128):
        num = smooth(out, r)
        den = smooth(known, r)
        ok = (den > 0.02) & ~filled
        result[ok] = num[ok] / den[ok][:, None]
        filled |= ok
    result[~filled] = out[known > 0].mean(axis=0)
    return np.clip(result, 0, 255).astype(np.uint8)


def main():
    src = Image.open(SRC).convert('RGB')
    src = src.resize((WIDTH, round(src.height * WIDTH / src.width)), Image.LANCZOS)
    img = np.asarray(src)
    h, w = img.shape[:2]
    k = w / REF
    masks = {}
    for name, spec in REGIONS.items():
        mask = polygon_mask((w, h), spec['polys'], k)
        if 'trees' in spec:
            # Above this line, only the dark trees, not the bright mist between them.
            value = img.max(axis=2)
            above = np.arange(h)[:, None] < spec['trees'] * k
            dark = soften(value < 150, 1.2) > 128
            mask &= ~above | dark
        masks[name] = mask
    # A nearer layer wins where regions overlap.
    for i, name in enumerate(ORDER[1:], 1):
        for nearer in ORDER[i + 1:]:
            masks[name] &= ~masks[nearer]
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('layer-*.webp'):
        old.unlink()
    under = round(UNDER * k)
    for i, name in enumerate(ORDER):
        in_front = np.zeros((h, w), bool)
        for nearer in ORDER[i + 1:]:
            in_front |= masks[nearer]
        # This layer's picture, with what's in front of it painted in.
        content = fill_in(img, grow(in_front, round(2 * k))) if in_front.any() else img
        if name == 'sky':
            alpha = np.full((h, w), 255, np.uint8)
        else:
            # Its own region, plus a margin carried on under the layers in front.
            region = masks[name] | (grow(masks[name], under) & in_front)
            alpha = soften(region, REGIONS[name]['feather'] * k / 2)
        rgba = np.dstack([content, alpha])
        Image.fromarray(rgba, 'RGBA').save(OUT / f'layer-{i}.webp', quality=82, method=6)
        print(f'layer-{i}.webp ({name})')


if __name__ == '__main__':
    main()
