import { spawn as spwn } from 'child_process';
import type { RollupOutput } from 'rollup';
import { rollup } from 'rollup';
import { expect, beforeAll, it } from 'vitest';

const spawn = (cmd: string, args: ReadonlyArray<string>) =>
  new Promise((resolve, reject) => {
    const cp = spwn(cmd, args);
    const error: string[] = [];
    const stdout: string[] = [];
    cp.stdout.on('data', data => {
      stdout.push(data.toString());
    });

    cp.on('error', e => {
      error.push(e.toString());
    });

    cp.on('close', () => {
      if (error.length) {
        reject(error.join(''));
      } else {
        resolve(stdout.join(''));
      }
    });
  });

let output: RollupOutput['output'] | null = null;
beforeAll(async () => {
  await spawn('bun', ['run', 'build']);

  const bundler = await rollup({
    logLevel: 'silent',
    input: 'dist/storage/index.js',
    preserveSymlinks: true,
  });
  const { output: bundlerOutput } = await bundler.generate({
    format: 'esm',
  });

  output = bundlerOutput;
}, 0);

it.for([
  ['DefaultStorage'],
  ['DefaultVectorDB'],
  ['LibSQLStore'],
  ['MastraVector'],
  ['DefaultVectorDBMongo'],
  ['defaultEmbedder'],
])('should not include %s when importing /storage', ([exportName]) => {
  const renderedExports: string[] = [];
  const removedExports: string[] = [];
  for (const chunk of output!) {
    if (chunk.type === 'chunk') {
      for (const module of Object.values(chunk.modules)) {
        renderedExports.push(...module.renderedExports);
        removedExports.push(...module.removedExports);
      }
    }
  }

  expect(renderedExports).not.toContain(exportName);
  expect(removedExports).not.toContain(exportName);
});
