import React, { useState } from 'react';
import Layout from '../components/layout/Layout';
import { useTheme } from '../contexts/ThemeContext';

// 模拟告警规则数据
const mockAlertRules = [
    {
        id: 'rule-1',
        name: 'High CPU Usage',
        description: 'Alert when CPU usage exceeds 80% for 5 minutes',
        metricName: 'system_cpu_usage',
        condition: 'gt',
        threshold: 80,
        duration: 300, // 5 minutes in seconds
        severity: 'critical',
        enabled: true,
        notificationChannels: ['email-team', 'slack-alerts'],
        labels: {
            environment: 'production',
            service: 'actor-system',
        },
    },
    {
        id: 'rule-2',
        name: 'High Memory Usage',
        description: 'Alert when memory usage exceeds 85% for 10 minutes',
        metricName: 'system_memory_usage',
        condition: 'gt',
        threshold: 85,
        duration: 600, // 10 minutes in seconds
        severity: 'warning',
        enabled: true,
        notificationChannels: ['email-team'],
        labels: {
            environment: 'production',
            service: 'actor-system',
        },
    },
    {
        id: 'rule-3',
        name: 'Low Disk Space',
        description: 'Alert when disk space falls below 20% for 15 minutes',
        metricName: 'system_disk_free',
        condition: 'lt',
        threshold: 20,
        duration: 900, // 15 minutes in seconds
        severity: 'error',
        enabled: true,
        notificationChannels: ['email-team', 'pagerduty-ops'],
        labels: {
            environment: 'production',
            service: 'storage',
        },
    },
    {
        id: 'rule-4',
        name: 'High Message Processing Time',
        description: 'Alert when message processing time exceeds 200ms for 5 minutes',
        metricName: 'actor_message_processing_time',
        condition: 'gt',
        threshold: 200,
        duration: 300, // 5 minutes in seconds
        severity: 'warning',
        enabled: false,
        notificationChannels: ['slack-alerts'],
        labels: {
            environment: 'production',
            service: 'message-processor',
        },
    },
    {
        id: 'rule-5',
        name: 'High Actor Restart Rate',
        description: 'Alert when actor restart rate exceeds 5 per minute for 3 minutes',
        metricName: 'actor_restart_rate',
        condition: 'gt',
        threshold: 5,
        duration: 180, // 3 minutes in seconds
        severity: 'error',
        enabled: true,
        notificationChannels: ['email-team', 'slack-alerts', 'pagerduty-ops'],
        labels: {
            environment: 'production',
            service: 'user-actor',
        },
    },
];

// 模拟通知渠道数据
const mockNotificationChannels = [
    {
        id: 'email-team',
        name: 'Team Email',
        type: 'email',
        config: {
            recipients: ['team@example.com', 'ops@example.com'],
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
];

// 告警规则表单类型
type AlertRuleForm = {
    id?: string;
    name: string;
    description: string;
    metricName: string;
    condition: string;
    threshold: number;
    duration: number;
    severity: string;
    enabled: boolean;
    notificationChannels: string[];
    labels: Record<string, string>;
};

// 初始表单状态
const initialFormState: AlertRuleForm = {
    name: '',
    description: '',
    metricName: '',
    condition: 'gt',
    threshold: 0,
    duration: 300,
    severity: 'warning',
    enabled: true,
    notificationChannels: [],
    labels: {},
};

const AlertRulesPage: React.FC = () => {
    const { theme } = useTheme();
    const [alertRules, setAlertRules] = useState(mockAlertRules);
    const [notificationChannels] = useState(mockNotificationChannels);
    const [showForm, setShowForm] = useState(false);
    const [editingRule, setEditingRule] = useState<AlertRuleForm | null>(null);
    const [formState, setFormState] = useState<AlertRuleForm>(initialFormState);
    const [searchQuery, setSearchQuery] = useState('');
    const [severityFilter, setSeverityFilter] = useState<string[]>([]);
    const [statusFilter, setStatusFilter] = useState<string[]>([]);

    // 更新表单字段
    const updateFormField = <K extends keyof AlertRuleForm>(field: K, value: AlertRuleForm[K]) => {
        setFormState(prev => ({ ...prev, [field]: value }));
    };

    // 格式化持续时间为人类可读格式
    const formatDuration = (seconds: number) => {
        if (seconds < 60) return `${seconds} seconds`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
        return `${Math.floor(seconds / 3600)} hours ${Math.floor((seconds % 3600) / 60)} minutes`;
    };

    // 转换条件为可读文本
    const conditionToText = (condition: string) => {
        switch (condition) {
            case 'gt': return 'is greater than';
            case 'lt': return 'is less than';
            case 'eq': return 'equals';
            case 'neq': return 'does not equal';
            case 'gte': return 'is greater than or equal to';
            case 'lte': return 'is less than or equal to';
            default: return condition;
        }
    };

    // 添加/编辑规则
    const handleSubmitRule = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingRule) {
            // 更新现有规则
            setAlertRules(rules =>
                rules.map(rule => (rule.id === editingRule.id ? { ...formState, id: rule.id } : rule))
            );
        } else {
            // 添加新规则
            const newRule = {
                ...formState,
                id: `rule-${Date.now()}`,
            };
            setAlertRules(rules => [...rules, newRule]);
        }

        // 重置表单状态
        setFormState(initialFormState);
        setEditingRule(null);
        setShowForm(false);
    };

    // 编辑规则
    const handleEditRule = (rule: typeof mockAlertRules[0]) => {
        setEditingRule(rule);
        setFormState(rule);
        setShowForm(true);
    };

    // 删除规则
    const handleDeleteRule = (ruleId: string) => {
        if (confirm('Are you sure you want to delete this alert rule?')) {
            setAlertRules(rules => rules.filter(rule => rule.id !== ruleId));
        }
    };

    // 切换规则启用状态
    const toggleRuleStatus = (ruleId: string) => {
        setAlertRules(rules =>
            rules.map(rule =>
                rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
            )
        );
    };

    // 过滤规则
    const filteredRules = alertRules.filter(rule => {
        // 搜索过滤
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const searchMatches =
                rule.name.toLowerCase().includes(query) ||
                rule.description.toLowerCase().includes(query) ||
                rule.metricName.toLowerCase().includes(query);
            if (!searchMatches) return false;
        }

        // 严重性过滤
        if (severityFilter.length > 0 && !severityFilter.includes(rule.severity)) {
            return false;
        }

        // 状态过滤
        if (statusFilter.length > 0) {
            if (rule.enabled && !statusFilter.includes('enabled')) return false;
            if (!rule.enabled && !statusFilter.includes('disabled')) return false;
        }

        return true;
    });

    // 添加标签字段
    const addLabelField = () => {
        setFormState(prev => {
            const newLabels = { ...prev.labels, '': '' };
            return { ...prev, labels: newLabels };
        });
    };

    // 更新标签字段
    const updateLabelField = (oldKey: string, newKey: string, value: string) => {
        setFormState(prev => {
            const newLabels = { ...prev.labels };
            delete newLabels[oldKey];
            newLabels[newKey] = value;
            return { ...prev, labels: newLabels };
        });
    };

    // 删除标签字段
    const removeLabelField = (key: string) => {
        setFormState(prev => {
            const newLabels = { ...prev.labels };
            delete newLabels[key];
            return { ...prev, labels: newLabels };
        });
    };

    return (
        <Layout title="Alert Rules - Bagctor Monitoring Dashboard">
            <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alert Rules</h1>
                    <div className="flex items-center space-x-2">
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                setEditingRule(null);
                                setFormState(initialFormState);
                                setShowForm(true);
                            }}
                        >
                            + New Alert Rule
                        </button>
                    </div>
                </div>

                {/* 过滤控件 */}
                <div className="modern-card p-4 mb-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex-1 min-w-[240px]">
                            <label htmlFor="search" className="sr-only">
                                Search alert rules
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg
                                        className="h-5 w-5 text-gray-400"
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
                                <input
                                    type="text"
                                    id="search"
                                    className="block w-full pl-10 pr-3 py-2 border border-input rounded-md text-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary"
                                    placeholder="Search alert rules"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-4">
                            <div>
                                <label className="text-sm text-gray-600 dark:text-gray-300">Severity</label>
                                <div className="flex items-center space-x-2 mt-1">
                                    {['critical', 'error', 'warning', 'info'].map(severity => (
                                        <button
                                            key={severity}
                                            className={`px-3 py-1 text-xs rounded-full ${severityFilter.includes(severity)
                                                ? getSeverityBadgeClasses(severity, true)
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                                                }`}
                                            onClick={() => {
                                                setSeverityFilter(prev =>
                                                    prev.includes(severity)
                                                        ? prev.filter(s => s !== severity)
                                                        : [...prev, severity]
                                                );
                                            }}
                                        >
                                            {severity.charAt(0).toUpperCase() + severity.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-gray-600 dark:text-gray-300">Status</label>
                                <div className="flex items-center space-x-2 mt-1">
                                    {[
                                        { id: 'enabled', label: 'Enabled' },
                                        { id: 'disabled', label: 'Disabled' },
                                    ].map(status => (
                                        <button
                                            key={status.id}
                                            className={`px-3 py-1 text-xs rounded-full ${statusFilter.includes(status.id)
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                                                }`}
                                            onClick={() => {
                                                setStatusFilter(prev =>
                                                    prev.includes(status.id)
                                                        ? prev.filter(s => s !== status.id)
                                                        : [...prev, status.id]
                                                );
                                            }}
                                        >
                                            {status.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 告警规则列表 */}
                <div className="modern-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-border">
                            <thead className="bg-muted">
                                <tr>
                                    <th
                                        scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                    >
                                        Rule
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                    >
                                        Condition
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                    >
                                        Severity
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                    >
                                        Status
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                    >
                                        Notifications
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider"
                                    >
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredRules.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-4 text-center text-muted-foreground">
                                            No alert rules found. Create one to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRules.map(rule => (
                                        <tr key={rule.id} className="hover:bg-muted/50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium">{rule.name}</span>
                                                    <span className="text-xs text-muted-foreground">{rule.description}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="text-sm">{rule.metricName}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {conditionToText(rule.condition)} {rule.threshold} for{' '}
                                                        {formatDuration(rule.duration)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`badge ${getSeverityBadgeClass(rule.severity)}`}>
                                                    {rule.severity.charAt(0).toUpperCase() + rule.severity.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <span
                                                        className={`flex h-2.5 w-2.5 rounded-full mr-2 ${rule.enabled ? 'bg-success' : 'bg-gray-400'
                                                            }`}
                                                    ></span>
                                                    <span className="text-sm">
                                                        {rule.enabled ? 'Enabled' : 'Disabled'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-wrap gap-1">
                                                    {rule.notificationChannels.map(channelId => {
                                                        const channel = notificationChannels.find(c => c.id === channelId);
                                                        return (
                                                            <span
                                                                key={channelId}
                                                                className="inline-block bg-muted px-2 py-1 text-xs rounded-md"
                                                                title={channel?.name || channelId}
                                                            >
                                                                {getChannelIcon(channel?.type || 'unknown')}
                                                                <span className="ml-1">{channel?.name || channelId}</span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    className="text-primary hover:text-primary/80 mr-3"
                                                    onClick={() => toggleRuleStatus(rule.id)}
                                                >
                                                    {rule.enabled ? 'Disable' : 'Enable'}
                                                </button>
                                                <button
                                                    className="text-primary hover:text-primary/80 mr-3"
                                                    onClick={() => handleEditRule(rule)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className="text-danger hover:text-danger/80"
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 告警规则表单（模态框） */}
                {showForm && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="modern-card w-full max-w-2xl mx-auto max-h-[90vh] overflow-y-auto">
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h2 className="text-xl font-bold">
                                        {editingRule ? 'Edit Alert Rule' : 'New Alert Rule'}
                                    </h2>
                                    <button
                                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                        onClick={() => setShowForm(false)}
                                    >
                                        <svg
                                            className="h-6 w-6"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>
                                </div>

                                <form onSubmit={handleSubmitRule}>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Rule Name</label>
                                            <input
                                                type="text"
                                                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                                                placeholder="High CPU Usage"
                                                value={formState.name}
                                                onChange={e => updateFormField('name', e.target.value)}
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1">Description</label>
                                            <textarea
                                                className="w-full rounded-md border border-input px-3 py-2 text-sm"
                                                placeholder="Alert when CPU usage exceeds threshold"
                                                value={formState.description}
                                                onChange={e => updateFormField('description', e.target.value)}
                                                rows={2}
                                            ></textarea>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-1">Metric Name</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-md border border-input px-3 py-2 text-sm"
                                                    placeholder="system_cpu_usage"
                                                    value={formState.metricName}
                                                    onChange={e => updateFormField('metricName', e.target.value)}
                                                    required
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium mb-1">Condition</label>
                                                <select
                                                    className="w-full rounded-md border border-input px-3 py-2 text-sm"
                                                    value={formState.condition}
                                                    onChange={e => updateFormField('condition', e.target.value)}
                                                    required
                                                >
                                                    <option value="gt">Greater than</option>
                                                    <option value="lt">Less than</option>
                                                    <option value="eq">Equals</option>
                                                    <option value="neq">Not equals</option>
                                                    <option value="gte">Greater than or equal</option>
                                                    <option value="lte">Less than or equal</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium mb-1">Threshold</label>
                                                <input
                                                    type="number"
                                                    className="w-full rounded-md border border-input px-3 py-2 text-sm"
                                                    placeholder="80"
                                                    value={formState.threshold}
                                                    onChange={e =>
                                                        updateFormField('threshold', parseFloat(e.target.value) || 0)
                                                    }
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-1">
                                                    Duration (seconds)
                                                </label>
                                                <input
                                                    type="number"
                                                    className="w-full rounded-md border border-input px-3 py-2 text-sm"
                                                    placeholder="300"
                                                    value={formState.duration}
                                                    onChange={e =>
                                                        updateFormField('duration', parseInt(e.target.value, 10) || 0)
                                                    }
                                                    required
                                                />
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {formatDuration(formState.duration)}
                                                </p>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium mb-1">Severity</label>
                                                <select
                                                    className="w-full rounded-md border border-input px-3 py-2 text-sm"
                                                    value={formState.severity}
                                                    onChange={e => updateFormField('severity', e.target.value)}
                                                    required
                                                >
                                                    <option value="critical">Critical</option>
                                                    <option value="error">Error</option>
                                                    <option value="warning">Warning</option>
                                                    <option value="info">Info</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium mb-1">Status</label>
                                                <div className="mt-2">
                                                    <label className="inline-flex items-center">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-gray-300 text-primary focus:ring-primary"
                                                            checked={formState.enabled}
                                                            onChange={e => updateFormField('enabled', e.target.checked)}
                                                        />
                                                        <span className="ml-2 text-sm">Enabled</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1">
                                                Notification Channels
                                            </label>
                                            <div className="border border-input rounded-md p-2">
                                                {notificationChannels.map(channel => (
                                                    <label key={channel.id} className="inline-flex items-center mr-4 mb-2">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-gray-300 text-primary focus:ring-primary"
                                                            checked={formState.notificationChannels.includes(channel.id)}
                                                            onChange={e => {
                                                                const isChecked = e.target.checked;
                                                                updateFormField(
                                                                    'notificationChannels',
                                                                    isChecked
                                                                        ? [...formState.notificationChannels, channel.id]
                                                                        : formState.notificationChannels.filter(
                                                                            id => id !== channel.id
                                                                        )
                                                                );
                                                            }}
                                                        />
                                                        <span className="ml-2 text-sm flex items-center">
                                                            {getChannelIcon(channel.type)}
                                                            <span className="ml-1">{channel.name}</span>
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="block text-sm font-medium">Labels</label>
                                                <button
                                                    type="button"
                                                    className="text-xs text-primary"
                                                    onClick={addLabelField}
                                                >
                                                    + Add Label
                                                </button>
                                            </div>
                                            <div className="border border-input rounded-md p-2">
                                                {Object.keys(formState.labels).length === 0 ? (
                                                    <div className="text-sm text-muted-foreground p-2">
                                                        No labels added. Labels help categorize and filter alerts.
                                                    </div>
                                                ) : (
                                                    Object.entries(formState.labels).map(([key, value], index) => (
                                                        <div key={index} className="flex items-center space-x-2 mb-2">
                                                            <input
                                                                type="text"
                                                                className="flex-1 rounded-md border border-input px-3 py-1 text-sm"
                                                                placeholder="Key"
                                                                value={key}
                                                                onChange={e =>
                                                                    updateLabelField(key, e.target.value, value)
                                                                }
                                                            />
                                                            <input
                                                                type="text"
                                                                className="flex-1 rounded-md border border-input px-3 py-1 text-sm"
                                                                placeholder="Value"
                                                                value={value}
                                                                onChange={e =>
                                                                    updateLabelField(key, key, e.target.value)
                                                                }
                                                            />
                                                            <button
                                                                type="button"
                                                                className="text-danger hover:text-danger/80"
                                                                onClick={() => removeLabelField(key)}
                                                            >
                                                                <svg
                                                                    className="h-5 w-5"
                                                                    fill="none"
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth={2}
                                                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                                    />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex justify-end mt-4 space-x-2">
                                            <button
                                                type="button"
                                                className="btn btn-outline"
                                                onClick={() => setShowForm(false)}
                                            >
                                                Cancel
                                            </button>
                                            <button type="submit" className="btn btn-primary">
                                                {editingRule ? 'Update Rule' : 'Create Rule'}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* 通知渠道管理按钮 */}
                <div className="flex justify-end mt-4">
                    <button
                        className="btn btn-outline"
                        onClick={() => {
                            // 这里将跳转到通知渠道管理页面
                            alert('Notification Channels management would open here');
                        }}
                    >
                        Manage Notification Channels
                    </button>
                </div>
            </div>
        </Layout>
    );
};

// 获取通知渠道图标
const getChannelIcon = (type: string) => {
    switch (type) {
        case 'email':
            return (
                <svg
                    className="h-4 w-4 inline-block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                </svg>
            );
        case 'slack':
            return (
                <svg
                    className="h-4 w-4 inline-block"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path d="M6 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8-6a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-2a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 19a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm2 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0zm-8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm-2 0a1 1 0 1 0-2 0 1 1 0 0 0 2 0z" />
                </svg>
            );
        case 'pagerduty':
            return (
                <svg
                    className="h-4 w-4 inline-block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                </svg>
            );
        case 'webhook':
            return (
                <svg
                    className="h-4 w-4 inline-block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                </svg>
            );
        default:
            return (
                <svg
                    className="h-4 w-4 inline-block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            );
    }
};

// 获取严重性徽章类
const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
        case 'critical':
            return 'badge-danger';
        case 'error':
            return 'badge-danger';
        case 'warning':
            return 'badge-warning';
        case 'info':
            return 'badge-primary';
        default:
            return 'badge-secondary';
    }
};

// 获取严重性徽章样式（带选中状态）
const getSeverityBadgeClasses = (severity: string, isSelected: boolean) => {
    if (!isSelected) {
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }

    switch (severity) {
        case 'critical':
            return 'bg-danger text-danger-foreground';
        case 'error':
            return 'bg-danger text-danger-foreground';
        case 'warning':
            return 'bg-warning text-warning-foreground';
        case 'info':
            return 'bg-primary text-primary-foreground';
        default:
            return 'bg-secondary text-secondary-foreground';
    }
};

export default AlertRulesPage; 