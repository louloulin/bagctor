import React, { ReactNode } from 'react';
import Head from 'next/head';
import Sidebar from './Sidebar';
import Header from './Header';

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
    return (
        <>
            <Head>
                <title>{title}</title>
                <meta name="description" content={description} />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <div className="min-h-screen bg-gray-50">
                <Sidebar />
                <div className="pl-64">
                    <Header />
                    <main className="py-6 px-4 sm:px-6 lg:px-8">
                        <div className="max-w-7xl mx-auto">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
};

export default Layout; 