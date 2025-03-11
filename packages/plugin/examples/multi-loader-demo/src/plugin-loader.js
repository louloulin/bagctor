"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginLoader = void 0;
exports.getPluginLoader = getPluginLoader;
exports.loadStaticPlugin = loadStaticPlugin;
exports.loadDynamicPlugin = loadDynamicPlugin;
var core_1 = require("@bactor/core");
var fs = require("fs-extra");
var path = require("path");
var child_process_1 = require("child_process");
var util_1 = require("util");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * 插件加载器 - 负责加载和管理插件
 */
var PluginLoader = /** @class */ (function () {
    function PluginLoader(system) {
        this.loadedPlugins = new Map();
        this.system = system;
    }
    /**
     * 从已安装的NPM包加载插件（静态加载）
     *
     * @param pluginPackage 插件包或插件构造函数
     * @param config 插件配置
     * @returns 加载的插件实例
     */
    PluginLoader.prototype.loadStaticPlugin = function (pluginPackage, config) {
        return __awaiter(this, void 0, void 0, function () {
            var plugin, rootContext, pluginContext, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        plugin = void 0;
                        if (typeof pluginPackage === 'function') {
                            // 直接使用构造函数
                            plugin = new pluginPackage();
                        }
                        else if ('default' in pluginPackage && typeof pluginPackage.default === 'function') {
                            // 使用默认导出的构造函数
                            plugin = new pluginPackage.default();
                        }
                        else if ('createPlugin' in pluginPackage && typeof pluginPackage.createPlugin === 'function') {
                            // 使用工厂函数
                            plugin = pluginPackage.createPlugin();
                        }
                        else {
                            throw new Error('无效的插件包格式，需要默认导出构造函数或createPlugin工厂函数');
                        }
                        // 2. 检查插件元数据
                        this.validatePluginMetadata(plugin.metadata);
                        rootContext = new core_1.ActorContext({ id: "plugin-".concat(plugin.metadata.id, "-root") }, this.system);
                        pluginContext = this.createPluginContext(rootContext, plugin.metadata.id);
                        // 5. 初始化插件
                        return [4 /*yield*/, plugin.initialize(pluginContext, config || {})];
                    case 1:
                        // 5. 初始化插件
                        _a.sent();
                        // 6. 存储已加载的插件
                        this.loadedPlugins.set(plugin.metadata.id, { plugin: plugin });
                        core_1.log.info("\u9759\u6001\u52A0\u8F7D\u63D2\u4EF6\u6210\u529F: ".concat(plugin.metadata.id, " (").concat(plugin.metadata.version, ")"));
                        return [2 /*return*/, plugin];
                    case 2:
                        error_1 = _a.sent();
                        core_1.log.error("\u9759\u6001\u52A0\u8F7D\u63D2\u4EF6\u5931\u8D25:", error_1);
                        throw error_1;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 从文件系统路径或URL动态加载插件
     *
     * @param pluginPath 插件路径（本地文件系统路径或URL）
     * @param config 插件配置
     * @returns 加载的插件实例
     */
    PluginLoader.prototype.loadDynamicPlugin = function (pluginPath, config) {
        return __awaiter(this, void 0, void 0, function () {
            var isUrl, localPluginPath, pluginJsonPath, packageJson, mainFile, entryPoint, _a, pluginModule, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 13, , 14]);
                        isUrl = pluginPath.startsWith('http://') || pluginPath.startsWith('https://');
                        localPluginPath = void 0;
                        if (!isUrl) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.downloadPlugin(pluginPath)];
                    case 1:
                        // 处理远程URL插件（下载到临时目录）
                        localPluginPath = _b.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        // 使用本地路径
                        localPluginPath = path.resolve(pluginPath);
                        _b.label = 3;
                    case 3: return [4 /*yield*/, fs.pathExists(localPluginPath)];
                    case 4:
                        // 2. 确认插件目录存在
                        if (!(_b.sent())) {
                            throw new Error("\u63D2\u4EF6\u8DEF\u5F84\u4E0D\u5B58\u5728: ".concat(localPluginPath));
                        }
                        pluginJsonPath = path.join(localPluginPath, 'package.json');
                        return [4 /*yield*/, fs.pathExists(pluginJsonPath)];
                    case 5:
                        if (!(_b.sent())) {
                            throw new Error("\u63D2\u4EF6package.json\u4E0D\u5B58\u5728: ".concat(pluginJsonPath));
                        }
                        return [4 /*yield*/, fs.readJson(pluginJsonPath)];
                    case 6:
                        packageJson = _b.sent();
                        core_1.log.info("\u52A0\u8F7D\u63D2\u4EF6\u5143\u6570\u636E: ".concat(packageJson.name, "@").concat(packageJson.version));
                        mainFile = packageJson.main || 'index.js';
                        entryPoint = path.join(localPluginPath, mainFile);
                        return [4 /*yield*/, fs.pathExists(entryPoint)];
                    case 7:
                        _a = !(_b.sent());
                        if (!_a) return [3 /*break*/, 9];
                        return [4 /*yield*/, fs.pathExists(path.join(localPluginPath, 'src'))];
                    case 8:
                        _a = (_b.sent());
                        _b.label = 9;
                    case 9:
                        if (!_a) return [3 /*break*/, 11];
                        core_1.log.info("\u63D2\u4EF6\u9700\u8981\u6784\u5EFA: ".concat(localPluginPath));
                        return [4 /*yield*/, this.buildPlugin(localPluginPath)];
                    case 10:
                        _b.sent();
                        _b.label = 11;
                    case 11:
                        // 6. 加载插件模块
                        core_1.log.info("\u4ECE".concat(entryPoint, "\u52A0\u8F7D\u63D2\u4EF6\u6A21\u5757"));
                        pluginModule = require(entryPoint);
                        return [4 /*yield*/, this.loadStaticPlugin(pluginModule, config)];
                    case 12: 
                    // 7. 使用静态加载方法完成剩余步骤
                    return [2 /*return*/, _b.sent()];
                    case 13:
                        error_2 = _b.sent();
                        core_1.log.error("\u52A8\u6001\u52A0\u8F7D\u63D2\u4EF6\u5931\u8D25:", error_2);
                        throw error_2;
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 卸载插件
     *
     * @param pluginId 插件ID
     */
    PluginLoader.prototype.unloadPlugin = function (pluginId) {
        return __awaiter(this, void 0, void 0, function () {
            var pluginEntry, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        pluginEntry = this.loadedPlugins.get(pluginId);
                        if (!pluginEntry) {
                            core_1.log.warn("\u5378\u8F7D\u63D2\u4EF6\u5931\u8D25: \u63D2\u4EF6 ".concat(pluginId, " \u672A\u52A0\u8F7D"));
                            return [2 /*return*/];
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        if (!(pluginEntry.pid && pluginEntry.actor)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.system.stop(pluginEntry.pid)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: 
                    // 2. 执行插件清理
                    return [4 /*yield*/, pluginEntry.plugin.cleanup()];
                    case 4:
                        // 2. 执行插件清理
                        _a.sent();
                        // 3. 从加载列表中移除
                        this.loadedPlugins.delete(pluginId);
                        core_1.log.info("\u63D2\u4EF6\u5378\u8F7D\u6210\u529F: ".concat(pluginId));
                        return [3 /*break*/, 6];
                    case 5:
                        error_3 = _a.sent();
                        core_1.log.error("\u5378\u8F7D\u63D2\u4EF6\u5931\u8D25:", error_3);
                        throw error_3;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * 获取所有已加载的插件
     */
    PluginLoader.prototype.getLoadedPlugins = function () {
        return Array.from(this.loadedPlugins.entries()).map(function (_a) {
            var id = _a[0], entry = _a[1];
            return {
                id: id,
                metadata: entry.plugin.metadata
            };
        });
    };
    // ==== 私有辅助方法 ====
    /**
     * 验证插件元数据合法性
     */
    PluginLoader.prototype.validatePluginMetadata = function (metadata) {
        if (!metadata.id) {
            throw new Error('插件元数据缺少id字段');
        }
        if (!metadata.name) {
            throw new Error('插件元数据缺少name字段');
        }
        if (!metadata.version) {
            throw new Error('插件元数据缺少version字段');
        }
        if (!metadata.capabilities || !Array.isArray(metadata.capabilities)) {
            throw new Error('插件元数据缺少capabilities字段或格式不正确');
        }
    };
    /**
     * 创建插件上下文
     */
    PluginLoader.prototype.createPluginContext = function (actorContext, pluginId) {
        var _this = this;
        // 简化的插件上下文实现
        return {
            send: function (target, type, payload) { return __awaiter(_this, void 0, void 0, function () {
                var targetPid;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            targetPid = typeof target === 'string' ? { id: target } : target;
                            return [4 /*yield*/, actorContext.send(targetPid, { type: type, payload: payload })];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); },
            registerHandler: function (messageType, handler) {
                // 在实际实现中，这里需要与Actor系统集成
                core_1.log.info("\u6CE8\u518C\u6D88\u606F\u5904\u7406\u5668: ".concat(messageType));
            },
            getPluginId: function () { return pluginId; },
            log: core_1.log
        };
    };
    /**
     * 从URL下载插件到临时目录
     */
    PluginLoader.prototype.downloadPlugin = function (url) {
        return __awaiter(this, void 0, void 0, function () {
            var tmpDir;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // 注意：这里简化实现，实际实现需要更安全的下载和验证逻辑
                        core_1.log.info("\u4E0B\u8F7D\u63D2\u4EF6: ".concat(url));
                        tmpDir = path.join(process.cwd(), 'tmp', 'plugins', "download-".concat(Date.now()));
                        return [4 /*yield*/, fs.ensureDir(tmpDir)];
                    case 1:
                        _a.sent();
                        // 这里应该实现实际的下载逻辑
                        // 简化示例：假装已下载
                        return [4 /*yield*/, fs.writeFile(path.join(tmpDir, 'download-info.txt'), "\u4E0B\u8F7D\u81EA: ".concat(url, "\n\u65F6\u95F4: ").concat(new Date().toISOString()))];
                    case 2:
                        // 这里应该实现实际的下载逻辑
                        // 简化示例：假装已下载
                        _a.sent();
                        return [2 /*return*/, tmpDir];
                }
            });
        });
    };
    /**
     * 构建插件（编译TypeScript等）
     */
    PluginLoader.prototype.buildPlugin = function (pluginPath) {
        return __awaiter(this, void 0, void 0, function () {
            var packageJsonPath, packageJson, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        core_1.log.info("\u6784\u5EFA\u63D2\u4EF6: ".concat(pluginPath));
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 8]);
                        packageJsonPath = path.join(pluginPath, 'package.json');
                        return [4 /*yield*/, fs.readJson(packageJsonPath)];
                    case 2:
                        packageJson = _a.sent();
                        if (!(packageJson.scripts && packageJson.scripts.build)) return [3 /*break*/, 4];
                        // 使用插件自己的构建脚本
                        core_1.log.info("\u4F7F\u7528\u63D2\u4EF6\u6784\u5EFA\u811A\u672C: ".concat(packageJson.scripts.build));
                        return [4 /*yield*/, execAsync('npm run build', { cwd: pluginPath })];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 4:
                        // 默认TypeScript编译
                        core_1.log.info('使用默认TypeScript编译');
                        return [4 /*yield*/, execAsync('tsc --build', { cwd: pluginPath })];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6:
                        core_1.log.info("\u63D2\u4EF6\u6784\u5EFA\u5B8C\u6210: ".concat(pluginPath));
                        return [3 /*break*/, 8];
                    case 7:
                        error_4 = _a.sent();
                        core_1.log.error("\u63D2\u4EF6\u6784\u5EFA\u5931\u8D25:", error_4);
                        throw new Error("\u63D2\u4EF6\u6784\u5EFA\u5931\u8D25: ".concat(error_4 instanceof Error ? error_4.message : String(error_4)));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    return PluginLoader;
}());
exports.PluginLoader = PluginLoader;
// 导出便捷函数
var defaultLoader = null;
/**
 * 获取默认插件加载器
 */
function getPluginLoader(system) {
    if (!defaultLoader) {
        if (!system) {
            throw new Error('首次获取加载器时必须提供ActorSystem');
        }
        defaultLoader = new PluginLoader(system);
    }
    return defaultLoader;
}
/**
 * 加载静态插件（简化接口）
 */
function loadStaticPlugin(system, pluginPackage, config) {
    return __awaiter(this, void 0, void 0, function () {
        var loader;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    loader = getPluginLoader(system);
                    return [4 /*yield*/, loader.loadStaticPlugin(pluginPackage, config)];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 加载动态插件（简化接口）
 */
function loadDynamicPlugin(system, pluginPath, config) {
    return __awaiter(this, void 0, void 0, function () {
        var loader;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    loader = getPluginLoader(system);
                    return [4 /*yield*/, loader.loadDynamicPlugin(pluginPath, config)];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
