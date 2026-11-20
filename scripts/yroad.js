// Yatri "Y road" mark, after the reference: a flat-topped double band for the left arm,
// a road in perspective (narrow far end at the top right, wide near end at the bottom left),
// an orange map pin over the far end, and a small rider on the road.
const ORANGE = '#E8590C';
const BRIGHT = '#FF7A2E';
const DEEP = '#B93D05';
const ASPHALT = '#1A1B1E';

// Road centreline, far end first: two cubic Béziers.
const SEGMENTS = [
  [[934, 318], [770, 326], [606, 410], [544, 572]],
  [[544, 572], [504, 676], [470, 786], [440, 900]],
];
const BOTTOM = 872; // the near end is cut flat here
const W_FAR = 64;
const W_NEAR = 236;

const bez = ([a, b, c, d], t) => {
  const u = 1 - t;
  const p = (i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
  const q = (i) => 3 * (u * u * (b[i] - a[i]) + 2 * u * t * (c[i] - b[i]) + t * t * (d[i] - c[i]));
  return { x: p(0), y: p(1), dx: q(0), dy: q(1) };
};

// Sample the centreline evenly by arc length; s runs 0 (far) .. 1 (near).
const samples = (() => {
  const raw = [];
  SEGMENTS.forEach((seg, k) => {
    for (let i = k ? 1 : 0; i <= 200; i++) raw.push(bez(seg, i / 200));
  });
  let len = 0;
  raw.forEach((p, i) => {
    if (i) len += Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y);
    p.len = len;
  });
  return raw.map((p) => {
    const m = Math.hypot(p.dx, p.dy);
    // Normal pointing to the road's upper/right side.
    return { x: p.x, y: p.y, nx: p.dy / m, ny: -p.dx / m, tx: p.dx / m, ty: p.dy / m, s: p.len / len };
  });
})();

const width = (s) => W_FAR + (W_NEAR - W_FAR) * s ** 1.15;
const f = (n) => n.toFixed(1);

/** Closed outline of the road at `k` times its width. */
function band(k) {
  const left = samples.map((p) => `${f(p.x - (p.nx * width(p.s) * k) / 2)} ${f(p.y - (p.ny * width(p.s) * k) / 2)}`);
  const right = samples.map((p) => `${f(p.x + (p.nx * width(p.s) * k) / 2)} ${f(p.y + (p.ny * width(p.s) * k) / 2)}`);
  return `M${right.join(' L')} L${left.reverse().join(' L')} Z`;
}

/** Lane dashes that lengthen and widen toward the viewer. */
function dashes() {
  const out = [];
  let s = 0.04;
  while (s < 1) {
    const len = 0.02 + 0.05 * s;
    const a = samples.find((p) => p.s >= s);
    const b = samples.find((p) => p.s >= Math.min(s + len, 1));
    if (!a || !b) break;
    const wa = width(a.s) * 0.05;
    const wb = width(b.s) * 0.05;
    out.push(
      `M${f(a.x + a.nx * wa)} ${f(a.y + a.ny * wa)} L${f(b.x + b.nx * wb)} ${f(b.y + b.ny * wb)} L${f(b.x - b.nx * wb)} ${f(b.y - b.ny * wb)} L${f(a.x - a.nx * wa)} ${f(a.y - a.ny * wa)} Z`,
    );
    s += len * 1.9;
  }
  return out.join(' ');
}

const ROAD = { outer: band(1), edge: band(0.86), asphalt: band(0.72), lane: dashes() };

/** Side-view motorbike with rider, facing right, wheels on y=0, about 220 long. */
const bike = (c) => `
  <g fill="none" stroke="${c}" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="-72" cy="-34" r="32" stroke-width="15"/>
    <circle cx="76" cy="-34" r="32" stroke-width="15"/>
    <path d="M-72 -34 L-14 -44" stroke-width="14"/>
    <path d="M54 -88 L76 -34" stroke-width="14"/>
    <path d="M52 -90 L46 -114 L68 -120" stroke-width="12"/>
    <path d="M-22 -84 L8 -136 L46 -114" stroke-width="22"/>
    <path d="M-20 -80 L14 -70 L6 -40" stroke-width="18"/>
  </g>
  <path d="M-66 -70 L-12 -76 Q22 -106 58 -84 L48 -60 L-8 -52 L-30 -60 Z" fill="${c}" stroke="${c}" stroke-width="8" stroke-linejoin="round"/>
  <path d="M-22 -58 L26 -56 L18 -34 L-16 -36 Z" fill="${c}"/>
  <circle cx="16" cy="-162" r="24" fill="${c}"/>`;

/** The rider sits on the road's upper edge at `s`, scaled to the road's width there. */
/** A point on the road's upper edge at `s`, with the direction pointing up the road. */
function upperEdge(s) {
  const p = samples.find((q) => q.s >= s);
  // The stored normal points to the road's lower side.
  const off = width(p.s) / 2;
  return { x: p.x - p.nx * off, y: p.y - p.ny * off, angle: (Math.atan2(-p.ty, -p.tx) * 180) / Math.PI };
}

/** Rider near the far end, heading into the distance; smaller there, as the road is. */
function rider(color, s = 0.1) {
  const e = upperEdge(s);
  return `<g transform="translate(${f(e.x)} ${f(e.y)}) rotate(${f(e.angle)}) scale(0.5)">${bike(color)}</g>`;
}

/** Map pin standing on the road's upper edge at `s`, as in the reference. */
function pin(fill, hole, s = 0.34) {
  const { x, y } = upperEdge(s);
  return `<g transform="translate(${f(x)} ${f(y - 6)})">
    <path d="M0 0 C-30 -42 -76 -80 -76 -134 A76 76 0 1 1 76 -134 C76 -80 30 -42 0 0 Z" fill="${fill}"/>
    <circle cx="0" cy="-134" r="30" fill="${hole}"/></g>`;
}

/**
 * The mark on a 1024 canvas.
 * fg: Y bands and road edges · edge: inner road line · asphalt: road surface ·
 * pinColor / pinHole: the map pin · bikeColor: the rider.
 */
function mark({
  fg = '#FFFFFF',
  edge = ORANGE,
  asphalt = ASPHALT,
  pinColor = ORANGE,
  pinHole = ASPHALT,
  bikeColor = BRIGHT,
  clipId = 'roadcut',
} = {}) {
  return `
  <defs><clipPath id="${clipId}"><rect x="-200" y="-200" width="1424" height="${BOTTOM + 200}"/></clipPath></defs>
  <path d="M176 248 L346 248 L604 612 L440 690 Z" fill="${fg}"/>
  <path d="M376 248 L452 248 L618 486 L566 528 Z" fill="${fg}" opacity="0.72"/>
  <g clip-path="url(#${clipId})">
    <path d="${ROAD.outer}" fill="${fg}"/>
    <path d="${ROAD.edge}" fill="${edge}"/>
    <path d="${ROAD.asphalt}" fill="${asphalt}"/>
    <path d="${ROAD.lane}" fill="${fg}"/>
  </g>
  ${rider(bikeColor)}
  ${pin(pinColor, pinHole)}`;
}

const gradient = (id, from, to) => `
  <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#${id})"/>`;

const variants = {
  dark: { tile: (id) => gradient(id, '#26282F', '#0B0B0D'), mark: () => mark() },
  orange: {
    tile: (id) => gradient(id, '#F26A1B', DEEP),
    mark: () => mark({ edge: '#FFFFFF', pinColor: '#FFFFFF', pinHole: DEEP, bikeColor: '#FFFFFF' }),
  },
};

const icon = (variant, id = `t-${variant}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${variants[variant].tile(id)}${variants[variant].mark()}</svg>`;

/** The Y alone (arms + road), for the in-app wordmark. */
const ARMS = { main: 'M176 248 L346 248 L604 612 L440 690 Z', inner: 'M376 248 L452 248 L618 486 L566 528 Z' };

module.exports = { icon, mark, variants, gradient, bike, ROAD, ARMS, BOTTOM, ORANGE, BRIGHT, DEEP, ASPHALT };
