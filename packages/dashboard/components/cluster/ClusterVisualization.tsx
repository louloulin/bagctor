import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';

interface Position {
    x: number;
    y: number;
}

interface Node {
    id: string;
    type: 'coordinator' | 'worker' | 'actor';
    name: string;
    status: 'healthy' | 'degraded' | 'offline';
    ip: string;
    connections: string[];
    metrics: {
        cpu: number;
        memory: number;
        messageRate: number;
    };
    // For runtime use during rendering
    position?: Position;
    radius?: number;
}

interface ClusterVisualizationProps {
    nodes?: Node[];
    loading?: boolean;
    error?: string;
}

// Mock data for development purpose
const mockNodes: Node[] = [
    {
        id: 'node-1',
        type: 'coordinator',
        name: 'Coordinator-Main',
        status: 'healthy',
        ip: '10.0.0.1',
        connections: ['node-2', 'node-3', 'node-4'],
        metrics: {
            cpu: 25,
            memory: 40,
            messageRate: 1200,
        },
    },
    {
        id: 'node-2',
        type: 'worker',
        name: 'Worker-1',
        status: 'healthy',
        ip: '10.0.0.2',
        connections: ['node-1', 'node-3'],
        metrics: {
            cpu: 65,
            memory: 72,
            messageRate: 850,
        },
    },
    {
        id: 'node-3',
        type: 'worker',
        name: 'Worker-2',
        status: 'degraded',
        ip: '10.0.0.3',
        connections: ['node-1', 'node-2'],
        metrics: {
            cpu: 85,
            memory: 90,
            messageRate: 320,
        },
    },
    {
        id: 'node-4',
        type: 'actor',
        name: 'Actor-Host-1',
        status: 'healthy',
        ip: '10.0.0.4',
        connections: ['node-1'],
        metrics: {
            cpu: 30,
            memory: 45,
            messageRate: 950,
        },
    },
    {
        id: 'node-5',
        type: 'actor',
        name: 'Actor-Host-2',
        status: 'offline',
        ip: '10.0.0.5',
        connections: [],
        metrics: {
            cpu: 0,
            memory: 0,
            messageRate: 0,
        },
    },
];

const ClusterVisualization: React.FC<ClusterVisualizationProps> = ({
    nodes = mockNodes,
    loading = false,
    error,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const { theme } = useTheme();
    const isDarkMode = theme === 'dark';

    const colors = {
        background: isDarkMode ? '#111827' : '#f9fafb',
        coordinator: {
            fill: isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
            stroke: isDarkMode ? '#3b82f6' : '#2563eb',
            text: isDarkMode ? '#93c5fd' : '#1e40af',
        },
        worker: {
            fill: isDarkMode ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)',
            stroke: isDarkMode ? '#8b5cf6' : '#7c3aed',
            text: isDarkMode ? '#c4b5fd' : '#5b21b6',
        },
        actor: {
            fill: isDarkMode ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
            stroke: isDarkMode ? '#22c55e' : '#16a34a',
            text: isDarkMode ? '#86efac' : '#166534',
        },
        connection: {
            healthy: isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)',
            degraded: isDarkMode ? 'rgba(245, 158, 11, 0.4)' : 'rgba(245, 158, 11, 0.4)',
        },
        status: {
            healthy: '#22c55e',
            degraded: '#f59e0b',
            offline: '#ef4444',
        },
        text: isDarkMode ? '#e5e7eb' : '#1f2937',
    };

    // Calculate positions for nodes
    const calculatePositions = (nodes: Node[], width: number, height: number) => {
        const positions: { [key: string]: { x: number; y: number } } = {};

        // Position coordinator node at the center
        const coordinatorNode = nodes.find(node => node.type === 'coordinator');
        if (coordinatorNode) {
            positions[coordinatorNode.id] = { x: width / 2, y: height / 2 };
        }

        // Position worker nodes in a circle around the coordinator
        const workerNodes = nodes.filter(node => node.type === 'worker');
        const workerRadius = Math.min(width, height) * 0.3;
        workerNodes.forEach((node, i) => {
            const angle = (i / workerNodes.length) * 2 * Math.PI;
            positions[node.id] = {
                x: width / 2 + workerRadius * Math.cos(angle),
                y: height / 2 + workerRadius * Math.sin(angle),
            };
        });

        // Position actor nodes in an outer circle
        const actorNodes = nodes.filter(node => node.type === 'actor');
        const actorRadius = Math.min(width, height) * 0.4;
        actorNodes.forEach((node, i) => {
            const angle = (i / actorNodes.length) * 2 * Math.PI;
            positions[node.id] = {
                x: width / 2 + actorRadius * Math.cos(angle),
                y: height / 2 + actorRadius * Math.sin(angle),
            };
        });

        return positions;
    };

    // Draw the visualization
    const drawVisualization = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas dimensions
        const { width, height } = container.getBoundingClientRect();
        canvas.width = width;
        canvas.height = height;

        // Clear canvas
        ctx.fillStyle = colors.background;
        ctx.fillRect(0, 0, width, height);

        // Calculate node positions
        const positions = calculatePositions(nodes, width, height);

        // Draw connections
        ctx.lineWidth = 1;
        nodes.forEach(node => {
            const nodePos = positions[node.id];
            if (!nodePos) return;

            node.connections.forEach(targetId => {
                const targetPos = positions[targetId];
                if (!targetPos) return;

                const targetNode = nodes.find(n => n.id === targetId);
                const connectionStatus = targetNode?.status || 'healthy';

                ctx.beginPath();
                ctx.moveTo(nodePos.x, nodePos.y);
                ctx.lineTo(targetPos.x, targetPos.y);
                ctx.strokeStyle = connectionStatus === 'healthy'
                    ? colors.connection.healthy
                    : colors.connection.degraded;
                ctx.stroke();
            });
        });

        // Draw nodes
        const nodeRadius = 30;
        nodes.forEach(node => {
            const pos = positions[node.id];
            if (!pos) return;

            const isHovered = hoveredNode === node.id;
            const isSelected = selectedNode?.id === node.id;

            // Draw node circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
            ctx.fillStyle = colors[node.type].fill;
            ctx.fill();
            ctx.lineWidth = isHovered || isSelected ? 3 : 2;
            ctx.strokeStyle = colors[node.type].stroke;
            ctx.stroke();

            // Draw status indicator
            ctx.beginPath();
            ctx.arc(pos.x + nodeRadius * 0.7, pos.y - nodeRadius * 0.7, 5, 0, 2 * Math.PI);
            ctx.fillStyle = colors.status[node.status];
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = isDarkMode ? '#111827' : '#ffffff';
            ctx.stroke();

            // Draw node label
            ctx.font = '12px Inter, sans-serif';
            ctx.fillStyle = colors.text;
            ctx.textAlign = 'center';
            ctx.fillText(node.name, pos.x, pos.y + nodeRadius + 20);

            // Store node data for interaction
            node.position = pos;
            node.radius = nodeRadius;
        });
    };

    // Handle canvas click event
    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicked on a node
        for (const node of nodes) {
            const pos = node.position;
            const radius = node.radius;

            if (pos && radius) {
                const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                if (distance <= radius) {
                    setSelectedNode(node);
                    return;
                }
            }
        }

        // If clicked outside any node, deselect
        setSelectedNode(null);
    };

    // Handle canvas mouse move event
    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if hovering over a node
        let hovered = null;
        for (const node of nodes) {
            const pos = node.position;
            const radius = node.radius;

            if (pos && radius) {
                const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                if (distance <= radius) {
                    hovered = node.id;
                    break;
                }
            }
        }

        setHoveredNode(hovered);
        canvas.style.cursor = hovered ? 'pointer' : 'default';
    };

    // Redraw on window resize, theme change, or nodes update
    useEffect(() => {
        drawVisualization();

        const handleResize = () => {
            drawVisualization();
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [nodes, theme, hoveredNode, selectedNode]);

    return (
        <div className="modern-card h-[600px] p-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-card-foreground">Bagctor Cluster Visualization</h3>
                <div className="flex space-x-2">
                    <button className="btn btn-sm btn-outline">Refresh</button>
                    <button className="btn btn-sm btn-outline">Reset View</button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            ) : error ? (
                <div className="text-destructive p-4 bg-destructive/10 rounded-md">
                    {error}
                </div>
            ) : (
                <div className="flex h-[calc(100%-3rem)]">
                    <div
                        ref={containerRef}
                        className="relative flex-1 rounded-lg border border-border"
                    >
                        <canvas
                            ref={canvasRef}
                            onClick={handleCanvasClick}
                            onMouseMove={handleCanvasMouseMove}
                            className="w-full h-full"
                        />
                    </div>

                    {selectedNode && (
                        <div className="w-64 ml-4 p-4 rounded-lg border border-border bg-card">
                            <div className="flex items-center mb-3">
                                <div className={`w-3 h-3 rounded-full mr-2 bg-${colors.status[selectedNode.status]}`}></div>
                                <h4 className="font-medium">{selectedNode.name}</h4>
                            </div>
                            <div className="space-y-3 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Type:</span>
                                    <span className="ml-2 capitalize">{selectedNode.type}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">IP Address:</span>
                                    <span className="ml-2">{selectedNode.ip}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Status:</span>
                                    <span className={`ml-2 capitalize ${selectedNode.status === 'healthy' ? 'text-success-500' :
                                        selectedNode.status === 'degraded' ? 'text-warning-500' :
                                            'text-destructive'
                                        }`}>
                                        {selectedNode.status}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Connections:</span>
                                    <span className="ml-2">{selectedNode.connections.length}</span>
                                </div>

                                <div className="pt-2">
                                    <div className="mb-1 flex justify-between">
                                        <span className="text-xs text-muted-foreground">CPU Usage</span>
                                        <span className="text-xs">{selectedNode.metrics.cpu}%</span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-bar-fill bg-primary"
                                            style={{ width: `${selectedNode.metrics.cpu}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-1 flex justify-between">
                                        <span className="text-xs text-muted-foreground">Memory Usage</span>
                                        <span className="text-xs">{selectedNode.metrics.memory}%</span>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className="progress-bar-fill bg-secondary"
                                            style={{ width: `${selectedNode.metrics.memory}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-1 flex justify-between">
                                        <span className="text-xs text-muted-foreground">Message Rate</span>
                                        <span className="text-xs">{selectedNode.metrics.messageRate}/s</span>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <button className="btn btn-sm btn-primary w-full">View Details</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-between items-center mt-4 text-xs text-muted-foreground">
                <div className="flex space-x-4">
                    <div className="flex items-center">
                        <div className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: colors.coordinator.stroke }}></div>
                        <span>Coordinator</span>
                    </div>
                    <div className="flex items-center">
                        <div className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: colors.worker.stroke }}></div>
                        <span>Worker</span>
                    </div>
                    <div className="flex items-center">
                        <div className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: colors.actor.stroke }}></div>
                        <span>Actor</span>
                    </div>
                </div>
                <div>
                    <span>Total Nodes: {nodes.length}</span>
                </div>
            </div>
        </div>
    );
};

export default ClusterVisualization; 