import * as path from 'path';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const testsRoot = path.resolve(import.meta.dir, '.');

  try {
    // Find all test files
    const files = await glob('**/*.test.ts', { cwd: testsRoot });

    // Import and run all test files
    for (const f of files) {
      const filePath = path.resolve(testsRoot, f);
      await import(filePath);
    }
  } catch (err) {
    console.error('Failed to run tests:', err);
    throw err;
  }
} 