#!/bin/bash

# 设置错误时退出
set -e

echo "🏗️ 开始构建所有包"

# 构建顺序：core -> agent -> 其他包
echo "📦 构建 core 包"
cd packages/core
bun install
bun run build
echo "✅ core 包构建完成"

echo "📦 构建 agent 包"
cd ../agent
bun install
bun run build
echo "✅ agent 包构建完成"

echo "📦 构建 memory 包"
cd ../memory
bun install
bun run build
echo "✅ memory 包构建完成"

echo "📦 构建 stores/pg 包"
cd ../stores/pg
bun install
bun run build
echo "✅ stores/pg 包构建完成"

echo "📦 构建 stores/qdrant 包"
cd ../stores/qdrant
bun install
bun run build
echo "✅ stores/qdrant 包构建完成"

echo "📦 构建 stores/vectorize 包"
cd ../stores/vectorize
bun install
bun run build
echo "✅ stores/vectorize 包构建完成"

echo "📦 构建 rag 包"
cd ../rag
bun install
bun run build
echo "✅ rag 包构建完成"

echo "🎉 所有包构建完成！" 