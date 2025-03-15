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
    const [draggedNode, setDraggedNode] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [positions, setPositions] = useState<Record<string, Position>>({});
    const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
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

    // Initialize positions when nodes change
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const { width, height } = container.getBoundingClientRect();
        const initialPositions = calculatePositions(nodes, width, height);
        setPositions(initialPositions);
    }, [nodes]);

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

        // Initialize positions if not set yet
        if (Object.keys(positions).length === 0) {
            const initialPositions = calculatePositions(nodes, width, height);
            setPositions(initialPositions);
        }

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
            const isDragged = draggedNode === node.id;

            // Draw node circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, nodeRadius, 0, 2 * Math.PI);
            ctx.fillStyle = isDragged
                ? `${colors[node.type].fill.split(')')[0]}, 0.3)`
                : colors[node.type].fill;
            ctx.fill();
            ctx.lineWidth = isHovered || isSelected || isDragged ? 3 : 2;
            ctx.strokeStyle = isDragged
                ? 'rgba(99, 102, 241, 0.8)' // Dragged node highlight color
                : colors[node.type].stroke;
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
            const pos = positions[node.id];
            if (!pos) continue;

            const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
            if (distance <= (node.radius || 30)) {
                setSelectedNode(node);
                return;
            }
        }

        // If clicked outside any node, deselect
        setSelectedNode(null);
    };

    // Handle mouse down for drag start
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicked on a node to start dragging
        for (const node of nodes) {
            const pos = positions[node.id];
            if (!pos) continue;

            const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
            if (distance <= (node.radius || 30)) {
                setDraggedNode(node.id);
                setIsDragging(true);
                setDragOffset({
                    x: pos.x - x,
                    y: pos.y - y
                });
                return;
            }
        }
    };

    // Handle mouse move for dragging
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Update node position during drag
        if (isDragging && draggedNode) {
            setPositions(prev => ({
                ...prev,
                [draggedNode]: {
                    x: x + dragOffset.x,
                    y: y + dragOffset.y
                }
            }));
        }

        // Handle hover state
        if (!isDragging) {
            let hovered = null;
            for (const node of nodes) {
                const pos = positions[node.id];
                if (!pos) continue;

                const distance = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
                if (distance <= (node.radius || 30)) {
                    hovered = node.id;
                    break;
                }
            }

            setHoveredNode(hovered);
            canvas.style.cursor = hovered ? 'grab' : 'default';
        } else {
            canvas.style.cursor = 'grabbing';
        }
    };

    // Handle mouse up to end dragging
    const handleMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
            setDraggedNode(null);
        }
    };

    // Handle mouse leave to cancel dragging
    const handleMouseLeave = () => {
        if (isDragging) {
            setIsDragging(false);
            setDraggedNode(null);
        }
    };

    // Reset node positions
    const resetPositions = () => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const { width, height } = container.getBoundingClientRect();
        const initialPositions = calculatePositions(nodes, width, height);
        setPositions(initialPositions);
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
    }, [nodes, theme, hoveredNode, selectedNode, positions, draggedNode, isDragging]);

    return (
        <div className="modern-card h-[600px] p-4">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-card-foreground">Bagctor Cluster Visualization</h3>
                <div className="flex space-x-2">
                    <button className="btn btn-sm btn-outline">Refresh</button>
                    <button
                        className="btn btn-sm btn-outline"
                        onClick={resetPositions}
                    >
                        Reset View
                    </button>
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
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseLeave}
                            className="w-full h-full"
                        />
                        {isDragging && (
                            <div className="absolute bottom-4 left-4 bg-background/90 p-2 rounded-md text-sm text-muted-foreground shadow-sm border border-border">
                                Dragging node...
                            </div>
                        )}
                    </div>

                    {selectedNode && (
                        <div className="w-72 ml-4 p-4 border border-border rounded-lg bg-card text-card-foreground overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium">{selectedNode.name}</h3>
                                <div className={`px-2 py-1 text-xs rounded-full ${selectedNode.status === 'healthy' ? 'bg-success-100 text-success-800 dark:bg-success-900/20 dark:text-success-300' :
                                    selectedNode.status === 'degraded' ? 'bg-warning-100 text-warning-800 dark:bg-warning-900/20 dark:text-warning-300' :
                                        'bg-danger-100 text-danger-800 dark:bg-danger-900/20 dark:text-danger-300'
                                    }`}>
                                    {selectedNode.status}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <span className="text-sm text-muted-foreground">Type:</span>
                                    <span className="ml-2 capitalize">{selectedNode.type}</span>
                                </div>
                                <div>
                                    <span className="text-sm text-muted-foreground">IP Address:</span>
                                    <span className="ml-2">{selectedNode.ip}</span>
                                </div>
                                <div>
                                    <span className="text-sm text-muted-foreground">Connections:</span>
                                    <span className="ml-2">{selectedNode.connections.length}</span>
                                </div>

                                <div className="pt-2 border-t border-border">
                                    <h4 className="text-sm font-medium mb-2">Metrics</h4>
                                    <div className="space-y-2">
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span>CPU Usage</span>
                                                <span>{selectedNode.metrics.cpu}%</span>
                                            </div>
                                            <div className="w-full bg-muted rounded-full h-1.5">
                                                <div
                                                    className="bg-primary h-1.5 rounded-full"
                                                    style={{ width: `${selectedNode.metrics.cpu}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span>Memory Usage</span>
                                                <span>{selectedNode.metrics.memory}%</span>
                                            </div>
                                            <div className="w-full bg-muted rounded-full h-1.5">
                                                <div
                                                    className="bg-secondary h-1.5 rounded-full"
                                                    style={{ width: `${selectedNode.metrics.memory}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span>Message Rate</span>
                                                <span>{selectedNode.metrics.messageRate}/s</span>
                                            </div>
                                            <div className="w-full bg-muted rounded-full h-1.5">
                                                <div
                                                    className="bg-success h-1.5 rounded-full"
                                                    style={{ width: `${Math.min(selectedNode.metrics.messageRate / 2, 100)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
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