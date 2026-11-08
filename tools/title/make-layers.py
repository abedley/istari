#!/usr/bin/env python3
"""
Cuts the title screen's picture (tools/title/source.jpg) into depth layers for its parallax zoom,
as app/title/layer-N.webp (0 farthest). Dev-only; needs Pillow, numpy and opencv-python-headless.

Each layer is a hand-drawn region (REGIONS, in the source's 474×1024 pixels), refined in places by
brightness (the canopy against the bright sky). Where a nearer layer covers a farther one, the
farther one is filled in (inpainted) a little way under the nearer layer's edge, so the gap a
camera move opens shows scenery rather than a hole.
"""
from pathlib import Path
import numpy as np
import cv2
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'tools/title/source.jpg'
OUT = ROOT / 'app/title'

# Far to near. Polygons are (x, y) in source pixels.
REGIONS = {
    # The cliffs on either side, and the dark wooded slopes below them.
    'cliffs': [
        [(0, 185), (30, 200), (62, 212), (100, 222), (128, 245), (142, 290), (150, 330), (168, 345), (200, 380), (215, 430), (228, 480), (230, 560), (0, 560)],
        [(306, 200), (318, 165), (340, 150), (380, 140), (420, 120), (474, 95), (474, 600), (300, 600), (282, 520), (276, 460), (284, 400), (292, 330), (300, 260)],
    ],
    # The valley: the elves' houses, the big tree, the bridges and the river.
    'valley': [
        [(18, 372), (60, 368), (100, 362), (150, 366), (190, 378), (206, 400), (214, 440), (226, 478), (246, 505), (262, 520), (282, 500), (296, 455), (306, 428), (330, 418), (352, 432), (376, 428), (400, 440), (474, 450), (474, 1024), (0, 1024), (0, 400)],
    ],
    # The near balcony on the right, and the rock, path and trees at the bottom left.
    'near': [
        [(474, 245), (452, 278), (430, 308), (414, 330), (411, 412), (378, 428), (372, 470), (388, 498), (388, 560), (398, 600), (402, 660), (396, 760), (382, 830), (384, 1024), (474, 1024)],
        [(0, 330), (22, 352), (40, 410), (46, 470), (44, 530), (56, 590), (84, 640), (96, 700), (108, 730), (140, 728), (170, 722), (205, 748), (238, 770), (240, 830), (228, 880), (232, 900), (262, 890), (300, 884), (340, 892), (372, 880), (384, 1024), (0, 1024)],
    ],
    # The tree overhead.
    'canopy': [
        [(0, 0), (474, 0), (474, 240), (452, 236), (436, 200), (420, 166), (380, 152), (342, 150), (300, 136), (250, 132), (200, 138), (150, 150), (100, 156), (50, 162), (20, 180), (0, 200)],
    ],
}
ORDER = ['back', 'cliffs', 'valley', 'near', 'canopy']
FEATHER = 5   # px of soft edge
UNDER = 24    # px a layer is filled in under the edge of the layers in front of it


def polygon_mask(shape, polys):
    mask = np.zeros(shape, np.uint8)
    for poly in polys:
        cv2.fillPoly(mask, [np.array(poly, np.int32)], 255)
    return mask


def main():
    img = cv2.imread(str(SRC))
    h, w = img.shape[:2]
    masks = {name: polygon_mask((h, w), polys) for name, polys in REGIONS.items()}
    # The canopy is only its leaves and branches: inside its region, what isn't bright, pale sky.
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    sky = (hsv[..., 2] > 200) & (hsv[..., 1] < 60)
    leaves = np.where(sky, 0, 255).astype(np.uint8)
    leaves = cv2.morphologyEx(leaves, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    leaves = cv2.dilate(leaves, np.ones((3, 3), np.uint8))
    masks['canopy'] = cv2.bitwise_and(masks['canopy'], leaves)
    # The cliffs' sky edge works the same way: their region minus the bright haze above them.
    haze = (hsv[..., 2] > 215) & (hsv[..., 1] < 70)
    masks['cliffs'][haze & (np.arange(h)[:, None] < 300)] = 0
    # The sky's color in each row (from its open patches), for what the canopy hides.
    rows = np.zeros((h, 3), np.float64)
    known = np.zeros(h, bool)
    for y in range(h):
        if sky[y].sum() > 6:
            rows[y] = img[y][sky[y]].mean(axis=0)
            known[y] = True
    ys = np.arange(h)
    for c in range(3):
        rows[:, c] = np.interp(ys, ys[known], rows[known, c])
    rows = cv2.GaussianBlur(rows.reshape(h, 1, 3).astype(np.float32), (1, 0), sigmaX=1, sigmaY=12).reshape(h, 3)
    sky_rows = np.repeat(rows[:, None, :], w, axis=1).astype(np.uint8)
    # A nearer layer wins where regions overlap.
    for i, name in enumerate(ORDER[1:], 1):
        for nearer in ORDER[i + 1:]:
            masks[name] = cv2.bitwise_and(masks[name], cv2.bitwise_not(masks[nearer]))
    OUT.mkdir(parents=True, exist_ok=True)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * UNDER + 1, 2 * UNDER + 1))
    for i, name in enumerate(ORDER):
        in_front = np.zeros((h, w), np.uint8)
        for nearer in ORDER[i + 1:]:
            in_front |= masks[nearer]
        # This layer's picture, with what's in front of it filled in.
        fill = cv2.dilate(in_front, np.ones((5, 5), np.uint8))
        base = img
        if name == 'back':
            # Behind the canopy is sky: paint it with the sky's own colors, row by row, before inpainting the rest.
            under = cv2.dilate(masks['canopy'], np.ones((9, 9), np.uint8)) > 0
            base = img.copy()
            base[under] = sky_rows[under]
            fill[under] = 0
        content = cv2.inpaint(base, fill, 9, cv2.INPAINT_TELEA) if fill.any() else base
        if name == 'back':
            alpha = np.full((h, w), 255, np.uint8)
        else:
            # Its own region, plus a margin carried on under the layers in front.
            alpha = masks[name] | (cv2.dilate(masks[name], kernel) & in_front)
            alpha = cv2.GaussianBlur(alpha, (0, 0), FEATHER / 2)
        rgba = cv2.cvtColor(content, cv2.COLOR_BGR2RGBA)
        rgba[..., 3] = alpha
        Image.fromarray(rgba).save(OUT / f'layer-{i}.webp', quality=88, method=6)
        print(f'layer-{i}.webp ({name})')


if __name__ == '__main__':
    main()
