/**
 * The title screen's backdrop: from a wooded overlook, down into a hidden elven valley at golden
 * hour. Snowy peaks far off, sheer cliffs on both sides with waterfalls pouring down them, the house
 * of the elves built out on a spur at the valley's head, and a river winding toward us through
 * autumn woods.
 *
 * Each layer is its own SVG, drawn once from fixed seeds (so the scene never changes), and a slow
 * camera move shifts and zooms each by its depth (`--d`, 0 far to 1 near), so near layers move more
 * than far ones: parallax. The motion is all transform and opacity (app.css, "title").
 */
const W = 400;
const H = 800;

/** A small seeded random, so the scene is the same every time. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const f1 = (n) => n.toFixed(1);
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

/** A rough line through `points`, by midpoint displacement: `rough` scales how far midpoints move. */
function jag(points, rand, { rough = 0.18, depth = 4, sideways = 0.4 } = {}) {
  let line = points;
  for (let d = 0; d < depth; d += 1) {
    const next = [line[0]];
    for (let i = 1; i < line.length; i += 1) {
      const [x0, y0] = line[i - 1];
      const [x1, y1] = line[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      next.push([(x0 + x1) / 2 + (rand() - 0.5) * len * rough * sideways, (y0 + y1) / 2 + (rand() - 0.5) * len * rough], [x1, y1]);
    }
    line = next;
  }
  return line;
}

const path = (points, close = true) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('') + (close ? 'Z' : '');
const svg = (body, defs = '') => `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

/** Where the sun sits, low behind the peaks at the valley's head. */
const SUN = [232, 300];

// ------------------------------------------------------------------ the valley's shape
/** The inner edges of the gorge's walls, top to bottom: x at height y. */
const LEFT_EDGE = [[-30, 120], [30, 138], [70, 176], [100, 226], [122, 286], [140, 350], [152, 410], [150, 470], [134, 560], [104, 660], [70, 820]];
const RIGHT_EDGE = [[430, 132], [372, 150], [334, 196], [306, 254], [286, 318], [270, 384], [262, 440], [270, 520], [296, 620], [330, 720], [352, 820]];
const edgeAt = (edge, y) => {
  if (y <= edge[0][1]) return edge[0][0];
  for (let i = 1; i < edge.length; i += 1) {
    const [xa, ya] = edge[i - 1];
    const [xb, yb] = edge[i];
    if (y <= yb) return xa + ((y - ya) / (yb - ya)) * (xb - xa);
  }
  return edge[edge.length - 1][0];
};

/** The river: its middle and half-width at height y, from the haven's foot (y 452) to us. */
const riverAt = (y) => {
  const t = Math.max(0, (y - 452) / 370);
  return { x: 206 + Math.sin(t * 5.4 + 0.3) * (6 + t * 46) - t * 8, half: 2 + t * t * 30 + t * 6 };
};

// ------------------------------------------------------------------ trees
/** A fir: stacked tiers, lit on the sun's side. */
function fir(x, y, size, dark, light) {
  const w = size * 0.42;
  let s = `<path d="M${f1(x - 0.6)} ${f1(y)}h1.2v${f1(size * 0.18)}h-1.2z" fill="#20160c"/>`;
  for (let t = 0; t < 3; t += 1) {
    const top = y - size + t * size * 0.26;
    const bottom = y - size * 0.28 + t * size * 0.24;
    const half = w * (0.55 + t * 0.25);
    s += `<path d="M${f1(x)} ${f1(top)}L${f1(x + half)} ${f1(bottom)}L${f1(x - half)} ${f1(bottom)}Z" fill="${dark}"/>`
      + `<path d="M${f1(x)} ${f1(top)}L${f1(x + half)} ${f1(bottom)}L${f1(x + half * 0.15)} ${f1(bottom)}Z" fill="${light}" opacity=".55"/>`;
  }
  return s;
}

/** A broadleaf crown: a few overlapping puffs, a lit side and a shadowed underside. */
function crown(x, y, size, rand, color, light) {
  const r = size * 0.32;
  let s = `<circle cx="${f1(x)}" cy="${f1(y - r * 0.6)}" r="${f1(r * 1.15)}" fill="#1c1a0c" opacity=".55"/>`;
  for (let i = 0; i < 4; i += 1) {
    s += `<circle cx="${f1(x + (rand() - 0.5) * r * 1.6)}" cy="${f1(y - r - rand() * r * 0.9)}" r="${f1(r * (0.7 + rand() * 0.4))}" fill="${color}"/>`;
  }
  s += `<circle cx="${f1(x + r * 0.35)}" cy="${f1(y - r * 1.55)}" r="${f1(r * 0.55)}" fill="${light}" opacity=".45"/>`;
  return s;
}

const AUTUMN = [
  ['#8a5a1c', '#e8b456'], ['#a8701e', '#f2c461'], ['#b8862a', '#f7d47a'], ['#9a4a1a', '#e88a44'],
  ['#6e3a16', '#c8743a'], ['#5c6224', '#b8b45a'], ['#7a6a22', '#d8c060'],
];
const FIRS = [['#1d2e1c', '#4f6a3a'], ['#243522', '#5e7444'], ['#2c3a24', '#6a7a46']];

/** Trees over a region, back to front, bigger as they come nearer (lower). */
function forest(rand, { count, y0, y1, s0, s1, inside, firShare = 0.35, bias = 1 }) {
  const spots = [];
  for (let tries = 0; tries < count * 4 && spots.length < count; tries += 1) {
    const y = y0 + (y1 - y0) * rand() ** bias;
    const x = -10 + rand() * (W + 20);
    if (inside(x, y)) spots.push([x, y]);
  }
  spots.sort((a, b) => a[1] - b[1]);
  return spots.map(([x, y]) => {
    const size = (s0 + ((y - y0) / (y1 - y0)) * (s1 - s0)) * (0.75 + rand() * 0.5);
    if (rand() < firShare) {
      const [dark, light] = pick(rand, FIRS);
      return fir(x, y, size * 1.5, dark, light);
    }
    const [color, light] = pick(rand, AUTUMN);
    return crown(x, y, size, rand, color, light);
  }).join('');
}

// ------------------------------------------------------------------ layers, far to near
function sky() {
  const defs = `
    <linearGradient id="rv-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d3142"/><stop offset=".14" stop-color="#3e5058"/>
      <stop offset=".26" stop-color="#a08360"/><stop offset=".38" stop-color="#e2bd7c"/>
      <stop offset=".46" stop-color="#f7dea6"/><stop offset="1" stop-color="#d6a868"/>
    </linearGradient>
    <radialGradient id="rv-sun" gradientUnits="userSpaceOnUse" cx="${SUN[0]}" cy="${SUN[1]}" r="230">
      <stop offset="0" stop-color="#fffbe8"/><stop offset=".08" stop-color="#fff0c0" stop-opacity=".9"/>
      <stop offset=".35" stop-color="#ffd890" stop-opacity=".35"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/>
    </radialGradient>`;
  // Long, thin clouds, lit from below near the sun.
  const rand = seeded(11);
  let clouds = '';
  for (let i = 0; i < 12; i += 1) {
    const y = 40 + rand() * 230;
    const near = y > 170;
    clouds += `<ellipse cx="${f1(rand() * W)}" cy="${f1(y)}" rx="${f1(40 + rand() * 90)}" ry="${f1(2 + rand() * 4)}" fill="${near ? '#ffd998' : '#c9a27a'}" opacity="${f1(near ? 0.35 : 0.14)}"/>`;
  }
  return svg(`<rect width="${W}" height="${H}" fill="url(#rv-sky)"/>${clouds}<rect width="${W}" height="${H}" fill="url(#rv-sun)"/>`, defs);
}

function peaks() {
  const rand = seeded(23);
  const far = jag([[-30, 300], [20, 262], [52, 206], [70, 236], [96, 248], [128, 188], [150, 226], [176, 244], [200, 230], [216, 270], [244, 254], [270, 222], [290, 228], [322, 170], [344, 214], [366, 232], [396, 200], [430, 250]], rand, { rough: 0.22, depth: 3, sideways: 0.05 });
  const mid = jag([[-30, 350], [40, 316], [96, 334], [150, 298], [196, 330], [240, 318], [300, 300], [356, 328], [430, 306]], rand, { rough: 0.25, depth: 3, sideways: 0.05 });
  const defs = `
    <linearGradient id="rv-snow" gradientUnits="userSpaceOnUse" x1="0" y1="180" x2="0" y2="360">
      <stop offset="0" stop-color="#fffaf0"/><stop offset=".2" stop-color="#f2e2c2"/>
      <stop offset=".42" stop-color="#9c9ca4"/><stop offset=".75" stop-color="#8e8a86"/><stop offset="1" stop-color="#c7b08a"/>
    </linearGradient>
    <linearGradient id="rv-ridge" gradientUnits="userSpaceOnUse" x1="0" y1="290" x2="0" y2="420">
      <stop offset="0" stop-color="#9c9a8c"/><stop offset=".6" stop-color="#b8a684"/><stop offset="1" stop-color="#e2c590"/>
    </linearGradient>`;
  return svg(`
    <path d="${path([...far, [430, 420], [-30, 420]])}" fill="url(#rv-snow)"/>
    <path d="${path([...mid, [430, 440], [-30, 440]])}" fill="url(#rv-ridge)" opacity=".9"/>
    <rect y="330" width="${W}" height="120" fill="#f7deaa" opacity=".22"/>`, defs);
}

/** Light pouring through the gap in the peaks. */
function rays() {
  const defs = `<linearGradient id="rv-ray" gradientUnits="userSpaceOnUse" x1="0" y1="${SUN[1]}" x2="0" y2="800"><stop offset="0" stop-color="#fff2cc" stop-opacity="0"/><stop offset=".3" stop-color="#fff2cc" stop-opacity=".2"/><stop offset="1" stop-color="#fff2cc" stop-opacity="0"/></linearGradient>`;
  const beams = [[-170, 26], [-80, 34], [10, 20], [100, 38], [190, 24]];
  return svg(beams.map(([dx, w], i) => `<path d="M${SUN[0]} ${SUN[1]}L${SUN[0] + dx - w} 800L${SUN[0] + dx + w} 800Z" fill="url(#rv-ray)" class="rv-ray" style="animation-delay:${f1(i * 1.4)}s"/>`).join(''), defs);
}

/** A waterfall down a cliff face: a pale ribbon, a bright shimmering core, and spray at its foot. */
function fall(x, top, bottom, width, rand) {
  const wob = () => f1((rand() - 0.5) * width * 1.6);
  const d = `M${x} ${top}C${x + +wob()} ${top + (bottom - top) * 0.35} ${x + +wob()} ${top + (bottom - top) * 0.7} ${x} ${bottom}`;
  return `<path d="M${x - width * 0.8} ${top}h${width * 1.6}l${width * 0.7} ${bottom - top}h-${width * 3}Z" fill="#e8efe8" opacity=".14"/>`
    + `<path d="${d}" stroke="#dfe8e4" stroke-width="${width}" fill="none" opacity=".8"/>`
    + `<path d="${d}" stroke="#ffffff" stroke-width="${f1(width * 0.4)}" fill="none" class="rv-shimmer" style="animation-delay:${f1(rand())}s"/>`
    + `<ellipse cx="${x}" cy="${bottom}" rx="${f1(width * 4)}" ry="${f1(width * 1.8)}" fill="#f6f2e6" opacity=".32"/>`;
}

function walls() {
  const rand = seeded(37);
  const left = jag(LEFT_EDGE, rand, { rough: 0.16, depth: 3, sideways: 1 });
  const right = jag(RIGHT_EDGE, rand, { rough: 0.16, depth: 3, sideways: 1 });
  // The left wall's inner face catches the low sun; the right one is in shade.
  const defs = `
    <linearGradient id="rv-wl" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#262b1c"/><stop offset=".55" stop-color="#4e5236"/><stop offset=".85" stop-color="#8d8257"/><stop offset="1" stop-color="#c9ad74"/>
    </linearGradient>
    <linearGradient id="rv-wr" x1="1" y1="0" x2="0" y2="0">
      <stop offset="0" stop-color="#1b2016"/><stop offset=".6" stop-color="#363b2a"/><stop offset="1" stop-color="#6b6446"/>
    </linearGradient>
    <linearGradient id="rv-haze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f2d9a6" stop-opacity=".35"/><stop offset=".5" stop-color="#f2d9a6" stop-opacity="0"/>
    </linearGradient>`;
  // Vertical strata down the faces.
  let strata = '';
  for (let i = 0; i < 46; i += 1) {
    const side = i % 2;
    const y = 160 + rand() * 440;
    const edge = edgeAt(side ? RIGHT_EDGE : LEFT_EDGE, y);
    const x = side ? edge + 3 + rand() * 50 : edge - 3 - rand() * 50;
    strata += `<path d="M${f1(x)} ${f1(y)}l${f1((rand() - 0.5) * 5)} ${f1(14 + rand() * 46)}" stroke="${side ? '#8a8466' : '#e0c890'}" stroke-width="${f1(0.6 + rand() * 0.8)}" opacity="${f1(0.15 + rand() * 0.2)}"/>`;
  }
  // Firs clinging to the walls, and a fringe of them along the tops.
  const clinging = forest(rand, {
    count: 170, y0: 150, y1: 640, s0: 4, s1: 11, firShare: 0.85,
    inside: (x, y) => {
      const l = edgeAt(LEFT_EDGE, y);
      const r = edgeAt(RIGHT_EDGE, y);
      return (x < l - 4 && x > l - 70) || (x > r + 4 && x < r + 70) || x < l - 90 || x > r + 90;
    },
  });
  const rf = seeded(41);
  const falls = fall(96, 238, 420, 3.2, rf) + fall(62, 178, 318, 2.2, rf) + fall(122, 300, 446, 1.6, rf)
    + fall(318, 214, 432, 3.6, rf) + fall(352, 168, 300, 2.4, rf);
  return svg(`
    <path d="${path([[-30, 820], ...left])}" fill="url(#rv-wl)"/>
    <path d="${path([[430, 820], ...right])}" fill="url(#rv-wr)"/>
    ${strata}${falls}${clinging}
    <rect width="${W}" height="${H}" fill="url(#rv-haze)"/>`, defs);
}

/** The house of the elves, out on a spur at the valley's head: pale stone, warm roofs, lit arches. */
function haven() {
  const lit = '#ffd47e';
  const stone = '#ece2c8';
  const shade = '#b4a27e';
  const roof = '#94603a';
  const parts = [];
  // The spur it stands on, and steps of stone below it.
  parts.push(`<path d="M128 452Q160 440 206 444Q250 440 284 450L280 470Q236 462 206 466Q170 462 132 474Z" fill="#9a8a68"/>`
    + `<path d="M128 452Q160 440 206 444Q250 440 284 450" stroke="#f2e4c0" stroke-width="1" fill="none" opacity=".7"/>`
    + `<path d="M150 470L262 466L250 486L166 490Z" fill="#6f6650"/>`);
  const hall = (x, y, w, h, roofKind) => {
    let s = `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="${stone}"/><rect x="${f1(x + w * 0.66)}" y="${y - h}" width="${f1(w * 0.34)}" height="${h}" fill="${shade}"/>`;
    if (roofKind === 'peak') s += `<path d="M${x - 2} ${y - h}L${f1(x + w / 2)} ${f1(y - h - w * 0.36)}L${x + w + 2} ${y - h}Z" fill="${roof}"/><path d="M${f1(x + w / 2)} ${f1(y - h - w * 0.36)}L${x + w + 2} ${y - h}H${f1(x + w / 2)}Z" fill="#6c4226"/>`;
    if (roofKind === 'dome') s += `<path d="M${x - 1} ${y - h}Q${f1(x + w / 2)} ${f1(y - h - w * 0.75)} ${x + w + 1} ${y - h}Z" fill="#a8743e"/><path d="M${f1(x + w / 2)} ${f1(y - h - w * 0.37)}Q${f1(x + w * 0.85)} ${f1(y - h - w * 0.3)} ${x + w + 1} ${y - h}H${f1(x + w / 2)}Z" fill="#7a5028"/>`;
    if (roofKind === 'flat') s += `<rect x="${x - 2}" y="${y - h - 2}" width="${w + 4}" height="2.2" fill="${roof}"/>`;
    // Tall arched windows, warm.
    const n = Math.max(1, Math.floor(w / 6));
    for (let i = 0; i < n; i += 1) {
      const wx = x + (w / n) * (i + 0.5) - 1;
      s += `<path d="M${f1(wx)} ${f1(y - 2)}v${f1(-h * 0.5)}q1 -2 2 0v${f1(h * 0.5)}Z" fill="${lit}"/>`;
    }
    return s;
  };
  const tower = (x, y, h) => `<rect x="${x}" y="${y - h}" width="4.5" height="${h}" fill="${stone}"/><rect x="${x + 3}" y="${y - h}" width="1.5" height="${h}" fill="${shade}"/>`
    + `<path d="M${x - 1} ${y - h}L${x + 2.25} ${y - h - 13}L${x + 5.5} ${y - h}Z" fill="${roof}"/><rect x="${x + 1.3}" y="${y - h + 5}" width="1.8" height="3.5" fill="${lit}"/>`;
  // Buildings stepped up the lit wall on the left, the great hall in the middle, more on the right.
  parts.push(hall(124, 410, 16, 12, 'peak'), hall(136, 430, 20, 14, 'flat'));
  parts.push(hall(146, 452, 24, 18, 'peak'), tower(172, 448, 40));
  parts.push(hall(180, 448, 34, 22, 'dome'), hall(216, 448, 18, 13, 'flat'));
  parts.push(hall(236, 452, 26, 18, 'peak'), tower(264, 450, 30), hall(270, 454, 14, 10, 'peak'));
  // Colonnade along the terrace edge.
  for (let x = 140; x < 280; x += 4) parts.push(`<rect x="${x}" y="452" width="1" height="6" fill="#f4e8c8" opacity=".8"/>`);
  // A bridge over the young river, and lamps on the paths.
  parts.push(`<path d="M196 470Q206 462 216 470" stroke="#efe2c0" stroke-width="1.8" fill="none"/>`);
  const rand = seeded(5);
  for (let i = 0; i < 16; i += 1) parts.push(`<circle cx="${f1(132 + rand() * 148)}" cy="${f1(454 + rand() * 30)}" r=".9" fill="${lit}" class="rv-lamp" style="animation-delay:${f1(rand() * 4)}s"/>`);
  const defs = '<radialGradient id="rv-glow"><stop offset="0" stop-color="#ffdc96" stop-opacity=".5"/><stop offset="1" stop-color="#ffdc96" stop-opacity="0"/></radialGradient>';
  return svg(`<ellipse cx="206" cy="440" rx="120" ry="50" fill="url(#rv-glow)"/>${parts.join('')}`, defs);
}

/** Mist hanging in the valley, drifting on its own. */
function mist() {
  const defs = '<radialGradient id="rv-mist"><stop offset="0" stop-color="#fff2da" stop-opacity=".6"/><stop offset="1" stop-color="#fff2da" stop-opacity="0"/></radialGradient>';
  const bands = [[96, 430, 90, 16], [320, 440, 100, 18], [206, 500, 170, 22], [110, 560, 110, 18], [300, 590, 120, 20]];
  return svg(bands.map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#rv-mist)"/>`).join(''), defs);
}

function valley() {
  const rand = seeded(53);
  const left = [];
  const right = [];
  for (let y = 462; y <= 830; y += 5) {
    const { x, half } = riverAt(y);
    left.push([x - half, y]);
    right.unshift([x + half, y]);
  }
  const defs = `
    <linearGradient id="rv-water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff2d0"/><stop offset=".35" stop-color="#d8d4bc"/><stop offset="1" stop-color="#6a8584"/>
    </linearGradient>
    <linearGradient id="rv-floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3e3a1c"/><stop offset="1" stop-color="#121208"/>
    </linearGradient>`;
  // The valley floor, following the walls' feet, under the woods.
  const feet = [];
  for (let y = 462; y <= 830; y += 20) feet.push([edgeAt(LEFT_EDGE, y) - 34, y]);
  for (let y = 830; y >= 462; y -= 20) feet.push([edgeAt(RIGHT_EDGE, y) + 34, y]);
  const floor = `<path d="${path(feet)}" fill="url(#rv-floor)"/>`;
  let glints = '';
  for (let i = 0; i < 26; i += 1) {
    const y = 470 + rand() * 340;
    const { x, half } = riverAt(y);
    glints += `<path d="M${f1(x - half * 0.6 + rand() * half)} ${f1(y)}h${f1(1.5 + half * 0.5 * rand())}" stroke="#fffaf0" stroke-width=".9" class="rv-glint" style="animation-delay:${f1(rand() * 3)}s"/>`;
  }
  const trees = forest(rand, {
    count: 1100, y0: 466, y1: 840, s0: 4, s1: 30, firShare: 0.3, bias: 1.5,
    inside: (x, y) => {
      const { x: rx, half } = riverAt(y);
      const bank = half + 2 + (y - 460) / 26;
      return Math.abs(x - rx) > bank && x > edgeAt(LEFT_EDGE, y) - 40 && x < edgeAt(RIGHT_EDGE, y) + 40;
    },
  });
  return svg(`${floor}<path d="${path([...left, ...right])}" fill="url(#rv-water)"/>${glints}${trees}`, defs);
}

/** The tall dark firs of the overlook, framing the view, and the rock we stand on. */
function overlook() {
  const rand = seeded(71);
  const tall = (x, base, height, color) => {
    let s = `<path d="M${x - 2.5} ${base}L${x - 1} ${base - height}H${x + 1}L${x + 2.5} ${base}Z" fill="${color}"/>`;
    const tiers = 13;
    for (let i = 0; i < tiers; i += 1) {
      const t = i / tiers;
      const y = base - height * (1 - t * 0.85);
      const half = 6 + t * 46;
      s += `<path d="M${f1(x)} ${f1(y - 14)}L${f1(x + half)} ${f1(y + 18 + rand() * 8)}Q${f1(x)} ${f1(y + 8)} ${f1(x - half)} ${f1(y + 18 + rand() * 8)}Z" fill="${color}"/>`;
    }
    return s;
  };
  const rock = jag([[-30, 772], [60, 758], [140, 768], [220, 760], [300, 770], [370, 756], [430, 764]], rand, { rough: 0.1, depth: 3 });
  let grass = '';
  for (let i = 0; i < 60; i += 1) {
    const x = rand() * W;
    const y = 758 + rand() * 14;
    grass += `<path d="M${f1(x)} ${f1(y + 8)}q${f1((rand() - 0.5) * 6)} -8 ${f1((rand() - 0.5) * 10)} -${f1(8 + rand() * 12)}" stroke="#26301a" stroke-width="1.3" fill="none"/>`;
  }
  return svg(`
    ${tall(30, 800, 600, '#121810')}${tall(64, 800, 360, '#1b2414')}
    ${tall(374, 800, 560, '#121810')}${tall(344, 800, 320, '#1b2414')}
    <path d="${path([...rock, [430, 830], [-30, 830]])}" fill="#0c0f08"/>${grass}`);
}

/** The backdrop: the layers far to near, each with its depth for the camera move. */
export function rivendell(h) {
  const layers = [
    ['sky', 0, sky()], ['peaks', 0.1, peaks()], ['rays', 0.18, rays()], ['walls', 0.36, walls()],
    ['haven', 0.4, haven()], ['mist', 0.46, mist()], ['valley', 0.56, valley()], ['near', 1, overlook()],
  ];
  const el = h('div.rv', { 'aria-hidden': 'true' });
  el.innerHTML = layers.map(([name, depth, art]) => `<div class="rv-layer rv-${name}" style="--d:${depth}">${art}</div>`).join('')
    + '<div class="rv-motes"></div><div class="rv-scrim"></div>';
  return el;
}
