"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPluginActor = exports.createPluginActorFromFactory = exports.createPluginActorFromClass = exports.createPluginContext = exports.PluginBase = void 0;
// 导出核心插件接口
var plugin_base_1 = require("./core/plugin_base");
Object.defineProperty(exports, "PluginBase", { enumerable: true, get: function () { return plugin_base_1.PluginBase; } });
Object.defineProperty(exports, "createPluginContext", { enumerable: true, get: function () { return plugin_base_1.createPluginContext; } });
// 导出适配器
var plugin_adapter_1 = require("./adapters/plugin_adapter");
Object.defineProperty(exports, "createPluginActorFromClass", { enumerable: true, get: function () { return plugin_adapter_1.createPluginActorFromClass; } });
Object.defineProperty(exports, "createPluginActorFromFactory", { enumerable: true, get: function () { return plugin_adapter_1.createPluginActorFromFactory; } });
// 导出类型定义
__exportStar(require("./types"), exports);
// 为向后兼容性导出
var plugin_base_2 = require("./core/plugin_base");
Object.defineProperty(exports, "createPluginActor", { enumerable: true, get: function () { return plugin_base_2.createPluginActor; } });
