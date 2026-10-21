// Bundles index.html, its stylesheet and scripts into one self-contained HTML file.
//
//   node scripts/build.mjs                  -> dist/startup-sme-valuator.html
//   node scripts/build.mjs out.html         -> custom output path
//   node scripts/build.mjs out.html --fragment
//       omits the <!doctype>, <html>, <head> and <body> wrappers, for hosts
//       that supply their own document skeleton.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = resolve(args.find((a) => !a.startsWith('--')) || join(root, 'dist', 'startup-sme-valuator.html'));

const read = (rel) => readFileSync(join(root, rel), 'utf8');
let html = read('index.html');

html = html.replace(/<link rel="stylesheet" href="(src\/[^"]+\.css)">/g, (_, path) => `<style>\n${read(path)}</style>`);
html = html.replace(/<script src="(src\/[^"]+\.js)"><\/script>/g, (_, path) => {
  const code = read(path);
  if (code.includes('</script')) throw new Error(`${path} contains a closing script tag`);
  return `<script>\n${code}</script>`;
});

if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body>\s*/i, '')
    .replace(/<\/body>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '');
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`Wrote ${out} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
