import React from 'react';
import { AppProps } from 'next/app';
import { ThemeProvider } from '../contexts/ThemeContext';
import { WebSocketProvider } from '../components/WebSocketContext';
import '../styles/globals.css';

// 使用模拟WebSocket URL（开发环境）
// 在生产环境中，这将是实际的WebSocket服务器URL
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080';

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <ThemeProvider>
            <WebSocketProvider url={WS_URL} autoConnect={true}>
                <Component {...pageProps} />
            </WebSocketProvider>
        </ThemeProvider>
    );
}

export default MyApp; 