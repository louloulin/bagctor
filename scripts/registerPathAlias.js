/**
 * 注册路径别名，使@core、@utils等路径能够在运行时正确解析
 */
const path = require('path');
const fs = require('fs');
const { Module } = require('module');

// 获取项目根目录
const projectRoot = path.resolve(__dirname, '..');

// 定义路径别名映射
const pathAliases = {
    '@core': path.join(projectRoot, 'packages/core/src/core'),
    '@utils': path.join(projectRoot, 'packages/core/src/utils'),
    '@testing': path.join(projectRoot, 'packages/core/src/testing'),
    '@monitoring': path.join(projectRoot, 'packages/core/src/monitoring'),
};

// 保存原始的Module._resolveFilename方法
const originalResolveFilename = Module._resolveFilename;

// 重写Module._resolveFilename方法，处理@开头的路径
Module._resolveFilename = function (request, parent, isMain, options) {
    // 检查请求是否以路径别名开头
    for (const [alias, aliasPath] of Object.entries(pathAliases)) {
        if (request.startsWith(`${alias}/`)) {
            // 替换路径别名为实际路径
            const aliasRelativePath = request.slice(alias.length);
            const resolvedPath = path.join(aliasPath, aliasRelativePath);

            console.log(`[Path Alias] Resolving ${request} to ${resolvedPath}`);

            // 检查文件是否存在
            try {
                // 首先尝试直接解析
                return originalResolveFilename.call(this, resolvedPath, parent, isMain, options);
            } catch (error) {
                // 如果直接解析失败，尝试添加可能的扩展名
                const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];
                for (const ext of extensions) {
                    const pathWithExt = `${resolvedPath}${ext}`;
                    if (fs.existsSync(pathWithExt)) {
                        return originalResolveFilename.call(this, pathWithExt, parent, isMain, options);
                    }
                }

                // 如果仍然找不到，尝试作为目录解析（查找index文件）
                for (const ext of extensions) {
                    const indexPath = path.join(resolvedPath, `index${ext}`);
                    if (fs.existsSync(indexPath)) {
                        return originalResolveFilename.call(this, indexPath, parent, isMain, options);
                    }
                }

                // 如果所有尝试都失败，抛出原始错误
                throw error;
            }
        }
    }

    // 如果不是路径别名，使用原始方法
    return originalResolveFilename.call(this, request, parent, isMain, options);
};

console.log('[Path Alias] Path alias registration completed.'); 