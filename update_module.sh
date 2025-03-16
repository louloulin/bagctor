#!/bin/bash

# Script to update web references to http in the http module

SOURCE_DIR="packages/http/src"

# Find all TypeScript files in the source directory
find "$SOURCE_DIR" -name "*.ts" -type f | while read -r file; do
  echo "Processing file: $file"
  # Replace "@bactor/web" with "@bactor/http" in the file
  sed -i '' 's/@bactor\/web/@bactor\/http/g' "$file"
  # Replace other occurrences of "web" with "http" where appropriate, avoiding false positives
  # Focus on module names, package names, and other clear references
  sed -i '' 's/from "web"/from "http"/g' "$file"
  sed -i '' "s/from 'web'/from 'http'/g" "$file"
  sed -i '' 's/import { web /import { http /g' "$file"
  sed -i '' 's/export { web /export { http /g' "$file"
done

echo "Update complete!" 