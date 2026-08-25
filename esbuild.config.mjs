import { build, context } from 'esbuild';
import { cp, rm, mkdir } from 'node:fs/promises';
import { watch as watchFs } from 'node:fs';

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [
    'src/background.ts',
    'src/content.ts',
    'src/panel.ts',
  ],
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome114',
  sourcemap: true,
  logLevel: 'info',
};

async function copyStaticFiles() {
  await mkdir('dist', { recursive: true });
  await cp('public', 'dist', { recursive: true });
  await cp('src/panel.html', 'dist/panel.html');
  await cp('src/panel.css', 'dist/panel.css');
}

function watchStaticFiles() {
  let timer;
  const rerun = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      copyStaticFiles()
        .then(() => console.log('[esbuild] static files copied'))
        .catch((err) => console.error('[esbuild] static file copy failed', err));
    }, 100);
  };

  watchFs('public', { recursive: true }, rerun);
  watchFs('src/panel.html', rerun);
  watchFs('src/panel.css', rerun);
}

async function main() {
  await rm('dist', { recursive: true, force: true });
  await copyStaticFiles();

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    watchStaticFiles();
    console.log('[esbuild] watching for changes...');
  } else {
    await build(buildOptions);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
