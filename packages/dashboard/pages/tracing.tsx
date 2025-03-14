import React, { useState, useEffect } from 'react';
import Layout from '../components/layout/Layout';

interface Span {
    id: string;
    traceId: string;
    parentId: string | null;
    name: string;
    startTime: number;
    endTime: number;
    duration: number;
    serviceName: string;
    kind: string;
    attributes: Record<string, string>;
    events: {
        time: number;
        name: string;
        attributes?: Record<string, string>;
    }[];
}

interface Trace {
    id: string;
    name: string;
    duration: number;
    startTime: number;
    endTime: number;
    spans: Span[];
    rootSpanId: string;
    serviceName: string;
}

const TracingPage: React.FC = () => {
    const [traces, setTraces] = useState<Trace[]>([]);
    const [selectedTrace, setSelectedTrace] = useState<Trace | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [serviceFilter, setServiceFilter] = useState<string[]>([]);
    const [availableServices, setAvailableServices] = useState<string[]>([]);
    const [timeRange, setTimeRange] = useState('1h');

    // 格式化时间为相对时间
    const formatRelativeTime = (timestamp: number): string => {
        const now = Date.now();
        const diffSeconds = Math.floor((now - timestamp) / 1000);

        if (diffSeconds < 60) return `${diffSeconds}s ago`;
        if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
        if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
        return `${Math.floor(diffSeconds / 86400)}d ago`;
    };

    // 格式化持续时间
    const formatDuration = (durationMs: number): string => {
        if (durationMs < 1) {
            return `${(durationMs * 1000).toFixed(2)}μs`;
        }
        if (durationMs < 1000) {
            return `${durationMs.toFixed(2)}ms`;
        }
        return `${(durationMs / 1000).toFixed(2)}s`;
    };

    // 获取模拟的跟踪数据
    const fetchTraces = async () => {
        setIsLoading(true);
        try {
            // 模拟API调用延迟
            await new Promise(resolve => setTimeout(resolve, 500));

            // 模拟跟踪数据
            const mockTraces: Trace[] = [
                {
                    id: 'trace-1',
                    name: 'ProcessUserRequest',
                    duration: 235.5,
                    startTime: Date.now() - 120000, // 2分钟前
                    endTime: Date.now() - 119764.5,
                    serviceName: 'api-gateway',
                    rootSpanId: 'span-1',
                    spans: [
                        {
                            id: 'span-1',
                            traceId: 'trace-1',
                            parentId: null,
                            name: 'HTTP GET /api/user',
                            startTime: Date.now() - 120000,
                            endTime: Date.now() - 119764.5,
                            duration: 235.5,
                            serviceName: 'api-gateway',
                            kind: 'SERVER',
                            attributes: {
                                'http.method': 'GET',
                                'http.url': '/api/user',
                                'http.status_code': '200'
                            },
                            events: []
                        },
                        {
                            id: 'span-2',
                            traceId: 'trace-1',
                            parentId: 'span-1',
                            name: 'UserActor.getProfile',
                            startTime: Date.now() - 119950,
                            endTime: Date.now() - 119800,
                            duration: 150,
                            serviceName: 'user-service',
                            kind: 'CLIENT',
                            attributes: {
                                'actor.type': 'UserActor',
                                'actor.id': 'user-123'
                            },
                            events: [
                                {
                                    time: Date.now() - 119900,
                                    name: 'message.sent',
                                    attributes: { type: 'GetUserProfile' }
                                }
                            ]
                        },
                        {
                            id: 'span-3',
                            traceId: 'trace-1',
                            parentId: 'span-2',
                            name: 'Database Query',
                            startTime: Date.now() - 119870,
                            endTime: Date.now() - 119820,
                            duration: 50,
                            serviceName: 'database',
                            kind: 'CLIENT',
                            attributes: {
                                'db.type': 'postgres',
                                'db.statement': 'SELECT * FROM users WHERE id = ?'
                            },
                            events: []
                        }
                    ]
                },
                {
                    id: 'trace-2',
                    name: 'CreateOrder',
                    duration: 405.8,
                    startTime: Date.now() - 180000, // 3分钟前
                    endTime: Date.now() - 179594.2,
                    serviceName: 'order-service',
                    rootSpanId: 'span-4',
                    spans: [
                        {
                            id: 'span-4',
                            traceId: 'trace-2',
                            parentId: null,
                            name: 'OrderActor.createOrder',
                            startTime: Date.now() - 180000,
                            endTime: Date.now() - 179594.2,
                            duration: 405.8,
                            serviceName: 'order-service',
                            kind: 'SERVER',
                            attributes: {
                                'actor.type': 'OrderActor',
                                'actor.id': 'order-456'
                            },
                            events: []
                        },
                        {
                            id: 'span-5',
                            traceId: 'trace-2',
                            parentId: 'span-4',
                            name: 'InventoryActor.checkAvailability',
                            startTime: Date.now() - 179900,
                            endTime: Date.now() - 179800,
                            duration: 100,
                            serviceName: 'inventory-service',
                            kind: 'CLIENT',
                            attributes: {
                                'actor.type': 'InventoryActor',
                                'actor.id': 'inventory-789'
                            },
                            events: []
                        },
                        {
                            id: 'span-6',
                            traceId: 'trace-2',
                            parentId: 'span-4',
                            name: 'PaymentActor.processPayment',
                            startTime: Date.now() - 179750,
                            endTime: Date.now() - 179650,
                            duration: 100,
                            serviceName: 'payment-service',
                            kind: 'CLIENT',
                            attributes: {
                                'actor.type': 'PaymentActor',
                                'actor.id': 'payment-abc'
                            },
                            events: [
                                {
                                    time: Date.now() - 179700,
                                    name: 'payment.authorized',
                                    attributes: { amount: '125.50' }
                                }
                            ]
                        },
                        {
                            id: 'span-7',
                            traceId: 'trace-2',
                            parentId: 'span-4',
                            name: 'Database Insert',
                            startTime: Date.now() - 179645,
                            endTime: Date.now() - 179595,
                            duration: 50,
                            serviceName: 'database',
                            kind: 'CLIENT',
                            attributes: {
                                'db.type': 'postgres',
                                'db.statement': 'INSERT INTO orders VALUES (?)'
                            },
                            events: []
                        }
                    ]
                }
            ];

            setTraces(mockTraces);

            // 提取所有服务名称
            const services = new Set<string>();
            mockTraces.forEach(trace => {
                trace.spans.forEach(span => {
                    services.add(span.serviceName);
                });
            });

            setAvailableServices(Array.from(services));
        } catch (error) {
            console.error('Failed to fetch traces:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // 页面加载时获取数据
    useEffect(() => {
        fetchTraces();
    }, [timeRange]);

    // 筛选跟踪
    const filteredTraces = traces.filter(trace => {
        // 按服务名筛选
        if (serviceFilter.length > 0) {
            const hasService = trace.spans.some(span => serviceFilter.includes(span.serviceName));
            if (!hasService) return false;
        }

        // 按搜索字符串筛选（跟踪名称或ID）
        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            return (
                trace.name.toLowerCase().includes(lowerQuery) ||
                trace.id.toLowerCase().includes(lowerQuery) ||
                trace.spans.some(span => span.name.toLowerCase().includes(lowerQuery))
            );
        }

        return true;
    });

    // 计算跟踪显示的宽度百分比
    const getSpanWidthPercentage = (span: Span, trace: Trace) => {
        const totalDuration = trace.duration;
        return (span.duration / totalDuration) * 100;
    };

    // 计算跟踪显示的偏移百分比
    const getSpanOffsetPercentage = (span: Span, trace: Trace) => {
        const traceStartTime = trace.startTime;
        return ((span.startTime - traceStartTime) / trace.duration) * 100;
    };

    return (
        <Layout title="Distributed Tracing - Bagctor Monitoring Dashboard">
            <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-900">Distributed Tracing</h1>
                    <div className="flex items-center space-x-2">
                        <div className="flex items-center">
                            <span className="text-sm text-gray-600 mr-2">Time Range:</span>
                            <select
                                className="border border-gray-300 rounded-md text-sm py-1 pl-2 pr-8 bg-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                                value={timeRange}
                                onChange={(e) => setTimeRange(e.target.value)}
                            >
                                <option value="15m">15 minutes</option>
                                <option value="1h">1 hour</option>
                                <option value="3h">3 hours</option>
                                <option value="24h">24 hours</option>
                            </select>
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={fetchTraces}
                            disabled={isLoading}
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {/* 搜索和过滤 */}
                <div className="bg-white p-4 rounded-lg shadow mb-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex-1 min-w-[240px]">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Search traces by name or ID"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-gray-600">Service:</span>
                            {availableServices.map(service => (
                                <label key={service} className="inline-flex items-center">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
                                        checked={serviceFilter.includes(service)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setServiceFilter([...serviceFilter, service]);
                                            } else {
                                                setServiceFilter(serviceFilter.filter(s => s !== service));
                                            }
                                        }}
                                    />
                                    <span className="ml-2 mr-3 text-sm text-gray-700">{service}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 跟踪列表 */}
                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-500"></div>
                    </div>
                ) : filteredTraces.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-6 text-center">
                        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No traces found</h3>
                        <p className="mt-1 text-sm text-gray-500">No traces matching your current filters.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredTraces.map(trace => (
                            <div
                                key={trace.id}
                                className="bg-white rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                                onClick={() => setSelectedTrace(selectedTrace?.id === trace.id ? null : trace)}
                            >
                                <div className="p-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-lg font-medium text-gray-900">{trace.name}</h3>
                                            <p className="text-sm text-gray-500">
                                                {trace.id} • {formatRelativeTime(trace.startTime)} • {formatDuration(trace.duration)}
                                            </p>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="px-2 py-1 text-xs rounded-full bg-primary-100 text-primary-800">
                                                {trace.spans.length} spans
                                            </span>
                                        </div>
                                    </div>

                                    {/* 简单的时间线视图 */}
                                    <div className="mt-3 h-6 bg-gray-100 rounded-full overflow-hidden relative">
                                        {trace.spans.map(span => (
                                            <div
                                                key={span.id}
                                                className="absolute h-full rounded-full"
                                                style={{
                                                    left: `${getSpanOffsetPercentage(span, trace)}%`,
                                                    width: `${getSpanWidthPercentage(span, trace)}%`,
                                                    backgroundColor:
                                                        span.serviceName === 'api-gateway' ? '#3B82F6' :
                                                            span.serviceName === 'user-service' ? '#10B981' :
                                                                span.serviceName === 'order-service' ? '#F59E0B' :
                                                                    span.serviceName === 'inventory-service' ? '#8B5CF6' :
                                                                        span.serviceName === 'payment-service' ? '#EC4899' :
                                                                            span.serviceName === 'database' ? '#6B7280' : '#D1D5DB'
                                                }}
                                                title={`${span.name} (${formatDuration(span.duration)})`}
                                            ></div>
                                        ))}
                                    </div>

                                    {/* 展开视图 */}
                                    {selectedTrace?.id === trace.id && (
                                        <div className="mt-4 border-t pt-4">
                                            <h4 className="text-sm font-medium text-gray-700 mb-2">Spans</h4>
                                            <div className="space-y-2">
                                                {trace.spans.map(span => (
                                                    <div key={span.id} className="text-sm border border-gray-200 rounded p-2">
                                                        <div className="flex justify-between">
                                                            <div className="font-medium">{span.name}</div>
                                                            <div className="text-gray-500">{formatDuration(span.duration)}</div>
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            Service: {span.serviceName} • Kind: {span.kind}
                                                        </div>
                                                        {Object.keys(span.attributes).length > 0 && (
                                                            <div className="mt-2">
                                                                <div className="text-xs font-medium text-gray-700">Attributes:</div>
                                                                <div className="grid grid-cols-2 gap-1 mt-1">
                                                                    {Object.entries(span.attributes).map(([key, value]) => (
                                                                        <div key={key} className="text-xs">
                                                                            <span className="font-medium">{key}:</span> {value}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {span.events.length > 0 && (
                                                            <div className="mt-2">
                                                                <div className="text-xs font-medium text-gray-700">Events:</div>
                                                                <div className="space-y-1 mt-1">
                                                                    {span.events.map((event, index) => (
                                                                        <div key={index} className="text-xs">
                                                                            <span className="font-medium">{event.name}</span>
                                                                            {event.attributes && Object.keys(event.attributes).length > 0 && (
                                                                                <span className="text-gray-500">
                                                                                    {' ('}{Object.entries(event.attributes)
                                                                                        .map(([k, v]) => `${k}=${v}`)
                                                                                        .join(', ')}{')'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default TracingPage; 