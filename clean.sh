#!/bin/bash

echo "正在清理所有生成的文件..."

# 清理源码目录中的编译文件
find packages -type f -name "*.js" -path "*/src/*" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec rm {} \;
find packages -type f -name "*.d.ts" -path "*/src/*" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec rm {} \;
find packages -type f -name "*.map" -path "*/src/*" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec rm {} \;
find packages -type f -name "*.tsbuildinfo" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec rm {} \;

# 清理各个包的dist目录
PACKAGES=("core" "agent" "match-engine" "web" "plugin")

for pkg in "${PACKAGES[@]}"; do
  echo "清理 $pkg 包..."
  (cd packages/$pkg && bun run clean)
done

echo "所有清理工作完成！" 