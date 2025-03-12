#!/bin/bash

# 清理之前的构建
bash ./clean.sh

echo "开始构建所有包..."

# 按依赖顺序构建包
PACKAGES=("core" "agent" "match-engine" "web" "plugin" "rag" "mcp" "memory" "vscode-chat" "stores/pg" "stores/qdrant" "stores/vectorize")

for pkg in "${PACKAGES[@]}"; do
  echo "正在构建 $pkg 包..."
  (cd packages/$pkg && bun run build)
  
  if [ $? -ne 0 ]; then
    echo "构建 $pkg 失败！"
    exit 1
  fi
  
  echo "$pkg 包构建成功!"
  echo "-------------------"
done

echo "所有包构建完成！" 