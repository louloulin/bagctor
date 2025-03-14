import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { AlertUI } from '../alert_ui';
import { AlertManager, AlertSeverity, AlertState, AlertConditionType, Alert } from '../alert_manager';
import { MetricRegistry } from '../../metrics/collector';

// 模拟DOM环境
global.document = {
    createElement: () => ({
        className: '',
        style: {},
        appendChild: () => { },
        addEventListener: () => { },
        setAttribute: () => { },
        querySelector: () => ({}),
        querySelectorAll: () => [],
        classList: {
            add: () => { },
            remove: () => { },
            toggle: () => { }
        }
    }),
    getElementById: (id: string) => ({
        appendChild: () => { },
        innerHTML: '',
        style: {},
        addEventListener: () => { },
        querySelector: () => ({}),
        querySelectorAll: () => []
    }),
    createTextNode: (text: string) => ({ textContent: text })
} as any;

// 不要覆盖全局的setInterval和clearInterval，而是在测试中模拟它们
const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;

describe('AlertUI', () => {
    let alertUI: AlertUI;
    let alertManager: AlertManager;
    let metricRegistry: MetricRegistry;
    const containerId = 'alerts-container';

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

        // 创建告警UI
        alertUI = new AlertUI(alertManager, {
            maxAlertsToShow: 50,
            autoRefreshInterval: 10000,
            showResolvedAlerts: false,
            groupBySeverity: true
        });
    });

    afterEach(() => {
        // 停止告警管理器
        alertManager.stop();

        // 清理告警UI
        alertUI.destroy();
    });

    test('should initialize with correct configuration', () => {
        // 验证初始配置
        expect(alertUI['config'].maxAlertsToShow).toBe(50);
        expect(alertUI['config'].autoRefreshInterval).toBe(10000);
        expect(alertUI['config'].showResolvedAlerts).toBe(false);
        expect(alertUI['config'].groupBySeverity).toBe(true);
        expect(alertUI['alertManager']).toBe(alertManager);
    });

    test('should create UI elements', () => {
        // 模拟DOM方法
        const createElementSpy = spyOn(document, 'createElement');
        const getElementByIdSpy = spyOn(document, 'getElementById');

        // 初始化UI
        alertUI.initialize(containerId);

        // 验证创建了UI元素
        expect(createElementSpy).toHaveBeenCalled();
        expect(getElementByIdSpy).toHaveBeenCalledWith(containerId);
    });

    test('should refresh alerts from AlertManager', () => {
        // 创建符合Alert接口的模拟数据
        const mockAlert: Alert = {
            id: 'alert-1',
            name: 'Test Alert',
            description: 'Test alert description',
            metricName: 'test_metric',
            metricValue: 150,
            metricTags: { service: 'test' },
            severity: AlertSeverity.WARNING,
            state: AlertState.FIRING,
            ruleId: 'rule-1',
            condition: {
                type: AlertConditionType.THRESHOLD,
                threshold: 100,
                operator: '>'
            },
            startsAt: new Date(),
            lastEvaluatedAt: new Date(),
            annotations: {},
            endsAt: undefined
        };

        // 模拟AlertManager.getAllAlerts方法
        const getAllAlertsSpy = spyOn(alertManager, 'getAllAlerts').mockImplementation(() => [mockAlert]);

        // 初始化UI
        alertUI.initialize(containerId);

        // 刷新告警
        alertUI.refreshAlerts();

        // 验证调用了AlertManager.getAllAlerts
        expect(getAllAlertsSpy).toHaveBeenCalled();
    });

    test('should filter alerts by severity', () => {
        // 创建符合Alert接口的模拟数据
        const alerts: Alert[] = [
            {
                id: 'alert-1',
                name: 'Critical Alert',
                description: 'Critical alert description',
                metricName: 'test_metric',
                metricValue: 200,
                metricTags: { service: 'test' },
                severity: AlertSeverity.CRITICAL,
                state: AlertState.FIRING,
                ruleId: 'rule-1',
                condition: {
                    type: AlertConditionType.THRESHOLD,
                    threshold: 100,
                    operator: '>'
                },
                startsAt: new Date(),
                lastEvaluatedAt: new Date(),
                annotations: {},
                endsAt: undefined
            },
            {
                id: 'alert-2',
                name: 'Warning Alert',
                description: 'Warning alert description',
                metricName: 'test_metric',
                metricValue: 150,
                metricTags: { service: 'test' },
                severity: AlertSeverity.WARNING,
                state: AlertState.FIRING,
                ruleId: 'rule-2',
                condition: {
                    type: AlertConditionType.THRESHOLD,
                    threshold: 100,
                    operator: '>'
                },
                startsAt: new Date(),
                lastEvaluatedAt: new Date(),
                annotations: {},
                endsAt: undefined
            }
        ];

        // 模拟AlertManager.getAllAlerts方法
        spyOn(alertManager, 'getAllAlerts').mockImplementation(() => alerts);

        // 初始化UI
        alertUI.initialize(containerId);

        // 刷新告警
        alertUI.refreshAlerts();

        // 过滤告警（仅显示严重告警）
        const filteredAlerts = alertUI['filterAlerts'](alerts);

        // 验证过滤结果
        expect(filteredAlerts.length).toBe(2); // 默认不过滤严重性
    });

    test('should toggle resolved alerts visibility', () => {
        // 创建符合Alert接口的模拟数据
        const alerts: Alert[] = [
            {
                id: 'alert-1',
                name: 'Firing Alert',
                description: 'Firing alert description',
                metricName: 'test_metric',
                metricValue: 200,
                metricTags: { service: 'test' },
                severity: AlertSeverity.CRITICAL,
                state: AlertState.FIRING,
                ruleId: 'rule-1',
                condition: {
                    type: AlertConditionType.THRESHOLD,
                    threshold: 100,
                    operator: '>'
                },
                startsAt: new Date(),
                lastEvaluatedAt: new Date(),
                annotations: {},
                endsAt: undefined
            },
            {
                id: 'alert-2',
                name: 'Resolved Alert',
                description: 'Resolved alert description',
                metricName: 'test_metric',
                metricValue: 150,
                metricTags: { service: 'test' },
                severity: AlertSeverity.WARNING,
                state: AlertState.RESOLVED,
                ruleId: 'rule-2',
                condition: {
                    type: AlertConditionType.THRESHOLD,
                    threshold: 100,
                    operator: '>'
                },
                startsAt: new Date(),
                lastEvaluatedAt: new Date(),
                annotations: {},
                endsAt: new Date()
            }
        ];

        // 模拟AlertManager.getAllAlerts方法
        spyOn(alertManager, 'getAllAlerts').mockImplementation(() => alerts);

        // 初始化UI
        alertUI.initialize(containerId);

        // 修改配置以测试过滤
        alertUI['config'].showResolvedAlerts = false;

        // 过滤告警（不显示已解决的告警）
        let filteredAlerts = alertUI['filterAlerts'](alerts);

        // 验证过滤结果
        expect(filteredAlerts.length).toBe(1);
        expect(filteredAlerts[0].state).toBe(AlertState.FIRING);

        // 修改配置以显示已解决的告警
        alertUI['config'].showResolvedAlerts = true;

        // 过滤告警（显示已解决的告警）
        filteredAlerts = alertUI['filterAlerts'](alerts);

        // 验证过滤结果
        expect(filteredAlerts.length).toBe(2);
    });

    test('should group alerts by severity', () => {
        // 创建符合Alert接口的模拟数据
        const alerts: Alert[] = [
            {
                id: 'alert-1',
                name: 'Critical Alert 1',
                description: 'Critical alert description',
                metricName: 'test_metric',
                metricValue: 200,
                metricTags: { service: 'test' },
                severity: AlertSeverity.CRITICAL,
                state: AlertState.FIRING,
                ruleId: 'rule-1',
                condition: {
                    type: AlertConditionType.THRESHOLD,
                    threshold: 100,
                    operator: '>'
                },
                startsAt: new Date(),
                lastEvaluatedAt: new Date(),
                annotations: {},
                endsAt: undefined
            },
            {
                id: 'alert-2',
                name: 'Critical Alert 2',
                description: 'Critical alert description',
                metricName: 'test_metric',
                metricValue: 250,
                metricTags: { service: 'test' },
                severity: AlertSeverity.CRITICAL,
                state: AlertState.FIRING,
                ruleId: 'rule-1',
                condition: {
                    type: AlertConditionType.THRESHOLD,
                    threshold: 100,
                    operator: '>'
                },
                startsAt: new Date(),
                lastEvaluatedAt: new Date(),
                annotations: {},
                endsAt: undefined
            },
            {
                id: 'alert-3',
                name: 'Warning Alert',
                description: 'Warning alert description',
                metricName: 'test_metric',
                metricValue: 150,
                metricTags: { service: 'test' },
                severity: AlertSeverity.WARNING,
                state: AlertState.FIRING,
                ruleId: 'rule-2',
                condition: {
                    type: AlertConditionType.THRESHOLD,
                    threshold: 100,
                    operator: '>'
                },
                startsAt: new Date(),
                lastEvaluatedAt: new Date(),
                annotations: {},
                endsAt: undefined
            }
        ];

        // 模拟AlertManager.getAllAlerts方法
        spyOn(alertManager, 'getAllAlerts').mockImplementation(() => alerts);

        // 初始化UI
        alertUI.initialize(containerId);

        // 刷新告警
        alertUI.refreshAlerts();

        // 分组告警
        const groupedAlerts = alertUI['groupAlertsBySeverity'](alerts);

        // 验证分组结果
        expect(groupedAlerts.size).toBe(2);
        expect(groupedAlerts.get(AlertSeverity.CRITICAL)?.length).toBe(2);
        expect(groupedAlerts.get(AlertSeverity.WARNING)?.length).toBe(1);
    });

    test('should handle alert updates', () => {
        // 创建符合Alert接口的模拟数据
        const alert: Alert = {
            id: 'alert-1',
            name: 'Test Alert',
            description: 'Test alert description',
            metricName: 'test_metric',
            metricValue: 200,
            metricTags: { service: 'test' },
            severity: AlertSeverity.CRITICAL,
            state: AlertState.FIRING,
            ruleId: 'rule-1',
            condition: {
                type: AlertConditionType.THRESHOLD,
                threshold: 100,
                operator: '>'
            },
            startsAt: new Date(),
            lastEvaluatedAt: new Date(),
            annotations: {},
            endsAt: undefined
        };

        // 模拟AlertManager.getAllAlerts方法
        spyOn(alertManager, 'getAllAlerts').mockImplementation(() => [alert]);

        // 模拟refreshAlerts方法
        const refreshAlertsSpy = spyOn(alertUI, 'refreshAlerts');

        // 初始化UI
        alertUI.initialize(containerId);

        // 触发告警更新
        alertUI['handleAlertUpdate'](alert);

        // 验证调用了refreshAlerts
        expect(refreshAlertsSpy).toHaveBeenCalled();
    });

    test('should start and stop auto-refresh', () => {
        // 创建带自动刷新的告警UI
        const autoRefreshUI = new AlertUI(alertManager, {
            maxAlertsToShow: 50,
            autoRefreshInterval: 1000,
            showResolvedAlerts: false,
            groupBySeverity: true
        });

        // 模拟setInterval
        let intervalCallback: Function | null = null;
        let intervalTime: number | null = null;
        let intervalId = 123;

        // 替换setInterval
        const setIntervalMock = (callback: Function, ms: number) => {
            intervalCallback = callback;
            intervalTime = ms;
            return intervalId;
        };

        // 替换clearInterval
        const clearIntervalMock = (id: number) => {
            if (id === intervalId) {
                intervalCallback = null;
                intervalTime = null;
            }
        };

        // 应用模拟
        global.setInterval = setIntervalMock as any;
        global.clearInterval = clearIntervalMock as any;

        // 初始化UI（应该启动自动刷新）
        autoRefreshUI.initialize(containerId);

        // 验证启动了自动刷新
        expect(intervalCallback).not.toBeNull();
        expect(intervalTime).toBe(1000);

        // 停止自动刷新
        autoRefreshUI.stopAutoRefresh();

        // 验证停止了自动刷新
        expect(intervalCallback).toBeNull();

        // 恢复原始函数
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
    });
}); 