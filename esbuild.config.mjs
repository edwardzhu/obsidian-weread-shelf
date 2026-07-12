import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

mkdirSync(outdir, { recursive: true });

const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: `${outdir}/main.js`,
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
  copyFileSync('manifest.json', `${outdir}/manifest.json`);
  copyFileSync('styles.css', `${outdir}/styles.css`);
}
