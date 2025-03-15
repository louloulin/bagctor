import React from 'react';
import Layout from '../components/layout/Layout';
import ClusterVisualization from '../components/cluster/ClusterVisualization';

const ClusterPage: React.FC = () => {
    return (
        <Layout title="Cluster Visualization - Bagctor Monitoring Dashboard">
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-card-foreground">Distributed System Visualization</h1>

                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <span className="text-sm text-muted-foreground">Auto-refresh:</span>
                            <select className="bg-card border border-border rounded-md text-sm p-1 focus-ring">
                                <option value="off">Off</option>
                                <option value="10">10s</option>
                                <option value="30">30s</option>
                                <option value="60">1m</option>
                            </select>
                        </div>

                        <button className="btn btn-sm btn-primary">
                            <svg className="h-4 w-4 mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                            </svg>
                            Refresh Now
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="modern-card p-4">
                        <h3 className="text-lg font-semibold mb-4 text-card-foreground">Cluster Status</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Total Nodes</span>
                                <span className="text-xl font-semibold">5</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Healthy</span>
                                <div className="flex items-center">
                                    <div className="w-3 h-3 rounded-full bg-success-500 mr-2"></div>
                                    <span>3</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Degraded</span>
                                <div className="flex items-center">
                                    <div className="w-3 h-3 rounded-full bg-warning-500 mr-2"></div>
                                    <span>1</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Offline</span>
                                <div className="flex items-center">
                                    <div className="w-3 h-3 rounded-full bg-destructive mr-2"></div>
                                    <span>1</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="modern-card p-4">
                        <h3 className="text-lg font-semibold mb-4 text-card-foreground">Message Flow</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Total Messages</span>
                                <span className="text-xl font-semibold">3,320/s</span>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                    <span>By Type</span>
                                    <span>Messages/s</span>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm">Actor Messages</span>
                                        <span className="text-sm">2,150</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm">Task Messages</span>
                                        <span className="text-sm">950</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm">System Messages</span>
                                        <span className="text-sm">220</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="modern-card p-4">
                        <h3 className="text-lg font-semibold mb-4 text-card-foreground">Network Health</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Avg. Latency</span>
                                <span className="text-xl font-semibold">5.2ms</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Network Partitions</span>
                                <span className="badge badge-success">None</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Connection Issues</span>
                                <span className="badge badge-warning">1 Degraded</span>
                            </div>
                        </div>
                    </div>
                </div>

                <ClusterVisualization />

                <div className="modern-card p-4">
                    <h3 className="text-lg font-semibold mb-4 text-card-foreground">Recent Events</h3>
                    <div className="space-y-3">
                        <div className="flex items-start">
                            <div className="status-indicator bg-warning-500 mt-1">
                                <div className="status-indicator-pulse bg-warning-500"></div>
                            </div>
                            <div>
                                <div className="flex justify-between">
                                    <span className="font-medium">Worker-2 Performance Degraded</span>
                                    <span className="text-xs text-muted-foreground">2 min ago</span>
                                </div>
                                <p className="text-sm text-muted-foreground">High CPU usage detected (85%). Auto-scaling triggered.</p>
                            </div>
                        </div>

                        <div className="flex items-start">
                            <div className="status-indicator bg-destructive mt-1">
                                <div className="status-indicator-pulse bg-destructive"></div>
                            </div>
                            <div>
                                <div className="flex justify-between">
                                    <span className="font-medium">Actor-Host-2 Offline</span>
                                    <span className="text-xs text-muted-foreground">15 min ago</span>
                                </div>
                                <p className="text-sm text-muted-foreground">Node disconnected. Actor instances relocated to Actor-Host-1.</p>
                            </div>
                        </div>

                        <div className="flex items-start">
                            <div className="status-indicator bg-success-500 mt-1">
                                <div className="status-indicator-pulse bg-success-500"></div>
                            </div>
                            <div>
                                <div className="flex justify-between">
                                    <span className="font-medium">Worker-1 Added to Cluster</span>
                                    <span className="text-xs text-muted-foreground">30 min ago</span>
                                </div>
                                <p className="text-sm text-muted-foreground">New worker node successfully added to the cluster.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default ClusterPage; 