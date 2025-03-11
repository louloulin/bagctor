"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.GreetingPlugin = void 0;
exports.createPlugin = createPlugin;
var core_1 = require("@bactor/core");
var plugin_1 = require("@bactor/plugin");
var GreetingPlugin = /** @class */ (function (_super) {
    __extends(GreetingPlugin, _super);
    function GreetingPlugin(config) {
        if (config === void 0) { config = {}; }
        var _this = _super.call(this, config) || this;
        _this.config = config;
        // 定义插件元数据
        _this.metadata = {
            id: 'greeting-plugin',
            name: 'Greeting Service Plugin',
            version: '1.0.0',
            description: 'A simple greeting service plugin',
            author: 'BActor Team',
            capabilities: ['greeting.sayHello', 'greeting.sayGoodbye']
        };
        // 可用的问候语
        _this.greetings = [
            '你好',
            '您好',
            '早上好',
            '下午好',
            '晚上好',
            '嗨'
        ];
        return _this;
    }
    // 初始化时的额外操作
    GreetingPlugin.prototype.onInitialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                core_1.log.info('问候插件已初始化', {
                    config: this.config
                });
                if (this.config.customGreeting) {
                    this.greetings.push(this.config.customGreeting);
                }
                return [2 /*return*/];
            });
        });
    };
    // 自动映射到greeting.sayHello能力
    GreetingPlugin.prototype.handleSayHello = function (payload) {
        return __awaiter(this, void 0, void 0, function () {
            var name, greeting, message;
            return __generator(this, function (_a) {
                core_1.log.info('处理sayHello请求', payload);
                name = payload.name;
                greeting = this.getRandomGreeting();
                message = "".concat(greeting, "\uFF0C").concat(name, "\uFF01\u6B22\u8FCE\u4F7F\u7528BActor\u3002");
                if (this.config.debug) {
                    core_1.log.debug('生成的问候语', { greeting: greeting, message: message });
                }
                return [2 /*return*/, { message: message }];
            });
        });
    };
    // 自动映射到greeting.sayGoodbye能力
    GreetingPlugin.prototype.handleSayGoodbye = function (payload) {
        return __awaiter(this, void 0, void 0, function () {
            var name, message;
            return __generator(this, function (_a) {
                core_1.log.info('处理sayGoodbye请求', payload);
                name = payload.name;
                message = "\u518D\u89C1\uFF0C".concat(name, "\uFF01\u671F\u5F85\u4E0B\u6B21\u518D\u89C1\u3002");
                return [2 /*return*/, { message: message }];
            });
        });
    };
    // 获取随机问候语
    GreetingPlugin.prototype.getRandomGreeting = function () {
        var index = Math.floor(Math.random() * this.greetings.length);
        return this.greetings[index];
    };
    // 清理资源
    GreetingPlugin.prototype.onCleanup = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                core_1.log.info('问候插件正在清理资源');
                return [2 /*return*/];
            });
        });
    };
    return GreetingPlugin;
}(plugin_1.PluginBase));
exports.GreetingPlugin = GreetingPlugin;
// 导出插件实例工厂函数
function createPlugin(config) {
    return new GreetingPlugin(config);
}
// 默认导出插件类，用于静态加载
exports.default = GreetingPlugin;
