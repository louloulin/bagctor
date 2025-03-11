"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.runDemo = runDemo;
var core_1 = require("@bactor/core");
var plugin_loader_1 = require("./plugin-loader");
var path_1 = require("path");
/**
 * BActor插件多方式加载演示
 *
 * 此示例展示了如何使用两种不同方式加载插件：
 * 1. 通过package.json依赖方式（静态加载）
 * 2. 从文件系统或URL动态加载
 */
function runDemo() {
    return __awaiter(this, void 0, void 0, function () {
        var system, config, staticPluginPath, staticPluginModule, staticPlugin, result, error_1, dynamicPluginPath, dynamicPlugin, result, error_2, pluginUrl, remotePlugin, error_3, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    core_1.log.info('=== BActor插件多方式加载演示 ===');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 16, , 17]);
                    system = new core_1.ActorSystem();
                    return [4 /*yield*/, system.start()];
                case 2:
                    _a.sent();
                    core_1.log.info('Actor系统已启动');
                    config = {
                        debug: true,
                        timeout: 5000
                    };
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 6, , 7]);
                    core_1.log.info('\n=== 演示1: 静态加载插件 ===');
                    staticPluginPath = path_1.default.join(__dirname, '../plugins/static-plugin');
                    core_1.log.info("\u52A0\u8F7D\u9759\u6001\u63D2\u4EF6: ".concat(staticPluginPath));
                    staticPluginModule = require(staticPluginPath);
                    return [4 /*yield*/, (0, plugin_loader_1.loadStaticPlugin)(system, staticPluginModule, __assign(__assign({}, config), { mode: 'static' }))];
                case 4:
                    staticPlugin = _a.sent();
                    core_1.log.info("\u9759\u6001\u63D2\u4EF6\u5DF2\u52A0\u8F7D: ".concat(staticPlugin.metadata.id));
                    return [4 /*yield*/, staticPlugin.handleMessage('greeting.sayHello', { name: '静态加载用户' })];
                case 5:
                    result = _a.sent();
                    core_1.log.info("\u63D2\u4EF6\u54CD\u5E94: ".concat(result.message));
                    return [3 /*break*/, 7];
                case 6:
                    error_1 = _a.sent();
                    core_1.log.error('静态加载插件失败:', error_1);
                    return [3 /*break*/, 7];
                case 7:
                    _a.trys.push([7, 10, , 11]);
                    core_1.log.info('\n=== 演示2: 动态加载插件 ===');
                    dynamicPluginPath = path_1.default.join(__dirname, '../plugins/dynamic-plugin');
                    core_1.log.info("\u52A8\u6001\u52A0\u8F7D\u63D2\u4EF6: ".concat(dynamicPluginPath));
                    return [4 /*yield*/, (0, plugin_loader_1.loadDynamicPlugin)(system, dynamicPluginPath, __assign(__assign({}, config), { mode: 'dynamic' }))];
                case 8:
                    dynamicPlugin = _a.sent();
                    core_1.log.info("\u52A8\u6001\u63D2\u4EF6\u5DF2\u52A0\u8F7D: ".concat(dynamicPlugin.metadata.id));
                    return [4 /*yield*/, dynamicPlugin.handleMessage('weather.getReport', { city: '北京' })];
                case 9:
                    result = _a.sent();
                    core_1.log.info("\u63D2\u4EF6\u54CD\u5E94:", result);
                    return [3 /*break*/, 11];
                case 10:
                    error_2 = _a.sent();
                    core_1.log.error('动态加载插件失败:', error_2);
                    return [3 /*break*/, 11];
                case 11:
                    _a.trys.push([11, 13, , 14]);
                    core_1.log.info('\n=== 演示3: 从URL动态加载插件 ===');
                    core_1.log.info('注意：这是模拟演示，不会真正从URL下载插件');
                    pluginUrl = 'https://example.com/plugins/remote-plugin.zip';
                    core_1.log.info("\u4ECEURL\u52A0\u8F7D\u63D2\u4EF6: ".concat(pluginUrl));
                    return [4 /*yield*/, (0, plugin_loader_1.loadDynamicPlugin)(system, pluginUrl, __assign(__assign({}, config), { mode: 'remote' }))];
                case 12:
                    remotePlugin = _a.sent();
                    // 这部分代码在示例中不会执行，因为下载是模拟的
                    core_1.log.info("\u8FDC\u7A0B\u63D2\u4EF6\u5DF2\u52A0\u8F7D: ".concat(remotePlugin.metadata.id));
                    return [3 /*break*/, 14];
                case 13:
                    error_3 = _a.sent();
                    core_1.log.warn('从URL加载插件失败 (预期中的错误，因为这只是模拟):', error_3);
                    return [3 /*break*/, 14];
                case 14:
                    core_1.log.info('\n=== 演示完成 ===');
                    return [4 /*yield*/, system.stop()];
                case 15:
                    _a.sent();
                    return [3 /*break*/, 17];
                case 16:
                    error_4 = _a.sent();
                    core_1.log.error('演示失败:', error_4);
                    return [3 /*break*/, 17];
                case 17: return [2 /*return*/];
            }
        });
    });
}
/**
 * 启动演示
 */
if (require.main === module) {
    runDemo().catch(function (err) {
        console.error('演示执行错误:', err);
        process.exit(1);
    });
}
