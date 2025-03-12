#!/bin/bash

# 清理源码目录中的编译文件
echo "正在清理源码目录中的编译文件..."

# 删除源代码目录中的JS文件（不包括node_modules和dist）
find packages -type f -name "*.js" -path "*/src/*" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec rm {} \;
echo "已删除 .js 文件"

# 删除源代码目录中的声明文件
find packages -type f -name "*.d.ts" -path "*/src/*" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec rm {} \;
echo "已删除 .d.ts 文件"

# 删除源代码目录中的映射文件
find packages -type f -name "*.map" -path "*/src/*" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec rm {} \;
echo "已删除 .map 文件"

# 删除根目录中的编译缓存
find packages -type f -name "*.tsbuildinfo" -not -path "*/node_modules/*" -not -path "*/dist/*" -exec rm {} \;
echo "已删除 .tsbuildinfo 文件"

echo "清理完成！" 