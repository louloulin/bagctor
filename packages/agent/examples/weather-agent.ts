import { Agent, Tool } from '../src';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';

interface WeatherResponse {
    current: {
        time: string;
        temperature_2m: number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        wind_speed_10m: number;
        wind_gusts_10m: number;
        weather_code: number;
    };
}

// 创建天气工具
const weatherTool = new Tool({
    name: 'get-weather',
    description: 'Get current weather for a location',
    inputSchema: z.object({
        location: z.string().describe('City name'),
    }),
    outputSchema: z.object({
        temperature: z.number(),
        feelsLike: z.number(),
        humidity: z.number(),
        windSpeed: z.number(),
        windGust: z.number(),
        conditions: z.string(),
        location: z.string(),
    }),
    execute: async ({ location }) => {
        return await getWeather(location);
    },
});

const getWeather = async (location: string) => {
    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
    const geocodingResponse = await fetch(geocodingUrl);
    const geocodingData = await geocodingResponse.json();

    if (!geocodingData.results?.[0]) {
        throw new Error(`Location '${location}' not found`);
    }

    const { latitude, longitude, name } = geocodingData.results[0];

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;

    const response = await fetch(weatherUrl);
    const data: WeatherResponse = await response.json();

    return {
        temperature: data.current.temperature_2m,
        feelsLike: data.current.apparent_temperature,
        humidity: data.current.relative_humidity_2m,
        windSpeed: data.current.wind_speed_10m,
        windGust: data.current.wind_gusts_10m,
        conditions: getWeatherCondition(data.current.weather_code),
        location: name,
    };
};

function getWeatherCondition(code: number): string {
    const conditions: Record<number, string> = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        56: 'Light freezing drizzle',
        57: 'Dense freezing drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        66: 'Light freezing rain',
        67: 'Heavy freezing rain',
        71: 'Slight snow fall',
        73: 'Moderate snow fall',
        75: 'Heavy snow fall',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail',
    };
    return conditions[code] || 'Unknown';
}

// 创建天气Agent
const weatherAgent = new Agent({
    name: 'Weather Agent',
    description: 'A helpful weather assistant that provides accurate weather information',
    systemPrompt: `You are a helpful weather assistant that provides accurate weather information.
Your primary function is to help users get weather details for specific locations. When responding:
- Always ask for a location if none is provided 
- If giving a location with multiple parts (e.g. "New York, NY"), use the most relevant part (e.g. "New York")
- Include relevant details like humidity, wind conditions, and precipitation
- Keep responses concise but informative`,
    model: 'gpt-4o-mini',
    tools: [weatherTool],
});

// 主函数
async function main() {
    try {
        // 使用Agent处理用户查询
        const response = await weatherAgent.run('What is the weather in London?');
        console.log('Agent response:', response);

        // 直接使用工具
        const weatherInfo = await weatherTool.execute({ location: 'Paris' });
        console.log('Direct tool use result:', weatherInfo);
    } catch (error) {
        console.error('Error:', error);
    }
}

main(); 