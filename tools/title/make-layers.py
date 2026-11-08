#!/usr/bin/env python3
"""
Cuts the title screen's picture (tools/title/source.jpg) into depth layers for its parallax zoom,
as app/title/layer-N.webp (0 farthest). Dev-only; needs Pillow, numpy and opencv-python-headless.

The picture is scaled to WIDTH pixels wide. Each layer is a hand-drawn region (REGIONS, in pixels of the
picture at 474 wide, scaled to fit), refined in places by
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
        [(0, 0), (474, 0), (474, 112), (446, 116), (420, 124), (380, 134), (345, 140), (322, 150), (302, 176), (278, 186), (246, 170), (222, 146), (200, 140), (150, 150), (100, 156), (50, 162), (20, 180), (0, 200)],
    ],
}
ORDER = ['back', 'cliffs', 'valley', 'near', 'canopy']
WIDTH = 900    # the layers' width in pixels (sharp on a phone at 2x, and not too heavy)
REF = 474      # the width REGIONS are drawn at
FEATHER = 5    # px of soft edge, at REF
UNDER = 24     # px a layer is filled in under the edge of the layers in front of it, at REF


def polygon_mask(shape, polys, k):
    mask = np.zeros(shape, np.uint8)
    for poly in polys:
        cv2.fillPoly(mask, [np.round(np.array(poly, np.float64) * k).astype(np.int32)], 255)
    return mask


def canopy_matte(img, sky, sky_rows, region, px):
    """
    The branches overhead, cut soft from the sky: each pixel's opacity from how far its color is from
    the sky's just behind it, and the sky's color taken back out of the half-covered edge pixels, so
    no fringe of bright sky comes along with the leaves (it would glow against the darker sky
    behind them). Returns (BGR, alpha, the sky behind as BGR, what isn't sky in its region).
    """
    c = img.astype(np.float32)
    # Open sky for this, more loosely: by the sun it's warmer and less pale than elsewhere.
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    sky = sky | ((hsv[..., 2] > 180) & (hsv[..., 1] < 95))
    # The sky just behind each pixel: an average of the open sky nearby, or the row's sky where there's none.
    weight = cv2.GaussianBlur(sky.astype(np.float32), (0, 0), px(6))
    near = cv2.GaussianBlur(c * sky[..., None], (0, 0), px(6)) / np.maximum(weight, 1e-3)[..., None]
    trust = np.clip(weight * 4, 0, 1)[..., None]
    behind = near * trust + sky_rows.astype(np.float32) * (1 - trust)
    distance = np.linalg.norm(c - behind, axis=2)
    alpha = np.clip((distance - 14) / 46, 0, 1) * (region > 0)
    covered = ((alpha > 0) * 255).astype(np.uint8)
    # Lone specks (a smudge of cloud, a bird) aren't branches.
    count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 0.5).astype(np.uint8))
    small = stats[:, cv2.CC_STAT_AREA] < px(5) ** 2
    small[0] = False
    alpha[small[labels] & (alpha > 0)] = 0
    # Unmix: color = a * leaf + (1 - a) * sky, so leaf = sky + (color - sky) / a.
    leaf = behind + (c - behind) / np.maximum(alpha, 0.08)[..., None]
    rgb = np.clip(leaf, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur((alpha * 255).astype(np.uint8), (0, 0), 0.6)
    return rgb, alpha, np.clip(behind, 0, 255).astype(np.uint8), covered


def main():
    img = cv2.imread(str(SRC))
    img = cv2.resize(img, (WIDTH, round(img.shape[0] * WIDTH / img.shape[1])), interpolation=cv2.INTER_AREA)
    h, w = img.shape[:2]
    k = w / REF
    px = lambda n: max(1, round(n * k))
    masks = {name: polygon_mask((h, w), polys, k) for name, polys in REGIONS.items()}
    # The canopy is only its leaves and branches: inside its region, what isn't bright, pale sky.
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    sky = (hsv[..., 2] > 200) & (hsv[..., 1] < 60)
    leaves = np.where(sky, 0, 255).astype(np.uint8)
    leaves = cv2.morphologyEx(leaves, cv2.MORPH_OPEN, np.ones((px(2), px(2)), np.uint8))
    leaves = cv2.dilate(leaves, np.ones((px(3), px(3)), np.uint8))
    masks['canopy'] = cv2.bitwise_and(masks['canopy'], leaves)
    # The cliffs' sky edge works the same way: their region minus the bright haze above them.
    haze = (hsv[..., 2] > 215) & (hsv[..., 1] < 70)
    masks['cliffs'][haze & (np.arange(h)[:, None] < 300 * k)] = 0
    # The sky's color in each row (from its open patches), for what the canopy hides.
    rows = np.zeros((h, 3), np.float64)
    known = np.zeros(h, bool)
    for y in range(h):
        if sky[y].sum() > px(6):
            rows[y] = img[y][sky[y]].mean(axis=0)
            known[y] = True
    ys = np.arange(h)
    for c in range(3):
        rows[:, c] = np.interp(ys, ys[known], rows[known, c])
    rows = cv2.GaussianBlur(rows.reshape(h, 1, 3).astype(np.float32), (1, 0), sigmaX=1, sigmaY=12 * k).reshape(h, 3)
    sky_rows = np.repeat(rows[:, None, :], w, axis=1).astype(np.uint8)
    canopy_rgb, canopy_alpha, canopy_sky, canopy_covered = canopy_matte(img, sky, sky_rows, polygon_mask((h, w), REGIONS['canopy'], k), px)
    masks['canopy'] = np.where(canopy_alpha > 128, 255, 0).astype(np.uint8)
    # A nearer layer wins where regions overlap.
    for i, name in enumerate(ORDER[1:], 1):
        for nearer in ORDER[i + 1:]:
            masks[name] = cv2.bitwise_and(masks[name], cv2.bitwise_not(masks[nearer]))
    OUT.mkdir(parents=True, exist_ok=True)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * px(UNDER) + 1, 2 * px(UNDER) + 1))
    for i, name in enumerate(ORDER):
        in_front = np.zeros((h, w), np.uint8)
        for nearer in ORDER[i + 1:]:
            in_front |= masks[nearer]
        # This layer's picture, with what's in front of it filled in.
        fill = cv2.dilate(in_front, np.ones((px(5), px(5)), np.uint8))
        base = img
        if name == 'back':
            # Behind the canopy is sky: paint it with the sky's own colors, row by row, before inpainting the rest.
            under = cv2.dilate(masks['canopy'] | canopy_covered, np.ones((px(5), px(5)), np.uint8)) > 0
            base = img.copy()
            base[under] = canopy_sky[under]
            fill[under] = 0
        content = cv2.inpaint(base, fill, px(9), cv2.INPAINT_TELEA) if fill.any() else base
        if name == 'back':
            alpha = np.full((h, w), 255, np.uint8)
        elif name == 'canopy':
            content, alpha = canopy_rgb, canopy_alpha
        else:
            # Its own region, plus a margin carried on under the layers in front.
            alpha = masks[name] | (cv2.dilate(masks[name], kernel) & in_front)
            alpha = cv2.GaussianBlur(alpha, (0, 0), FEATHER * k / 2)
        rgba = cv2.cvtColor(content, cv2.COLOR_BGR2RGBA)
        rgba[..., 3] = alpha
        Image.fromarray(rgba).save(OUT / f'layer-{i}.webp', quality=84, method=6)
        print(f'layer-{i}.webp ({name})')


if __name__ == '__main__':
    main()
