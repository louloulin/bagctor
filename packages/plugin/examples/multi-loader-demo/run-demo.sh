#!/bin/bash
# 运行BActor多方式加载插件演示

set -e

echo "=== 安装依赖 ==="
cd ../../../../
bun install

echo "=== 构建核心包 ==="
cd packages/core
bun run build

echo "=== 构建插件包 ==="
cd ../plugin
bun run build

echo "=== 构建并运行演示 ==="
cd examples/multi-loader-demo

# 创建简化版的构建配置
echo "创建临时编译配置..."
cat > tsconfig.build.json << 'EOF'
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "CommonJS",
        "outDir": "./dist",
        "skipLibCheck": true,
        "esModuleInterop": true,
        "resolveJsonModule": true,
        "allowJs": true,
        "noEmitOnError": false
    },
    "include": [
        "src/**/*"
    ],
    "exclude": [
        "node_modules"
    ]
}
EOF

# 构建静态插件
echo "构建静态插件..."
cd plugins/static-plugin
cp ../../tsconfig.build.json .
bun run tsc -p tsconfig.build.json || echo "跳过TypeScript错误"
cd ../..

# 构建动态插件
echo "构建动态插件..."
cd plugins/dynamic-plugin
cp ../../tsconfig.build.json .
bun run tsc -p tsconfig.build.json || echo "跳过TypeScript错误"
cd ../..

# 构建主程序
echo "构建主程序..."
bun run tsc -p tsconfig.build.json || echo "跳过TypeScript错误"

# 运行演示
echo "运行演示..."
bun run dist/index.js

echo "=== 演示结束 ===" 