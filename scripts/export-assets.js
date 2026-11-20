// Exports Yatri's icon set (drawn in yroad.js, "Yatri orange" variant) as PNGs.
// Needs the renderer, which is not an app dependency:
//   npm install --no-save @resvg/resvg-js
//   node scripts/export-assets.js assets/images
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const { variants, mark } = require('./yroad');

const out = process.argv[2];
if (!out) throw new Error('usage: node export-assets.js <outDir>');
fs.mkdirSync(out, { recursive: true });

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${body}</svg>`;
const scaled = (s, body) => `<g transform="translate(512 512) scale(${s}) translate(-512 -512)">${body}</g>`;
const write = (name, source, size) => {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(path.join(out, name), png);
  console.log(`${name.padEnd(30)} ${size}x${size}  ${(png.length / 1024).toFixed(0)} KB`);
};

const brand = variants.orange;
// One color (white) with the asphalt and the pin's hole cut out, for themed icons and notifications.
const monoMask = (s) =>
  svg(`<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">${scaled(
    s,
    mark({ fg: '#FFFFFF', edge: '#FFFFFF', asphalt: '#000000', pinColor: '#FFFFFF', pinHole: '#000000', bikeColor: '#FFFFFF', clipId: 'mc' }),
  )}</mask></defs><rect width="1024" height="1024" fill="#FFFFFF" mask="url(#m)"/>`);

// Full-bleed app icon: the OS rounds the corners itself.
write('icon.png', svg(brand.tile('t') + brand.mark()), 1024);
// Android adaptive icon: plain tile behind, the mark inside the 66% safe zone in front.
write('android-icon-background.png', svg(brand.tile('t')), 1024);
write('android-icon-foreground.png', svg(scaled(0.7, brand.mark())), 1024);
write('android-icon-monochrome.png', monoMask(0.7), 1024);
// Splash: the mark alone on transparent, shown over the orange splash background.
write('splash-icon.png', svg(scaled(0.92, brand.mark())), 1024);
// Small white glyph for the "Recording your ride" notification (Android wants white on transparent).
write('notification-icon.png', monoMask(0.86), 96);
// In-app logo for the Home header, and the web favicon.
write('logo.png', svg(brand.tile('t') + brand.mark()), 256);
write('favicon.png', svg(brand.tile('t') + brand.mark()), 48);
