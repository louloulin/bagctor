import React, { ReactNode } from 'react';
import Head from 'next/head';
import Sidebar from './Sidebar';
import Header from './Header';
import { useTheme } from '../../contexts/ThemeContext';

interface LayoutProps {
    children: ReactNode;
    title?: string;
    description?: string;
}

const Layout: React.FC<LayoutProps> = ({
    children,
    title = 'Bagctor Monitoring Dashboard',
    description = 'Monitoring and observability dashboard for Bagctor actor system',
}) => {
    const { theme } = useTheme();

    return (
        <>
            <Head>
                <title>{title}</title>
                <meta name="description" content={description} />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.ico" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>
            <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
                <Sidebar />
                <div className="pl-64">
                    <Header />
                    <main className="py-6 px-4 sm:px-6 lg:px-8 custom-scrollbar">
                        <div className="max-w-7xl mx-auto space-y-6">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
};

export default Layout; 