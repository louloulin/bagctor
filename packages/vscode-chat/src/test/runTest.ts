import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import { describe, test } from 'bun:test';

describe('VS Code Extension Tests', () => {
  test('Extension should activate and run tests', async () => {
    try {
      // The folder containing the Extension Manifest package.json
      const extensionDevelopmentPath = path.resolve(import.meta.dir, '../../');

      // The path to test runner
      const extensionTestsPath = path.resolve(import.meta.dir, './suite/index');

      // Download VS Code, unzip it and run the integration test
      await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: ['--disable-extensions']
      });
    } catch (err) {
      console.error('Failed to run tests:', err);
      throw err;
    }
  });
}); 