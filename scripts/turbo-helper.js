#!/usr/bin/env bun
/**
 * Turbo Helper Script
 * 
 * This script assists with specific Turborepo operations that require
 * special handling when using Bun as the runtime.
 */

import { spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

const PACKAGES_DIR = join(process.cwd(), 'packages');

// Get all packages in the workspace
function getAllPackages() {
    const packages = [];
    const baseDirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    // Add base packages
    for (const dir of baseDirs) {
        // Skip stores directory as we'll handle it separately
        if (dir === 'stores') continue;

        const pkgJsonPath = join(PACKAGES_DIR, dir, 'package.json');
        if (existsSync(pkgJsonPath)) {
            packages.push(dir);
        }
    }

    // Add store packages
    const storesDir = join(PACKAGES_DIR, 'stores');
    if (existsSync(storesDir)) {
        const storeDirs = readdirSync(storesDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const dir of storeDirs) {
            const pkgJsonPath = join(storesDir, dir, 'package.json');
            if (existsSync(pkgJsonPath)) {
                packages.push(`stores/${dir}`);
            }
        }
    }

    return packages;
}

// Run a command in each package
function runCommandInPackages(command, args = []) {
    const packages = getAllPackages();
    console.log(`Running '${command} ${args.join(' ')}' in all packages...`);

    for (const pkg of packages) {
        const pkgPath = join(PACKAGES_DIR, pkg);
        console.log(`\n📦 Package: ${pkg}`);

        const result = spawnSync('bun', [command, ...args], {
            cwd: pkgPath,
            stdio: 'inherit',
            env: { ...process.env, FORCE_COLOR: 'true' }
        });

        if (result.status !== 0) {
            console.error(`❌ Failed to run '${command}' in package '${pkg}'`);
            process.exit(1);
        }
    }

    console.log('\n✅ All packages processed successfully');
}

// Main function to handle commands
function main() {
    const [, , command, ...args] = process.argv;

    switch (command) {
        case 'run-all':
            if (args.length === 0) {
                console.error('Please specify a command to run in all packages');
                process.exit(1);
            }
            runCommandInPackages('run', args);
            break;

        case 'clean-all':
            runCommandInPackages('run', ['clean']);
            break;

        case 'help':
        default:
            console.log(`
Turbo Helper Script

Usage: bun scripts/turbo-helper.js [command]

Commands:
  run-all [script]   Run a specific script in all packages
  clean-all          Run the clean script in all packages
  help               Show this help message
      `);
            break;
    }
}

main(); 