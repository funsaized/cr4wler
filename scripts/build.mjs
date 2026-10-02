import { build } from 'esbuild';
import { mkdir, cp, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('LICENSE', 'dist/LICENSE');
await cp('PRIVACY.md', 'dist/PRIVACY.md');
await build({
  entryPoints: ['src/content.ts', 'src/popup.ts', 'src/background.ts', 'src/playground.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome105',
  minify: true,
  legalComments: 'none',
});
console.log('Built dist/ — load this directory unpacked.');
