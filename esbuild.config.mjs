import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

const watch = process.argv.includes('--watch');
const outfile = watch ? 'main.js' : 'dist/main.js';

if (!watch) {
  mkdirSync('dist', { recursive: true });
}

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  sourcemap: watch,
  minify: !watch,
  treeShaking: true,
  external: ['obsidian'],
  logLevel: 'info'
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
  copyFileSync('manifest.json', 'dist/manifest.json');
  copyFileSync('styles.css', 'dist/styles.css');
}
