import React from 'react';
import Link from 'next/link';
import { useTheme } from '../../contexts/ThemeContext';

const Header: React.FC = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="bg-card border-b border-border shadow-sm sticky top-0 z-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <div className="flex-shrink-0 flex items-center">
                            <span className="text-xl font-bold text-primary">Bagctor Monitor</span>
                        </div>
                        <nav className="ml-6 flex space-x-8">
                            <Link href="/" className="inline-flex items-center px-1 pt-1 border-b-2 border-primary text-sm font-medium text-card-foreground">
                                Dashboard
                            </Link>
                            <Link href="/metrics" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-muted-foreground hover:text-card-foreground hover:border-border">
                                Metrics
                            </Link>
                            <Link href="/alerts" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-muted-foreground hover:text-card-foreground hover:border-border">
                                Alerts
                            </Link>
                            <Link href="/workers" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-muted-foreground hover:text-card-foreground hover:border-border">
                                Workers
                            </Link>
                            <Link href="/cluster" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-muted-foreground hover:text-card-foreground hover:border-border">
                                Cluster
                            </Link>
                            <Link href="/tracing" className="inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium text-muted-foreground hover:text-card-foreground hover:border-border">
                                Tracing
                            </Link>
                        </nav>
                    </div>
                    <div className="flex items-center space-x-4">
                        {/* Dark mode toggle */}
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="btn-outline btn-sm rounded-full focus-ring"
                            aria-label="Toggle dark mode"
                        >
                            {theme === 'light' ? (
                                <svg
                                    className="h-5 w-5"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                                    />
                                </svg>
                            ) : (
                                <svg
                                    className="h-5 w-5"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                                    />
                                </svg>
                            )}
                        </button>

                        {/* Notifications button */}
                        <button
                            type="button"
                            className="relative btn-outline btn-sm rounded-full focus-ring"
                        >
                            <span className="sr-only">View notifications</span>
                            <svg
                                className="h-5 w-5"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                aria-hidden="true"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                />
                            </svg>
                            {/* Notification indicator */}
                            <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-destructive"></span>
                        </button>

                        {/* User profile */}
                        <div className="relative">
                            <div>
                                <button
                                    type="button"
                                    className="max-w-xs rounded-full focus-ring flex items-center text-sm"
                                >
                                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary">
                                        <span className="text-xs font-medium leading-none text-primary-foreground">AM</span>
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header; 