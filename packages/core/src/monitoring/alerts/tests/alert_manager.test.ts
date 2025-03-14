import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { AlertManager, AlertSeverity, AlertState, AlertConditionType, NotificationChannelType } from '../alert_manager';
import { MetricRegistry, MetricType } from '../../metrics/collector';

describe('AlertManager', () => {
    let alertManager: AlertManager;
    let metricRegistry: MetricRegistry;

    beforeEach(() => {
        // 初始化指标注册表
        metricRegistry = MetricRegistry.getInstance();

        // 创建告警管理器
        alertManager = AlertManager.getInstance({
            enabled: true,
            evaluationInterval: 1,
            defaultCooldownPeriod: 60,
            defaultNotificationChannels: ['console'],
            retentionDays: 7
        });

        // 添加控制台通知渠道
        alertManager.addNotificationChannel({
            id: 'console',
            name: 'Console',
            type: NotificationChannelType.CONSOLE,
            enabled: true,
            config: {}
        });

        // 启动告警管理器
        alertManager.start();
    });

    afterEach(() => {
        // 停止告警管理器
        alertManager.stop();
    });

    test('should add and retrieve alert rules', () => {
        // 添加告警规则
        const ruleId = alertManager.addRule({
            id: 'test-rule',
            name: 'Test Rule',
            description: 'Test rule description',
            metricName: 'test_metric',
            condition: {
                type: AlertConditionType.THRESHOLD,
                threshold: 100,
                operator: '>'
            },
            severity: AlertSeverity.WARNING,
            enabled: true,
            notificationChannels: ['console'],
            cooldownPeriod: 60,
            evaluationInterval: 5
        });

        // 验证规则ID
        expect(ruleId).toBe('test-rule');

        // 获取规则
        const rule = alertManager.getRule(ruleId);

        // 验证规则属性
        expect(rule).toBeDefined();
        if (rule) {
            expect(rule.name).toBe('Test Rule');
            expect(rule.metricName).toBe('test_metric');
            expect(rule.severity).toBe(AlertSeverity.WARNING);
            expect(rule.condition.type).toBe(AlertConditionType.THRESHOLD);
            expect(rule.condition.threshold).toBe(100);
            expect(rule.condition.operator).toBe('>');
        }

        // 获取所有规则
        const rules = alertManager.getAllRules();

        // 验证规则数量
        expect(rules.length).toBe(1);
    });

    test('should update alert rules', () => {
        // 添加告警规则
        const ruleId = alertManager.addRule({
            id: 'test-rule',
            name: 'Test Rule',
            description: 'Test rule description',
            metricName: 'test_metric',
            condition: {
                type: AlertConditionType.THRESHOLD,
                threshold: 100,
                operator: '>'
            },
            severity: AlertSeverity.WARNING,
            enabled: true,
            notificationChannels: ['console'],
            cooldownPeriod: 60,
            evaluationInterval: 5
        });

        // 更新规则
        const updated = alertManager.updateRule(ruleId, {
            name: 'Updated Rule',
            severity: AlertSeverity.ERROR,
            condition: {
                type: AlertConditionType.THRESHOLD,
                threshold: 200,
                operator: '>='
            }
        });

        // 验证更新结果
        expect(updated).toBe(true);

        // 获取更新后的规则
        const rule = alertManager.getRule(ruleId);

        // 验证规则属性
        expect(rule).toBeDefined();
        if (rule) {
            expect(rule.name).toBe('Updated Rule');
            expect(rule.severity).toBe(AlertSeverity.ERROR);
            expect(rule.condition.type).toBe(AlertConditionType.THRESHOLD);
            expect(rule.condition.threshold).toBe(200);
            expect(rule.condition.operator).toBe('>=');

            // 验证未更新的属性保持不变
            expect(rule.metricName).toBe('test_metric');
            expect(rule.description).toBe('Test rule description');
        }
    });

    test('should delete alert rules', () => {
        // 添加告警规则
        const ruleId = alertManager.addRule({
            id: 'test-rule',
            name: 'Test Rule',
            description: 'Test rule description',
            metricName: 'test_metric',
            condition: {
                type: AlertConditionType.THRESHOLD,
                threshold: 100,
                operator: '>'
            },
            severity: AlertSeverity.WARNING,
            enabled: true,
            notificationChannels: ['console'],
            cooldownPeriod: 60,
            evaluationInterval: 5
        });

        // 验证规则存在
        expect(alertManager.getRule(ruleId)).toBeDefined();

        // 删除规则
        const deleted = alertManager.deleteRule(ruleId);

        // 验证删除结果
        expect(deleted).toBe(true);

        // 验证规则不存在
        expect(alertManager.getRule(ruleId)).toBeUndefined();

        // 验证规则数量
        expect(alertManager.getAllRules().length).toBe(0);
    });

    test('should add and retrieve notification channels', () => {
        // 添加通知渠道
        const channelId = alertManager.addNotificationChannel({
            id: 'webhook',
            name: 'Webhook',
            type: NotificationChannelType.WEBHOOK,
            enabled: true,
            config: {
                url: 'https://example.com/webhook'
            }
        });

        // 验证渠道ID
        expect(channelId).toBe('webhook');

        // 获取渠道
        const channel = alertManager.getNotificationChannel(channelId);

        // 验证渠道属性
        expect(channel).toBeDefined();
        if (channel) {
            expect(channel.name).toBe('Webhook');
            expect(channel.type).toBe(NotificationChannelType.WEBHOOK);
            expect(channel.enabled).toBe(true);
            expect(channel.config.url).toBe('https://example.com/webhook');
        }

        // 获取所有渠道
        const channels = alertManager.getAllNotificationChannels();

        // 验证渠道数量（包括默认的控制台渠道）
        expect(channels.length).toBe(2);
    });

    test('should update notification channels', () => {
        // 添加通知渠道
        const channelId = alertManager.addNotificationChannel({
            id: 'webhook',
            name: 'Webhook',
            type: NotificationChannelType.WEBHOOK,
            enabled: true,
            config: {
                url: 'https://example.com/webhook'
            }
        });

        // 更新渠道
        const updated = alertManager.updateNotificationChannel(channelId, {
            name: 'Updated Webhook',
            enabled: false,
            config: {
                url: 'https://example.com/updated-webhook',
                headers: {
                    'Authorization': 'Bearer token'
                }
            }
        });

        // 验证更新结果
        expect(updated).toBe(true);

        // 获取更新后的渠道
        const channel = alertManager.getNotificationChannel(channelId);

        // 验证渠道属性
        expect(channel).toBeDefined();
        if (channel) {
            expect(channel.name).toBe('Updated Webhook');
            expect(channel.enabled).toBe(false);
            expect(channel.config.url).toBe('https://example.com/updated-webhook');
            expect(channel.config.headers.Authorization).toBe('Bearer token');

            // 验证未更新的属性保持不变
            expect(channel.type).toBe(NotificationChannelType.WEBHOOK);
        }
    });

    test('should delete notification channels', () => {
        // 添加通知渠道
        const channelId = alertManager.addNotificationChannel({
            id: 'webhook',
            name: 'Webhook',
            type: NotificationChannelType.WEBHOOK,
            enabled: true,
            config: {
                url: 'https://example.com/webhook'
            }
        });

        // 验证渠道存在
        expect(alertManager.getNotificationChannel(channelId)).toBeDefined();

        // 删除渠道
        const deleted = alertManager.deleteNotificationChannel(channelId);

        // 验证删除结果
        expect(deleted).toBe(true);

        // 验证渠道不存在
        expect(alertManager.getNotificationChannel(channelId)).toBeUndefined();
    });

    test('should evaluate threshold conditions correctly', async () => {
        // 创建测试指标
        const counter = metricRegistry.createCounter('test_counter', 'Test counter', { service: 'test' });

        // 添加告警规则
        alertManager.addRule({
            id: 'threshold-rule',
            name: 'Threshold Rule',
            description: 'Test threshold rule',
            metricName: 'test_counter',
            metricTags: { service: 'test' },
            condition: {
                type: AlertConditionType.THRESHOLD,
                threshold: 5,
                operator: '>'
            },
            severity: AlertSeverity.WARNING,
            enabled: true,
            notificationChannels: ['console'],
            cooldownPeriod: 60,
            evaluationInterval: 1
        });

        // 模拟告警监听器
        const alertListener = mock((alert) => { });
        alertManager.addAlertListener(alertListener);

        // 设置指标值低于阈值
        counter.inc(3);

        // 等待评估
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 验证没有触发告警
        expect(alertListener).not.toHaveBeenCalled();

        // 设置指标值高于阈值
        counter.inc(5); // 总值为8，大于阈值5

        // 等待评估
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 验证触发告警
        expect(alertListener).toHaveBeenCalled();

        // 获取告警
        const alerts = alertManager.getAllAlerts();

        // 验证告警属性
        expect(alerts.length).toBeGreaterThan(0);
        if (alerts.length > 0) {
            const alert = alerts[0];
            expect(alert.name).toBe('Threshold Rule');
            expect(alert.metricName).toBe('test_counter');
            expect(alert.metricValue).toBeGreaterThan(5);
            expect(alert.severity).toBe(AlertSeverity.WARNING);
            expect(alert.state).toBe(AlertState.PENDING);
        }
    });
}); 