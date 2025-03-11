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
exports.WeatherPlugin = void 0;
exports.createPlugin = createPlugin;
var core_1 = require("@bactor/core");
var plugin_1 = require("@bactor/plugin");
var WeatherPlugin = /** @class */ (function (_super) {
    __extends(WeatherPlugin, _super);
    function WeatherPlugin(config) {
        if (config === void 0) { config = {}; }
        var _this = _super.call(this, config) || this;
        _this.config = config;
        // 定义插件元数据
        _this.metadata = {
            id: 'weather-plugin',
            name: 'Weather Service Plugin',
            version: '1.0.0',
            description: 'A simple weather service plugin',
            author: 'BActor Team',
            capabilities: ['weather.getReport', 'weather.getForecast']
        };
        // 缓存的天气数据
        _this.weatherCache = new Map();
        _this.defaultCity = '北京';
        return _this;
    }
    // 初始化时的额外操作
    WeatherPlugin.prototype.onInitialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                core_1.log.info('天气插件已初始化', {
                    config: this.config
                });
                if (this.config.defaultCity) {
                    this.defaultCity = this.config.defaultCity;
                }
                // 预加载一些天气数据
                this.weatherCache.set('北京', this.generateWeatherData('北京'));
                this.weatherCache.set('上海', this.generateWeatherData('上海'));
                this.weatherCache.set('广州', this.generateWeatherData('广州'));
                return [2 /*return*/];
            });
        });
    };
    // 自动映射到weather.getReport能力
    WeatherPlugin.prototype.handleGetReport = function (payload) {
        return __awaiter(this, void 0, void 0, function () {
            var city, report;
            return __generator(this, function (_a) {
                city = payload.city || this.defaultCity;
                core_1.log.info("\u5904\u7406\u5929\u6C14\u67E5\u8BE2\u8BF7\u6C42\uFF0C\u57CE\u5E02: ".concat(city));
                // 如果没有缓存的数据，生成新数据
                if (!this.weatherCache.has(city)) {
                    this.weatherCache.set(city, this.generateWeatherData(city));
                }
                report = this.weatherCache.get(city);
                if (this.config.debug) {
                    core_1.log.debug('天气数据:', report);
                }
                return [2 /*return*/, report];
            });
        });
    };
    // 自动映射到weather.getForecast能力
    WeatherPlugin.prototype.handleGetForecast = function (payload) {
        return __awaiter(this, void 0, void 0, function () {
            var city, days, forecast;
            return __generator(this, function (_a) {
                city = payload.city || this.defaultCity;
                days = payload.days || 3;
                core_1.log.info("\u5904\u7406\u5929\u6C14\u9884\u62A5\u8BF7\u6C42\uFF0C\u57CE\u5E02: ".concat(city, "\uFF0C\u5929\u6570: ").concat(days));
                if (days <= 1) {
                    forecast = "".concat(city, "\u4ECA\u5929\u5929\u6C14\u6674\u6717\uFF0C\u9002\u5408\u6237\u5916\u6D3B\u52A8\u3002");
                }
                else if (days <= 3) {
                    forecast = "".concat(city, "\u672A\u6765").concat(days, "\u5929\u5929\u6C14\u53D8\u5316\u4E0D\u5927\uFF0C\u4EE5\u6674\u4E3A\u4E3B\uFF0C\u5076\u6709\u9635\u96E8\u3002");
                }
                else {
                    forecast = "".concat(city, "\u672A\u6765").concat(days, "\u5929\u5929\u6C14\u9884\u62A5\uFF1A\u524D\u671F\u591A\u4E91\uFF0C\u540E\u671F\u8F6C\u6674\uFF0C\u6C14\u6E2918-26\u5EA6\uFF0C\u9002\u5B9C\u6237\u5916\u6D3B\u52A8\u3002");
                }
                return [2 /*return*/, { forecast: forecast }];
            });
        });
    };
    // 生成模拟天气数据
    WeatherPlugin.prototype.generateWeatherData = function (city) {
        // 生成随机天气数据用于演示
        var conditions = ['晴朗', '多云', '阴天', '小雨', '大雨', '雷阵雨', '雾'];
        var condition = conditions[Math.floor(Math.random() * conditions.length)];
        var temp = Math.floor(15 + Math.random() * 15); // 15-30度
        var humidity = Math.floor(30 + Math.random() * 50); // 30-80%
        var windSpeed = Math.floor(1 + Math.random() * 10); // 1-10 km/h
        return {
            city: city,
            temperature: temp,
            condition: condition,
            humidity: humidity,
            windSpeed: windSpeed,
            forecast: "".concat(city, "\u672A\u67653\u5929\u5929\u6C14\uFF1A").concat(condition, "\u8F6C\u591A\u4E91\uFF0C\u6C14\u6E29").concat(temp - 2, "-").concat(temp + 2, "\u2103"),
            timestamp: new Date().toISOString()
        };
    };
    // 清理资源
    WeatherPlugin.prototype.onCleanup = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                core_1.log.info('天气插件正在清理资源');
                this.weatherCache.clear();
                return [2 /*return*/];
            });
        });
    };
    return WeatherPlugin;
}(plugin_1.PluginBase));
exports.WeatherPlugin = WeatherPlugin;
// 导出插件实例工厂函数
function createPlugin(config) {
    return new WeatherPlugin(config);
}
// 默认导出插件类，适用于静态加载
exports.default = WeatherPlugin;
