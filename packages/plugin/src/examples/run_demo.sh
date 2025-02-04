#!/bin/bash

echo "Building plugins..."
cd calculator
npm run build
cd ..

echo "Running Node.js demo..."
node plugin_demo.ts

echo "Running Bun demo..."
bun run plugin_demo_bun.ts

echo "Demo completed" 