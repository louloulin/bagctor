import { spawnSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface CompileResult {
  success: boolean;
  errors: string[];
}

class ProjectChecker {
  private testResults: TestResult[] = [];
  private compileErrors: string[] = [];

  async check(): Promise<void> {
    console.log('🔍 Starting project check...\n');

    // Step 1: Type checking
    console.log('📝 Running type check...');
    const compileResult = this.runCompilation();
    if (!compileResult.success) {
      console.log('❌ Type check failed:');
      compileResult.errors.forEach(error => console.log(`  ${error}`));
    } else {
      console.log('✅ Type check passed\n');
    }

    // Step 2: Run tests
    console.log('🧪 Running tests...');
    await this.runTests();
    this.printTestResults();

    // Step 3: Run examples
    console.log('\n📚 Running examples...');
    await this.runExamples();

    // Summary
    this.printSummary();
  }

  private runCompilation(): CompileResult {
    const tsc = spawnSync('bun', ['x', 'tsc', '--noEmit'], {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    const success = tsc.status === 0;
    const errors = tsc.stderr
      .split('\n')
      .filter(line => line.includes('error TS'))
      .map(line => line.trim());

    return { success, errors };
  }

  private async runTests(): Promise<void> {
    const testFiles = this.findFiles('src/tests', '.test.ts');
    
    for (const file of testFiles) {
      const startTime = Date.now();
      const result = spawnSync('bun', ['test', file], {
        encoding: 'utf-8',
        stdio: 'pipe'
      });

      this.testResults.push({
        name: file.replace('src/tests/', ''),
        passed: result.status === 0,
        duration: Date.now() - startTime,
        error: result.status !== 0 ? result.stderr : undefined
      });
    }
  }

  private async runExamples(): Promise<void> {
    const exampleFiles = this.findFiles('src/examples', '.ts');
    
    for (const file of exampleFiles) {
      console.log(`\nRunning example: ${file}`);
      const result = spawnSync('bun', ['run', file], {
        encoding: 'utf-8',
        stdio: 'inherit'
      });

      if (result.status !== 0) {
        console.log(`❌ Example ${file} failed`);
      } else {
        console.log(`✅ Example ${file} completed successfully`);
      }
    }
  }

  private findFiles(dir: string, extension: string): string[] {
    const files: string[] = [];
    
    try {
      const entries = readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...this.findFiles(fullPath, extension));
        } else if (entry.endsWith(extension)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${dir}`);
    }
    
    return files;
  }

  private printTestResults(): void {
    console.log('\nTest Results:');
    console.log('-------------');
    
    for (const result of this.testResults) {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.name} (${result.duration}ms)`);
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
  }

  private printSummary(): void {
    console.log('\nSummary:');
    console.log('--------');
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.passed).length;
    
    console.log(`Tests: ${passedTests}/${totalTests} passed`);
    console.log(`Type check: ${this.compileErrors.length === 0 ? 'Passed' : 'Failed'}`);
    
    if (this.compileErrors.length > 0 || passedTests < totalTests) {
      process.exit(1);
    }
  }
}

// Run the checker
new ProjectChecker().check().catch(console.error); 