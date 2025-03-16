/**
 * Test runner script for @bactor/http
 * 
 * This script organizes and runs the tests for the HTTP module
 */

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Configuration
const TEST_DIRS = [
    'unit',
    'integration'
];

// Capture and forward command line args
const args = process.argv.slice(2);

console.log('🧪 Running @bactor/http tests');

// Run each test directory
let success = true;
for (const dir of TEST_DIRS) {
    const testDir = path.join(__dirname, dir);

    // Skip if directory doesn't exist
    if (!fs.existsSync(testDir)) {
        console.log(`📁 Skipping ${dir} tests (directory not found)`);
        continue;
    }

    // List test files in the directory
    const testFiles = fs.readdirSync(testDir)
        .filter(file => file.endsWith('.test.ts'));

    if (testFiles.length === 0) {
        console.log(`📁 No test files found in ${dir}`);
        continue;
    }

    console.log(`\n📁 Running ${testFiles.length} ${dir} tests`);

    // Run each test file
    for (const file of testFiles) {
        const testFile = path.join(testDir, file);
        console.log(`\n📄 Running ${file}`);

        // Run the test with Bun
        const result = spawnSync('bun', ['test', testFile, ...args], {
            stdio: 'inherit',
            encoding: 'utf-8'
        });

        if (result.status !== 0) {
            success = false;
            console.error(`❌ ${file} failed with status ${result.status}`);
        }
    }
}

// Exit with appropriate status code
process.exit(success ? 0 : 1); 