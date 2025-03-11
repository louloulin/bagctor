import { log } from '@bactor/core';
import { BagctorPlugin, PluginBase, PluginContext, PluginMetadata } from '../../../../../src';

/**
 * 动态加载插件示例 - 天气服务
 * 
 * 此插件演示如何通过文件系统或URL动态加载
 */
export interface WeatherPluginConfig {
    debug?: boolean;
    timeout?: number;
    mode?: string;
    defaultCity?: string;
}

interface WeatherReport {
    city: string;
    temperature: number;
    condition: string;
    humidity: number;
    windSpeed: number;
    forecast: string;
    timestamp: string;
}

export class WeatherPlugin extends PluginBase<WeatherPluginConfig> {
    // 定义插件元数据
    metadata: PluginMetadata = {
        id: 'weather-plugin',
        name: 'Weather Service Plugin',
        version: '1.0.0',
        description: 'A simple weather service plugin',
        author: 'BActor Team',
        capabilities: ['weather.getReport', 'weather.getForecast']
    };

    // 缓存的天气数据
    private weatherCache: Map<string, WeatherReport> = new Map();
    private defaultCity: string = '北京';

    // 初始化时的额外操作
    protected async onInitialize(): Promise<void> {
        log.info('天气插件已初始化', {
            config: this.config
        });

        if (this.config.defaultCity) {
            this.defaultCity = this.config.defaultCity;
        }

        // 预加载一些天气数据
        this.weatherCache.set('北京', this.generateWeatherData('北京'));
        this.weatherCache.set('上海', this.generateWeatherData('上海'));
        this.weatherCache.set('广州', this.generateWeatherData('广州'));
    }

    // 自动映射到weather.getReport能力
    async handleGetReport(payload: { city?: string }): Promise<WeatherReport> {
        const city = payload.city || this.defaultCity;
        log.info(`处理天气查询请求，城市: ${city}`);

        // 如果没有缓存的数据，生成新数据
        if (!this.weatherCache.has(city)) {
            this.weatherCache.set(city, this.generateWeatherData(city));
        }

        // 获取天气报告
        const report = this.weatherCache.get(city)!;

        if (this.config.debug) {
            log.debug('天气数据:', report);
        }

        return report;
    }

    // 自动映射到weather.getForecast能力
    async handleGetForecast(payload: { city?: string, days?: number }): Promise<{ forecast: string }> {
        const city = payload.city || this.defaultCity;
        const days = payload.days || 3;

        log.info(`处理天气预报请求，城市: ${city}，天数: ${days}`);

        let forecast: string;

        if (days <= 1) {
            forecast = `${city}今天天气晴朗，适合户外活动。`;
        } else if (days <= 3) {
            forecast = `${city}未来${days}天天气变化不大，以晴为主，偶有阵雨。`;
        } else {
            forecast = `${city}未来${days}天天气预报：前期多云，后期转晴，气温18-26度，适宜户外活动。`;
        }

        return { forecast };
    }

    // 生成模拟天气数据
    private generateWeatherData(city: string): WeatherReport {
        // 生成随机天气数据用于演示
        const conditions = ['晴朗', '多云', '阴天', '小雨', '大雨', '雷阵雨', '雾'];
        const condition = conditions[Math.floor(Math.random() * conditions.length)];

        const temp = Math.floor(15 + Math.random() * 15); // 15-30度
        const humidity = Math.floor(30 + Math.random() * 50); // 30-80%
        const windSpeed = Math.floor(1 + Math.random() * 10); // 1-10 km/h

        return {
            city,
            temperature: temp,
            condition,
            humidity,
            windSpeed,
            forecast: `${city}未来3天天气：${condition}转多云，气温${temp - 2}-${temp + 2}℃`,
            timestamp: new Date().toISOString()
        };
    }

    // 清理资源
    protected async onCleanup(): Promise<void> {
        log.info('天气插件正在清理资源');
        this.weatherCache.clear();
    }
}

// 导出插件实例工厂函数
export function createPlugin(config?: WeatherPluginConfig): BagctorPlugin<WeatherPluginConfig> {
    return new WeatherPlugin();
}

// 默认导出插件类，适用于静态加载
export default WeatherPlugin; 