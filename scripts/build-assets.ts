// Render the SVG brand sources into the binary files the app serves.
// Run directly with `bun run assets`; start/dev invoke it automatically.
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const web = path.join(import.meta.dir, '..', 'web');

const jobs = [
  { src: 'og-image.svg', out: 'og-image.png' },
];

for (const { src, out } of jobs) {
  const svg = await Bun.file(path.join(web, src)).text();
  const png = new Resvg(svg).render().asPng();
  await Bun.write(path.join(web, out), png);
  console.log(`[assets] ${out}  ${(png.length / 1024).toFixed(1)} KiB`);
}
