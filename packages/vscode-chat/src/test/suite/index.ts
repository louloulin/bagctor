import * as path from 'path';
import { default as mocha } from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  // Create the mocha test
  const runner = new mocha({
    ui: 'tdd',
    color: true,
    timeout: 60000
  });

  const testsRoot = path.resolve(__dirname, '.');

  try {
    // Find all test files
    const files = await glob('**/*.test.ts', { cwd: testsRoot });

    // Add files to the test suite
    for (const f of files) {
      runner.addFile(path.resolve(testsRoot, f));
    }

    // Run the mocha tests
    return new Promise<void>((resolve, reject) => {
      try {
        runner.run((failures: number) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  } catch (err) {
    console.error(err);
    throw err;
  }
} 