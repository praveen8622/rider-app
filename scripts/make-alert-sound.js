// Generates assets/sounds/overspeed.wav: a short two-tone warning beep.
// Run with `node scripts/make-alert-sound.js` if you want to tweak the tone.
const fs = require('fs');
const path = require('path');

const RATE = 22050;
// [frequency Hz, duration s] — high/low/high, like a car's warning chime.
const TONES = [
  [1760, 0.12],
  [0, 0.04],
  [1320, 0.12],
  [0, 0.04],
  [1760, 0.18],
];

const samples = [];
for (const [freq, dur] of TONES) {
  const n = Math.round(RATE * dur);
  for (let i = 0; i < n; i++) {
    // 5 ms fade in/out per tone so it doesn't click.
    const fade = Math.min(1, i / (RATE * 0.005), (n - i) / (RATE * 0.005));
    samples.push(freq ? Math.sin((2 * Math.PI * freq * i) / RATE) * 0.8 * fade : 0);
  }
}

const data = Buffer.alloc(samples.length * 2);
samples.forEach((s, i) => data.writeInt16LE(Math.round(s * 32767), i * 2));

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16); // PCM chunk size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(data.length, 40);

const out = path.join(__dirname, '..', 'assets', 'sounds', 'overspeed.wav');
fs.writeFileSync(out, Buffer.concat([header, data]));
console.log(`Wrote ${out} (${samples.length} samples)`);
