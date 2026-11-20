// Rider avatars for group rides: helmets with paint jobs, and riders on bikes.
// Each avatar is SVG markup on a 100x100 canvas (drawn into a circle by the app).
//   node scripts/avatar-art.js            -> writes src/lib/avatar-art.ts
//   node scripts/avatar-art.js --preview  -> also prints the SVG of a preview sheet to stdout
const fs = require('node:fs');
const path = require('node:path');
const { bike } = require('./yroad');

const DARK = '#1F2328';

// ---------- Helmet (side view, facing right) ----------
const SHELL = 'M13 64 C11 37 31 15 58 15 C81 15 95 32 95 53 L95 67 C95 74 91 78 84 78 L25 80 C17 80 13 74 13 64 Z';
const RIM = 'M14 69 L95 65 L95 67 C95 74 91 78 84 78 L25 80 C18 80 14 76 14 69 Z';
const VISOR = 'M55 39 L92 39 C94.5 39 96 41 96 43.5 L96 57.5 C96 60.5 94 62 91 62 L57 61 C50 61 46 56 46 50 C46 43.5 50 39 55 39 Z';
const SHINE = 'M61 43.5 L86 43.5';
const VENT = 'M64 22 L77 24.5';

const decals = {
  none: () => '',
  stripe: (c) => `<path d="M4 47 C26 25 58 17 104 25 L104 34 C60 26 30 33 4 57 Z" fill="${c}"/>`,
  twin: (c) =>
    `<path d="M4 44 C26 23 58 15 104 22 L104 27 C60 20 30 27 4 50 Z" fill="${c}"/>` +
    `<path d="M4 55 C28 34 60 27 104 33 L104 38 C62 32 32 39 4 61 Z" fill="${c}"/>`,
  flame: (c) =>
    `<path d="M4 76 C14 66 12 56 22 52 C20 60 28 61 31 54 C35 62 42 63 46 57 C45 64 51 69 60 66 C56 72 60 76 68 74 L4 86 Z" fill="${c}"/>`,
  bolt: (c) => `<path d="M32 19 L47 19 L39 37 L51 37 L27 66 L33 45 L22 45 Z" fill="${c}"/>`,
  star: (c) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 5 : 12;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(31 + r * Math.cos(a)).toFixed(1)},${(42 + r * Math.sin(a)).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${c}"/>`;
  },
  checker: (c) => {
    let out = '';
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 2; j++) {
        if ((i + j) % 2) out += `<rect x="${8 + i * 7}" y="${52 + j * 7 - i * 0.9}" width="7" height="7" fill="${c}"/>`;
      }
    }
    return out;
  },
  number: (c) =>
    `<circle cx="32" cy="44" r="13" fill="${c}"/><text x="32" y="50" font-family="Arial" font-weight="900" font-size="17" text-anchor="middle" fill="${DARK}">1</text>`,
  split: (c) => `<path d="M-4 -4 L58 -4 L36 90 L-4 90 Z" fill="${c}"/>`,
};

function helmet({ shell, decal = 'none', decalColor = '#FFFFFF', visor = DARK, iridium, bg }) {
  const visorFill = iridium ? 'url(#irid)' : visor;
  const defs =
    `<clipPath id="shell"><path d="${SHELL}"/></clipPath>` +
    (iridium
      ? `<linearGradient id="irid" x1="0" y1="0" x2="1" y2="1">${iridium
          .map((c, i) => `<stop offset="${i / (iridium.length - 1)}" stop-color="${c}"/>`)
          .join('')}</linearGradient>`
      : '');
  return (
    `<defs>${defs}</defs>` +
    `<rect width="100" height="100" fill="${bg}"/>` +
    // Centred and scaled so the visor and chin stay inside the circle.
    `<g transform="translate(7.5 15) scale(0.78)">` +
    `<path d="${SHELL}" fill="${shell}"/>` +
    `<g clip-path="url(#shell)">${decals[decal](decalColor)}</g>` +
    `<path d="${SHELL}" fill="none" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"/>` +
    `<path d="${RIM}" fill="${DARK}"/>` +
    `<path d="${VISOR}" fill="${visorFill}"/>` +
    `<path d="${SHINE}" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="${VENT}" stroke="${DARK}" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>` +
    `</g>`
  );
}

// ---------- Rider on a bike (the Yatri logo's rider) ----------
function rider({ color, bg, road = 'rgba(0,0,0,0.12)' }) {
  return (
    `<rect width="100" height="100" fill="${bg}"/>` +
    `<rect x="0" y="78" width="100" height="22" fill="${road}"/>` +
    `<g transform="translate(51 79) scale(0.33)">${bike(color)}</g>`
  );
}

const AVATARS = [
  // Helmets
  { id: 'helmet-red', label: 'Red racer', svg: helmet({ shell: '#E11D48', decal: 'stripe', bg: '#FFE4E6' }) },
  { id: 'helmet-blue', label: 'Blue twin stripe', svg: helmet({ shell: '#2563EB', decal: 'twin', bg: '#DBEAFE' }) },
  { id: 'helmet-black', label: 'Matte black', svg: helmet({ shell: '#2A2D33', decal: 'stripe', decalColor: '#E8590C', iridium: ['#38BDF8', '#A855F7', '#F97316'], bg: '#E5E7EB' }) },
  { id: 'helmet-yellow', label: 'Lightning', svg: helmet({ shell: '#FACC15', decal: 'bolt', decalColor: DARK, bg: '#FEF9C3' }) },
  { id: 'helmet-white', label: 'White star', svg: helmet({ shell: '#F8FAFC', decal: 'star', decalColor: '#E11D48', bg: '#E0E7FF' }) },
  { id: 'helmet-flame', label: 'Flames', svg: helmet({ shell: '#EA580C', decal: 'flame', decalColor: '#FDE047', bg: '#FFEDD5' }) },
  { id: 'helmet-checker', label: 'Chequered', svg: helmet({ shell: '#16A34A', decal: 'checker', decalColor: '#FFFFFF', bg: '#DCFCE7' }) },
  { id: 'helmet-iridium', label: 'Iridium', svg: helmet({ shell: '#7C3AED', decal: 'none', iridium: ['#FDE047', '#F97316', '#DB2777'], bg: '#EDE9FE' }) },
  { id: 'helmet-teal', label: 'Teal twin stripe', svg: helmet({ shell: '#0D9488', decal: 'twin', decalColor: '#FDE68A', bg: '#CCFBF1' }) },
  { id: 'helmet-pink', label: 'Pink star', svg: helmet({ shell: '#DB2777', decal: 'star', decalColor: '#FFFFFF', bg: '#FCE7F3' }) },
  { id: 'helmet-carbon', label: 'Carbon', svg: helmet({ shell: '#4B5563', decal: 'stripe', decalColor: '#F97316', bg: '#F3F4F6' }) },
  { id: 'helmet-navy', label: 'Blue flames', svg: helmet({ shell: '#1E3A8A', decal: 'flame', decalColor: '#38BDF8', bg: '#DBEAFE' }) },
  { id: 'helmet-number', label: 'Number one', svg: helmet({ shell: '#DC2626', decal: 'number', decalColor: '#FFFFFF', bg: '#FEE2E2' }) },
  { id: 'helmet-split', label: 'Two-tone', svg: helmet({ shell: '#0EA5E9', decal: 'split', decalColor: '#F8FAFC', bg: '#E0F2FE' }) },
  { id: 'helmet-gold', label: 'Gold', svg: helmet({ shell: '#CA8A04', decal: 'twin', decalColor: DARK, iridium: ['#FDE68A', '#F59E0B'], bg: '#FEF3C7' }) },
  { id: 'helmet-lime', label: 'Lime bolt', svg: helmet({ shell: '#65A30D', decal: 'bolt', decalColor: '#FFFFFF', bg: '#ECFCCB' }) },
  // Riders
  { id: 'rider-orange', label: 'Rider (orange)', svg: rider({ color: '#E8590C', bg: '#FFEDD5' }) },
  { id: 'rider-blue', label: 'Rider (blue)', svg: rider({ color: '#2563EB', bg: '#DBEAFE' }) },
  { id: 'rider-black', label: 'Rider (black)', svg: rider({ color: '#1F2328', bg: '#E5E7EB' }) },
  { id: 'rider-red', label: 'Rider (red)', svg: rider({ color: '#DC2626', bg: '#FEE2E2' }) },
  { id: 'rider-green', label: 'Rider (green)', svg: rider({ color: '#16A34A', bg: '#DCFCE7' }) },
  { id: 'rider-purple', label: 'Rider (purple)', svg: rider({ color: '#7C3AED', bg: '#EDE9FE' }) },
];

const full = (svg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${svg}</svg>`;

if (require.main === module) {
  const out = path.join(__dirname, '..', 'src', 'lib', 'avatar-art.ts');
  const body = AVATARS.map(
    (a) => `  { id: '${a.id}', label: '${a.label.replace(/'/g, "\\'")}', xml: ${JSON.stringify(full(a.svg))} },`,
  ).join('\n');
  fs.writeFileSync(
    out,
    `// Generated by scripts/avatar-art.js. Do not edit by hand; change the script and re-run it.
/** Rider avatars (helmets and riders on bikes), as SVG markup on a 100x100 canvas. */
export const AVATAR_ART = [
${body}
] as const;
`,
  );
  console.error(`wrote ${path.relative(process.cwd(), out)} (${AVATARS.length} avatars, ${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
}

module.exports = { AVATARS, full };
