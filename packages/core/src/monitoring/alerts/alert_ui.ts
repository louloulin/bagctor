import { log } from '@utils/logger';
import { AlertManager, Alert, AlertState, AlertSeverity } from './alert_manager';

// 告警UI配置
export interface AlertUIConfig {
    maxAlertsToShow: number;
    autoRefreshInterval: number;
    showResolvedAlerts: boolean;
    groupBySeverity: boolean;
}

// 告警UI组件
export class AlertUI {
    private config: AlertUIConfig;
    private alertManager: AlertManager;
    private refreshTimer?: NodeJS.Timeout;
    private container: HTMLElement | null = null;
    private alertsContainer: HTMLElement | null = null;

    constructor(alertManager: AlertManager, config: Partial<AlertUIConfig> = {}) {
        this.alertManager = alertManager;
        this.config = {
            maxAlertsToShow: config.maxAlertsToShow ?? 50,
            autoRefreshInterval: config.autoRefreshInterval ?? 10000,
            showResolvedAlerts: config.showResolvedAlerts ?? false,
            groupBySeverity: config.groupBySeverity ?? true
        };

        // 添加告警监听器
        this.alertManager.addAlertListener(this.handleAlertUpdate.bind(this));
    }

    // 初始化UI
    initialize(containerId: string): void {
        this.container = document.getElementById(containerId);

        if (!this.container) {
            log.error(`Alert UI container not found: ${containerId}`);
            return;
        }

        this.createUI();
        this.startAutoRefresh();
    }

    // 创建UI
    private createUI(): void {
        if (!this.container) return;

        // 清空容器
        this.container.innerHTML = '';

        // 创建标题
        const header = document.createElement('div');
        header.className = 'alert-ui-header';
        header.innerHTML = `
            <h2>Alerts</h2>
            <div class="alert-ui-controls">
                <button id="refresh-alerts-btn" class="btn btn-sm btn-primary">Refresh</button>
                <label>
                    <input type="checkbox" id="show-resolved-alerts" ${this.config.showResolvedAlerts ? 'checked' : ''}>
                    Show Resolved
                </label>
                <label>
                    <input type="checkbox" id="group-by-severity" ${this.config.groupBySeverity ? 'checked' : ''}>
                    Group by Severity
                </label>
            </div>
        `;

        // 创建告警容器
        this.alertsContainer = document.createElement('div');
        this.alertsContainer.className = 'alerts-container';

        // 添加到主容器
        this.container.appendChild(header);
        this.container.appendChild(this.alertsContainer);

        // 添加事件监听器
        const refreshBtn = document.getElementById('refresh-alerts-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshAlerts());
        }

        const showResolvedCheckbox = document.getElementById('show-resolved-alerts') as HTMLInputElement;
        if (showResolvedCheckbox) {
            showResolvedCheckbox.addEventListener('change', (e) => {
                this.config.showResolvedAlerts = (e.target as HTMLInputElement).checked;
                this.refreshAlerts();
            });
        }

        const groupBySeverityCheckbox = document.getElementById('group-by-severity') as HTMLInputElement;
        if (groupBySeverityCheckbox) {
            groupBySeverityCheckbox.addEventListener('change', (e) => {
                this.config.groupBySeverity = (e.target as HTMLInputElement).checked;
                this.refreshAlerts();
            });
        }

        // 初始加载告警
        this.refreshAlerts();
    }

    // 刷新告警
    refreshAlerts(): void {
        if (!this.alertsContainer) return;

        // 获取告警
        const alerts = this.alertManager.getAllAlerts();

        // 过滤告警
        const filteredAlerts = this.filterAlerts(alerts);

        // 清空容器
        this.alertsContainer.innerHTML = '';

        if (filteredAlerts.length === 0) {
            this.alertsContainer.innerHTML = '<div class="no-alerts">No alerts to display</div>';
            return;
        }

        // 按严重性分组
        if (this.config.groupBySeverity) {
            this.renderGroupedAlerts(filteredAlerts);
        } else {
            this.renderAlertsList(filteredAlerts);
        }
    }

    // 过滤告警
    private filterAlerts(alerts: Alert[]): Alert[] {
        let filtered = [...alerts];

        // 过滤已解决的告警
        if (!this.config.showResolvedAlerts) {
            filtered = filtered.filter(alert => alert.state !== AlertState.RESOLVED);
        }

        // 按时间排序，最新的在前面
        filtered.sort((a, b) => b.lastEvaluatedAt.getTime() - a.lastEvaluatedAt.getTime());

        // 限制数量
        if (filtered.length > this.config.maxAlertsToShow) {
            filtered = filtered.slice(0, this.config.maxAlertsToShow);
        }

        return filtered;
    }

    // 渲染分组的告警
    private renderGroupedAlerts(alerts: Alert[]): void {
        if (!this.alertsContainer) return;

        // 按严重性分组
        const grouped = this.groupAlertsBySeverity(alerts);

        // 按严重性顺序渲染
        const severityOrder = [
            AlertSeverity.CRITICAL,
            AlertSeverity.ERROR,
            AlertSeverity.WARNING,
            AlertSeverity.INFO
        ];

        for (const severity of severityOrder) {
            const severityAlerts = grouped.get(severity) || [];

            if (severityAlerts.length === 0) continue;

            // 创建分组容器
            const groupContainer = document.createElement('div');
            groupContainer.className = `alert-group alert-group-${severity}`;

            // 创建分组标题
            const groupHeader = document.createElement('div');
            groupHeader.className = 'alert-group-header';
            groupHeader.innerHTML = `
                <h3>${this.getSeverityLabel(severity)} (${severityAlerts.length})</h3>
                <div class="alert-group-toggle" data-severity="${severity}">▼</div>
            `;

            // 创建告警列表
            const alertsList = document.createElement('div');
            alertsList.className = 'alerts-list';
            alertsList.id = `alerts-list-${severity}`;

            // 渲染告警
            for (const alert of severityAlerts) {
                alertsList.appendChild(this.createAlertElement(alert));
            }

            // 添加到分组容器
            groupContainer.appendChild(groupHeader);
            groupContainer.appendChild(alertsList);

            // 添加到主容器
            this.alertsContainer.appendChild(groupContainer);

            // 添加切换事件
            const toggle = groupHeader.querySelector('.alert-group-toggle');
            if (toggle) {
                toggle.addEventListener('click', (e) => {
                    const target = e.target as HTMLElement;
                    const severity = target.getAttribute('data-severity');
                    const list = document.getElementById(`alerts-list-${severity}`);

                    if (list) {
                        const isVisible = list.style.display !== 'none';
                        list.style.display = isVisible ? 'none' : 'block';
                        target.textContent = isVisible ? '▶' : '▼';
                    }
                });
            }
        }
    }

    // 渲染告警列表
    private renderAlertsList(alerts: Alert[]): void {
        if (!this.alertsContainer) return;

        // 创建告警列表
        const alertsList = document.createElement('div');
        alertsList.className = 'alerts-list';

        // 渲染告警
        for (const alert of alerts) {
            alertsList.appendChild(this.createAlertElement(alert));
        }

        // 添加到主容器
        this.alertsContainer.appendChild(alertsList);
    }

    // 创建告警元素
    private createAlertElement(alert: Alert): HTMLElement {
        const alertElement = document.createElement('div');
        alertElement.className = `alert-item alert-${alert.severity} alert-${alert.state}`;
        alertElement.setAttribute('data-alert-id', alert.id);

        // 格式化时间
        const startTime = this.formatTime(alert.startsAt);
        const endTime = alert.endsAt ? this.formatTime(alert.endsAt) : '';
        const duration = alert.endsAt
            ? this.formatDuration(alert.endsAt.getTime() - alert.startsAt.getTime())
            : this.formatDuration(Date.now() - alert.startsAt.getTime());

        alertElement.innerHTML = `
            <div class="alert-header">
                <div class="alert-severity ${alert.severity}">${this.getSeverityLabel(alert.severity)}</div>
                <div class="alert-state ${alert.state}">${this.getStateLabel(alert.state)}</div>
                <div class="alert-name">${alert.name}</div>
            </div>
            <div class="alert-body">
                <div class="alert-summary">${alert.annotations.summary}</div>
                <div class="alert-details">
                    <div class="alert-metric">
                        <span class="label">Metric:</span> ${alert.metricName} = ${alert.metricValue}
                    </div>
                    <div class="alert-time">
                        <span class="label">Started:</span> ${startTime}
                        ${alert.endsAt ? `<span class="label">Ended:</span> ${endTime}` : ''}
                        <span class="label">Duration:</span> ${duration}
                    </div>
                    <div class="alert-tags">
                        ${this.renderTags(alert.metricTags)}
                    </div>
                </div>
            </div>
        `;

        return alertElement;
    }

    // 渲染标签
    private renderTags(tags: Record<string, string>): string {
        return Object.entries(tags)
            .map(([key, value]) => `<span class="tag">${key}=${value}</span>`)
            .join('');
    }

    // 按严重性分组告警
    private groupAlertsBySeverity(alerts: Alert[]): Map<AlertSeverity, Alert[]> {
        const result = new Map<AlertSeverity, Alert[]>();

        for (const severity of Object.values(AlertSeverity)) {
            result.set(severity as AlertSeverity, []);
        }

        for (const alert of alerts) {
            const group = result.get(alert.severity) || [];
            group.push(alert);
        }

        return result;
    }

    // 获取严重性标签
    private getSeverityLabel(severity: AlertSeverity): string {
        switch (severity) {
            case AlertSeverity.CRITICAL: return 'Critical';
            case AlertSeverity.ERROR: return 'Error';
            case AlertSeverity.WARNING: return 'Warning';
            case AlertSeverity.INFO: return 'Info';
            default: return severity;
        }
    }

    // 获取状态标签
    private getStateLabel(state: AlertState): string {
        switch (state) {
            case AlertState.FIRING: return 'Firing';
            case AlertState.PENDING: return 'Pending';
            case AlertState.RESOLVED: return 'Resolved';
            case AlertState.OK: return 'OK';
            default: return state;
        }
    }

    // 格式化时间
    private formatTime(date: Date): string {
        return date.toLocaleString();
    }

    // 格式化持续时间
    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    // 处理告警更新
    private handleAlertUpdate(alert: Alert): void {
        // 如果UI已初始化，刷新告警
        if (this.alertsContainer) {
            this.refreshAlerts();
        }
    }

    // 开始自动刷新
    private startAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        if (this.config.autoRefreshInterval > 0) {
            this.refreshTimer = setInterval(() => {
                this.refreshAlerts();
            }, this.config.autoRefreshInterval) as unknown as NodeJS.Timeout;
        }
    }

    // 停止自动刷新
    stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }

    // 销毁UI
    destroy(): void {
        this.stopAutoRefresh();

        if (this.container) {
            this.container.innerHTML = '';
        }

        this.container = null;
        this.alertsContainer = null;
    }

    // 生成CSS样式
    static generateCSS(): string {
        return `
            .alert-ui-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .alert-ui-controls {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            
            .alerts-container {
                border: 1px solid #ddd;
                border-radius: 4px;
                overflow: hidden;
            }
            
            .no-alerts {
                padding: 20px;
                text-align: center;
                color: #666;
            }
            
            .alert-group {
                margin-bottom: 10px;
            }
            
            .alert-group-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 15px;
                background-color: #f5f5f5;
                border-bottom: 1px solid #ddd;
                cursor: pointer;
            }
            
            .alert-group-critical .alert-group-header {
                background-color: #fee;
            }
            
            .alert-group-error .alert-group-header {
                background-color: #fff0f0;
            }
            
            .alert-group-warning .alert-group-header {
                background-color: #fffbe6;
            }
            
            .alert-group-info .alert-group-header {
                background-color: #e6f7ff;
            }
            
            .alert-group-toggle {
                font-size: 12px;
                cursor: pointer;
            }
            
            .alerts-list {
                max-height: 500px;
                overflow-y: auto;
            }
            
            .alert-item {
                padding: 10px 15px;
                border-bottom: 1px solid #eee;
                transition: background-color 0.2s;
            }
            
            .alert-item:hover {
                background-color: #f9f9f9;
            }
            
            .alert-item:last-child {
                border-bottom: none;
            }
            
            .alert-header {
                display: flex;
                align-items: center;
                margin-bottom: 5px;
            }
            
            .alert-severity {
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 12px;
                font-weight: bold;
                margin-right: 10px;
            }
            
            .alert-severity.critical {
                background-color: #f5222d;
                color: white;
            }
            
            .alert-severity.error {
                background-color: #ff4d4f;
                color: white;
            }
            
            .alert-severity.warning {
                background-color: #faad14;
                color: white;
            }
            
            .alert-severity.info {
                background-color: #1890ff;
                color: white;
            }
            
            .alert-state {
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 12px;
                margin-right: 10px;
            }
            
            .alert-state.firing {
                background-color: #ff4d4f;
                color: white;
            }
            
            .alert-state.pending {
                background-color: #faad14;
                color: white;
            }
            
            .alert-state.resolved {
                background-color: #52c41a;
                color: white;
            }
            
            .alert-name {
                font-weight: bold;
                flex-grow: 1;
            }
            
            .alert-summary {
                margin-bottom: 5px;
            }
            
            .alert-details {
                font-size: 12px;
                color: #666;
            }
            
            .alert-metric, .alert-time {
                margin-bottom: 3px;
            }
            
            .label {
                font-weight: bold;
                margin-right: 5px;
            }
            
            .alert-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
                margin-top: 5px;
            }
            
            .tag {
                background-color: #f0f0f0;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
            }
            
            .alert-resolved {
                opacity: 0.7;
            }
        `;
    }
} 