import { mkdir, rm } from 'node:fs/promises';

const targets = [
  { target: 'bun-linux-x64', out: 'dist/cynexgpd-linux-x64' },
  { target: 'bun-linux-x64-baseline', out: 'dist/cynexgpd-linux-x64-baseline' },
  { target: 'bun-linux-arm64', out: 'dist/cynexgpd-linux-arm64' },
  { target: 'bun-darwin-x64', out: 'dist/cynexgpd-macos-x64' },
  { target: 'bun-darwin-arm64', out: 'dist/cynexgpd-macos-arm64' },
  { target: 'bun-windows-x64', out: 'dist/cynexgpd-windows-x64.exe' },
  {
    target: 'bun-windows-x64-baseline',
    out: 'dist/cynexgpd-windows-x64-baseline.exe',
  },
];

console.log('checking TypeScript...');
const tscProc = Bun.spawn(['bunx', 'tsc', '--noEmit'], {
  stdout: 'inherit',
  stderr: 'inherit',
});
const tscCode = await tscProc.exited;
if (tscCode !== 0) {
  console.error('TypeScript check failed');
  process.exit(1);
}
console.log('TypeScript check passed');

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

for (const { target, out } of targets) {
  console.log(`building ${out}...`);
  const proc = Bun.spawn(['bun', 'build', '--compile', '--target', target, '--outfile', out, 'src/app.ts'], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await proc.exited;
  if (code !== 0) console.error(`build failed for ${target}`);
  else console.log(`built ${out}`);
}
