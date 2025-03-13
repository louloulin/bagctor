import { TestRunner } from "bun:test";

export class CustomReporter {
    private startTime: number = 0;
    private testCount: number = 0;
    private passCount: number = 0;
    private failCount: number = 0;
    private skipCount: number = 0;

    constructor(private runner: TestRunner) {
        this.setupListeners();
    }

    private setupListeners() {
        this.runner.onTestStart(() => {
            if (this.testCount === 0) {
                this.startTime = Date.now();
                console.log("\n🚀 Starting test suite...\n");
            }
            this.testCount++;
        });

        this.runner.onTestEnd((test) => {
            if (test.failed) {
                this.failCount++;
                console.log(`❌ ${test.name}`);
                if (test.error) {
                    console.log(`   Error: ${test.error.message}\n`);
                }
            } else if (test.skipped) {
                this.skipCount++;
                console.log(`⏭️  ${test.name} (skipped)`);
            } else {
                this.passCount++;
                console.log(`✅ ${test.name}`);
            }
        });

        this.runner.onEnd(() => {
            const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
            console.log("\n📊 Test Summary:");
            console.log("================");
            console.log(`Total Tests: ${this.testCount}`);
            console.log(`Passed: ${this.passCount} ✅`);
            console.log(`Failed: ${this.failCount} ❌`);
            console.log(`Skipped: ${this.skipCount} ⏭️`);
            console.log(`Duration: ${duration}s ⏱️\n`);

            if (this.failCount > 0) {
                console.log("❌ Some tests failed!");
                process.exit(1);
            } else {
                console.log("✅ All tests passed!");
            }
        });
    }
} 