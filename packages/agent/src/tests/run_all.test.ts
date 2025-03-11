/**
 * Run all tests
 * 
 * This file imports all test files to run them together.
 * The paths are relative to the src directory.
 */
import './memory_test';
import './tools_test';
import './ai_integration_test';
import './tool_integration.test';
import './agent_selection.test';

import { test } from 'bun:test';

// Simple test to verify the test runner is working
test('Test Runner > Verify Tests Are Loaded', () => {
    // This test always passes
}); 