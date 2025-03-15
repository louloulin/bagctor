import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

export type NotificationChannelType = 'email' | 'slack' | 'pagerduty' | 'webhook' | 'teams' | 'telegram';

export interface NotificationChannel {
    id: string;
    name: string;
    type: NotificationChannelType;
    config: {
        [key: string]: any;
    };
    enabled: boolean;
}

interface NotificationChannelFormProps {
    channel?: NotificationChannel;
    onSave: (channel: NotificationChannel) => void;
    onCancel: () => void;
}

const NotificationChannelForm: React.FC<NotificationChannelFormProps> = ({
    channel,
    onSave,
    onCancel
}) => {
    const [formData, setFormData] = useState<NotificationChannel>({
        id: channel?.id || uuidv4(),
        name: channel?.name || '',
        type: channel?.type || 'email',
        config: channel?.config || {},
        enabled: channel?.enabled ?? true
    });

    const [errors, setErrors] = useState<Record<string, string>>({});

    // 更新配置字段时重置错误
    useEffect(() => {
        setErrors({});
    }, [formData.type]);

    // 处理输入变化
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        if (name.startsWith('config.')) {
            const configKey = name.split('.')[1];
            setFormData(prev => ({
                ...prev,
                config: {
                    ...prev.config,
                    [configKey]: value
                }
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    // 处理选择框变化
    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;

        if (name === 'type') {
            // 当通知类型改变时，重置配置
            setFormData(prev => ({
                ...prev,
                type: value as NotificationChannelType,
                config: {}
            }));
        } else {
            handleInputChange(e);
        }
    };

    // 处理启用/禁用切换
    const handleToggleEnabled = () => {
        setFormData(prev => ({
            ...prev,
            enabled: !prev.enabled
        }));
    };

    // 验证表单
    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};

        // 通用验证
        if (!formData.name.trim()) {
            newErrors.name = 'Name is required';
        }

        // 基于类型的特定验证
        switch (formData.type) {
            case 'email':
                if (!formData.config.recipients) {
                    newErrors['config.recipients'] = 'Recipients are required';
                }
                break;

            case 'slack':
                if (!formData.config.webhook) {
                    newErrors['config.webhook'] = 'Webhook URL is required';
                }
                break;

            case 'pagerduty':
                if (!formData.config.serviceKey) {
                    newErrors['config.serviceKey'] = 'Service Key is required';
                }
                break;

            case 'webhook':
                if (!formData.config.url) {
                    newErrors['config.url'] = 'Webhook URL is required';
                }
                break;

            case 'teams':
                if (!formData.config.webhook) {
                    newErrors['config.webhook'] = 'Teams webhook URL is required';
                }
                break;

            case 'telegram':
                if (!formData.config.botToken) {
                    newErrors['config.botToken'] = 'Bot Token is required';
                }
                if (!formData.config.chatId) {
                    newErrors['config.chatId'] = 'Chat ID is required';
                }
                break;
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // 提交表单
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (validateForm()) {
            onSave(formData);
        }
    };

    // 渲染配置字段
    const renderConfigFields = () => {
        switch (formData.type) {
            case 'email':
                return (
                    <>
                        <div className="form-group">
                            <label htmlFor="recipients">Recipients</label>
                            <input
                                type="text"
                                id="recipients"
                                name="config.recipients"
                                value={formData.config.recipients || ''}
                                onChange={handleInputChange}
                                className={`form-input ${errors['config.recipients'] ? 'border-destructive' : ''}`}
                                placeholder="email1@example.com, email2@example.com"
                            />
                            {errors['config.recipients'] && (
                                <p className="text-destructive text-sm mt-1">{errors['config.recipients']}</p>
                            )}
                            <p className="text-sm text-muted-foreground mt-1">
                                Comma-separated list of email addresses
                            </p>
                        </div>

                        <div className="form-group">
                            <label htmlFor="subjectPrefix">Subject Prefix (Optional)</label>
                            <input
                                type="text"
                                id="subjectPrefix"
                                name="config.subjectPrefix"
                                value={formData.config.subjectPrefix || ''}
                                onChange={handleInputChange}
                                className="form-input"
                                placeholder="[ALERT]"
                            />
                        </div>
                    </>
                );

            case 'slack':
                return (
                    <>
                        <div className="form-group">
                            <label htmlFor="webhook">Slack Webhook URL</label>
                            <input
                                type="text"
                                id="webhook"
                                name="config.webhook"
                                value={formData.config.webhook || ''}
                                onChange={handleInputChange}
                                className={`form-input ${errors['config.webhook'] ? 'border-destructive' : ''}`}
                                placeholder="https://hooks.slack.com/services/..."
                            />
                            {errors['config.webhook'] && (
                                <p className="text-destructive text-sm mt-1">{errors['config.webhook']}</p>
                            )}
                        </div>

                        <div className="form-group">
                            <label htmlFor="channel">Channel (Optional)</label>
                            <input
                                type="text"
                                id="channel"
                                name="config.channel"
                                value={formData.config.channel || ''}
                                onChange={handleInputChange}
                                className="form-input"
                                placeholder="#alerts"
                            />
                            <p className="text-sm text-muted-foreground mt-1">
                                Override the default channel in the webhook
                            </p>
                        </div>

                        <div className="form-group">
                            <label htmlFor="username">Username (Optional)</label>
                            <input
                                type="text"
                                id="username"
                                name="config.username"
                                value={formData.config.username || ''}
                                onChange={handleInputChange}
                                className="form-input"
                                placeholder="Bagctor Monitoring"
                            />
                        </div>
                    </>
                );

            case 'pagerduty':
                return (
                    <>
                        <div className="form-group">
                            <label htmlFor="serviceKey">Integration/Service Key</label>
                            <input
                                type="text"
                                id="serviceKey"
                                name="config.serviceKey"
                                value={formData.config.serviceKey || ''}
                                onChange={handleInputChange}
                                className={`form-input ${errors['config.serviceKey'] ? 'border-destructive' : ''}`}
                                placeholder="PagerDuty service key"
                            />
                            {errors['config.serviceKey'] && (
                                <p className="text-destructive text-sm mt-1">{errors['config.serviceKey']}</p>
                            )}
                        </div>

                        <div className="form-group">
                            <label htmlFor="severity">Severity (Optional)</label>
                            <select
                                id="severity"
                                name="config.severity"
                                value={formData.config.severity || 'critical'}
                                onChange={handleInputChange}
                                className="form-select"
                            >
                                <option value="info">Info</option>
                                <option value="warning">Warning</option>
                                <option value="error">Error</option>
                                <option value="critical">Critical</option>
                            </select>
                        </div>
                    </>
                );

            case 'webhook':
                return (
                    <>
                        <div className="form-group">
                            <label htmlFor="url">Webhook URL</label>
                            <input
                                type="text"
                                id="url"
                                name="config.url"
                                value={formData.config.url || ''}
                                onChange={handleInputChange}
                                className={`form-input ${errors['config.url'] ? 'border-destructive' : ''}`}
                                placeholder="https://api.example.com/webhook"
                            />
                            {errors['config.url'] && (
                                <p className="text-destructive text-sm mt-1">{errors['config.url']}</p>
                            )}
                        </div>

                        <div className="form-group">
                            <label htmlFor="method">HTTP Method</label>
                            <select
                                id="method"
                                name="config.method"
                                value={formData.config.method || 'POST'}
                                onChange={handleInputChange}
                                className="form-select"
                            >
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="headers">HTTP Headers (JSON format, Optional)</label>
                            <textarea
                                id="headers"
                                name="config.headers"
                                value={formData.config.headers || ''}
                                onChange={handleInputChange}
                                className="form-textarea"
                                placeholder='{"Content-Type": "application/json", "Authorization": "Bearer token"}'
                                rows={3}
                            />
                            <p className="text-sm text-muted-foreground mt-1">
                                JSON format: {'{\"key\": \"value\"}'}
                            </p>
                        </div>
                    </>
                );

            case 'teams':
                return (
                    <>
                        <div className="form-group">
                            <label htmlFor="webhook">Microsoft Teams Webhook URL</label>
                            <input
                                type="text"
                                id="webhook"
                                name="config.webhook"
                                value={formData.config.webhook || ''}
                                onChange={handleInputChange}
                                className={`form-input ${errors['config.webhook'] ? 'border-destructive' : ''}`}
                                placeholder="https://outlook.office.com/webhook/..."
                            />
                            {errors['config.webhook'] && (
                                <p className="text-destructive text-sm mt-1">{errors['config.webhook']}</p>
                            )}
                        </div>

                        <div className="form-group">
                            <label htmlFor="title">Title Prefix (Optional)</label>
                            <input
                                type="text"
                                id="title"
                                name="config.title"
                                value={formData.config.title || ''}
                                onChange={handleInputChange}
                                className="form-input"
                                placeholder="Bagctor Alert:"
                            />
                        </div>
                    </>
                );

            case 'telegram':
                return (
                    <>
                        <div className="form-group">
                            <label htmlFor="botToken">Bot Token</label>
                            <input
                                type="text"
                                id="botToken"
                                name="config.botToken"
                                value={formData.config.botToken || ''}
                                onChange={handleInputChange}
                                className={`form-input ${errors['config.botToken'] ? 'border-destructive' : ''}`}
                                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                            />
                            {errors['config.botToken'] && (
                                <p className="text-destructive text-sm mt-1">{errors['config.botToken']}</p>
                            )}
                        </div>

                        <div className="form-group">
                            <label htmlFor="chatId">Chat ID</label>
                            <input
                                type="text"
                                id="chatId"
                                name="config.chatId"
                                value={formData.config.chatId || ''}
                                onChange={handleInputChange}
                                className={`form-input ${errors['config.chatId'] ? 'border-destructive' : ''}`}
                                placeholder="-1001234567890"
                            />
                            {errors['config.chatId'] && (
                                <p className="text-destructive text-sm mt-1">{errors['config.chatId']}</p>
                            )}
                            <p className="text-sm text-muted-foreground mt-1">
                                Group or channel chat ID (can be negative)
                            </p>
                        </div>
                    </>
                );

            default:
                return null;
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="form-group">
                    <label htmlFor="name">Channel Name</label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className={`form-input ${errors.name ? 'border-destructive' : ''}`}
                        placeholder="Team Email, Slack Alerts, etc."
                    />
                    {errors.name && (
                        <p className="text-destructive text-sm mt-1">{errors.name}</p>
                    )}
                </div>

                <div className="form-group">
                    <label htmlFor="type">Channel Type</label>
                    <select
                        id="type"
                        name="type"
                        value={formData.type}
                        onChange={handleSelectChange}
                        className="form-select"
                    >
                        <option value="email">Email</option>
                        <option value="slack">Slack</option>
                        <option value="pagerduty">PagerDuty</option>
                        <option value="webhook">Webhook</option>
                        <option value="teams">Microsoft Teams</option>
                        <option value="telegram">Telegram</option>
                    </select>
                </div>
            </div>

            <div className="bg-muted/30 p-4 rounded-md">
                <h3 className="text-md font-semibold mb-4">Channel Configuration</h3>
                <div className="space-y-4">
                    {renderConfigFields()}
                </div>
            </div>

            <div className="flex items-center">
                <label className="cursor-pointer flex items-center">
                    <div
                        className={`w-11 h-6 relative rounded-full transition-colors duration-200 ease-linear ${formData.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                        onClick={handleToggleEnabled}
                    >
                        <div
                            className={`absolute left-1 top-1 bg-white dark:bg-gray-200 w-4 h-4 rounded-full transition-transform duration-200 ease-in-out transform ${formData.enabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                        />
                    </div>
                    <span className="ml-3 text-sm font-medium">
                        {formData.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </label>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={onCancel}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="btn btn-primary"
                >
                    Save Channel
                </button>
            </div>
        </form>
    );
};

export default NotificationChannelForm;