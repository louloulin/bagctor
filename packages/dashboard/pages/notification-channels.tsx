import React, { useState } from 'react';
import Layout from '../components/layout/Layout';
import NotificationChannelForm, { NotificationChannel, NotificationChannelType } from '../components/notification/NotificationChannelForm';

// 模拟通知渠道数据
const mockNotificationChannels: NotificationChannel[] = [
    {
        id: 'email-team',
        name: 'Team Email',
        type: 'email',
        config: {
            recipients: 'team@example.com, ops@example.com',
            subjectPrefix: '[ALERT]'
        },
        enabled: true,
    },
    {
        id: 'slack-alerts',
        name: 'Slack Alerts',
        type: 'slack',
        config: {
            webhook: 'https://hooks.slack.com/services/TXXXXXXXX/BXXXXXXXX/XXXXXXXXXXXXXXXXXXXXXXXX',
            channel: '#alerts',
            username: 'Bagctor Monitoring'
        },
        enabled: true,
    },
    {
        id: 'pagerduty-ops',
        name: 'PagerDuty Ops',
        type: 'pagerduty',
        config: {
            serviceKey: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            severity: 'critical',
        },
        enabled: true,
    },
    {
        id: 'webhook-custom',
        name: 'Custom Webhook',
        type: 'webhook',
        config: {
            url: 'https://api.example.com/webhook',
            method: 'POST',
            headers: '{"Content-Type": "application/json", "Authorization": "Bearer token123"}'
        },
        enabled: false,
    }
];

// 渠道类型图标组件
const ChannelTypeIcon: React.FC<{ type: NotificationChannelType }> = ({ type }) => {
    switch (type) {
        case 'email':
            return (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            );
        case 'slack':
            return (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8-6a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 19a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm2 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm-8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm-2 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0z" />
                </svg>
            );
        case 'pagerduty':
            return (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            );
        case 'webhook':
            return (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            );
        case 'teams':
            return (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22 8.5c0 1.43-.8 2.67-1.93 3.32.43.82.68 1.75.68 2.75 0 3.31-2.69 6-6 6a5.996 5.996 0 0 1-5.35-3.3c-.64.2-1.31.3-2.02.3-3.58 0-6.5-2.92-6.5-6.5S3.8 5 7.38 5c.08 0 .15.01.22.01A6.991 6.991 0 0 1 14.38 1c3.86 0 7 3.14 7 7 0 .14-.01.28-.02.42.4.33.64.66.64 1.08Z" />
                </svg>
            );
        case 'telegram':
            return (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.517c-.16.65-3.668 15.548-3.668 15.548s-.152.744-.703.385c-.423-.28-1.859-1.382-2.098-1.539-.216-.143-1.714-1.103-1.714-1.103-.694-.508-.471-.766.055-1.204.166-.105 1.714-1.58 3.075-2.904 0 0 .308-.31.021-.58-.265-.245-1.408-.243-2.01-.175a22.14 22.14 0 0 1-1.852.184s-1.396.011-1.523-.535c-.063-.27.303-.422.74-.601 2.583-1.023 5.297-2.107 5.297-2.107s1.885-.764 1.766.5c-.037.39-.147.578-.147.578s-4.64 1.573-5.087 1.738c0 0-.118.057-.118.13-.005.073.114.13.114.13l3.767 1.19s.486.089.66-.157c1.938-2.786 2.638-3.806 2.638-3.806s.65-.844 1.204-.255c.31.331.097 1.136.097 1.136s-.055.7-.216 1.35z" />
                </svg>
            );
        default:
            return (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
    }
};

const NotificationChannelsPage: React.FC = () => {
    const [channels, setChannels] = useState<NotificationChannel[]>(mockNotificationChannels);
    const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // 过滤渠道
    const filteredChannels = channels.filter(channel => {
        if (!searchQuery) return true;

        const query = searchQuery.toLowerCase();
        return (
            channel.name.toLowerCase().includes(query) ||
            channel.type.toLowerCase().includes(query)
        );
    });

    // 添加或更新渠道
    const handleSaveChannel = (channel: NotificationChannel) => {
        if (channels.some(c => c.id === channel.id)) {
            // 更新现有渠道
            setChannels(prev => prev.map(c => c.id === channel.id ? channel : c));
        } else {
            // 添加新渠道
            setChannels(prev => [...prev, channel]);
        }
        setIsFormOpen(false);
        setEditingChannel(null);
    };

    // 删除渠道
    const handleDeleteChannel = (id: string) => {
        if (confirm('Are you sure you want to delete this notification channel?')) {
            setChannels(prev => prev.filter(c => c.id !== id));
        }
    };

    // 编辑渠道
    const handleEditChannel = (channel: NotificationChannel) => {
        setEditingChannel(channel);
        setIsFormOpen(true);
    };

    // 渠道类型显示名称
    const getChannelTypeName = (type: NotificationChannelType): string => {
        switch (type) {
            case 'email': return 'Email';
            case 'slack': return 'Slack';
            case 'pagerduty': return 'PagerDuty';
            case 'webhook': return 'Webhook';
            case 'teams': return 'Microsoft Teams';
            case 'telegram': return 'Telegram';
            default: return type;
        }
    };

    return (
        <Layout title="Notification Channels - Bagctor Monitoring">
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3 sm:mb-0">
                    Notification Channels
                </h1>
                <button
                    className="btn btn-primary"
                    onClick={() => {
                        setEditingChannel(null);
                        setIsFormOpen(true);
                    }}
                >
                    Add Channel
                </button>
            </div>

            {isFormOpen ? (
                <div className="card">
                    <NotificationChannelForm
                        channel={editingChannel || undefined}
                        onSave={handleSaveChannel}
                        onCancel={() => {
                            setIsFormOpen(false);
                            setEditingChannel(null);
                        }}
                    />
                </div>
            ) : (
                <>
                    <div className="card mb-6 p-4">
                        <div className="relative">
                            <input
                                type="text"
                                className="border border-gray-300 rounded-md w-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                placeholder="Search channels by name or type..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <div className="absolute left-3 top-2.5 text-gray-400">
                                <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {filteredChannels.length === 0 ? (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden p-6 text-center">
                            <svg
                                className="h-12 w-12 text-gray-400 mx-auto mb-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                                No notification channels found
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-4">
                                {searchQuery
                                    ? 'No channels match your search criteria.'
                                    : 'Create your first notification channel to receive alerts.'}
                            </p>
                            {searchQuery && (
                                <button
                                    className="btn btn-outline"
                                    onClick={() => setSearchQuery('')}
                                >
                                    Clear Search
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Channel
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Type
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Configuration
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredChannels.map((channel) => (
                                        <tr key={channel.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                                    {channel.name}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <span className="text-gray-500 dark:text-gray-400 mr-2">
                                                        <ChannelTypeIcon type={channel.type} />
                                                    </span>
                                                    <span>
                                                        {getChannelTypeName(channel.type)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div>
                                                    {channel.type === 'email' && (
                                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                                                            {channel.config.recipients}
                                                        </div>
                                                    )}
                                                    {channel.type === 'slack' && (
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            {channel.config.channel}
                                                        </div>
                                                    )}
                                                    {channel.type === 'pagerduty' && (
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            Service Key: •••••••••••••{channel.config.serviceKey?.slice(-4)}
                                                        </div>
                                                    )}
                                                    {channel.type === 'webhook' && (
                                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                                                            {channel.config.url}
                                                        </div>
                                                    )}
                                                    {channel.type === 'teams' && (
                                                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                                                            Webhook Configured
                                                        </div>
                                                    )}
                                                    {channel.type === 'telegram' && (
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            Chat ID: {channel.config.chatId}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span
                                                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${channel.enabled
                                                            ? 'bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-400'
                                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                                                        }`}
                                                >
                                                    {channel.enabled ? 'Enabled' : 'Disabled'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    className="text-primary hover:text-primary-dark mr-3"
                                                    onClick={() => handleEditChannel(channel)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="text-destructive hover:text-destructive-dark"
                                                    onClick={() => handleDeleteChannel(channel.id)}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </Layout>
    );
};

export default NotificationChannelsPage; 