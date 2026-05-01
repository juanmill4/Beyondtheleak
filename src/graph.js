/**
 * DarkEye Graph Visualization
 * Manages vis-network graph rendering and interactions
 */
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

// -- Color Palette for groups --
const GROUP_COLORS = [
    '#00d4ff', '#ff3366', '#00e676', '#ffab00', '#b388ff',
    '#ff6e40', '#18ffff', '#eeff41', '#ff80ab', '#69f0ae',
    '#7c4dff', '#ffd740', '#448aff', '#ff5252', '#64ffda',
];

// Helper to calculate a color with opacity
function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Convert country code or name to emoji flag
export function countryToFlag(country) {
    if (!country) return '';

    const cleanCountry = country.trim().toUpperCase();

    // If it's a 2-letter country code
    if (cleanCountry.length === 2) {
        return cleanCountry.replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
    }
    // Hardcode some common names based on data
    const map = {
        'SPAIN': '🇪🇸', 'UNITED STATES': '🇺🇸', 'UNITED KINGDOM': '🇬🇧', 'FRANCE': '🇫🇷',
        'GERMANY': '🇩🇪', 'ITALY': '🇮🇹', 'PORTUGAL': '🇵🇹', 'MEXICO': '🇲🇽', 'BRAZIL': '🇧🇷',
        'RUSSIA': '🇷🇺', 'CHINA': '🇨🇳', 'JAPAN': '🇯🇵', 'INDIA': '🇮🇳', 'CANADA': '🇨🇦',
        'AUSTRALIA': '🇦🇺', 'ARGENTINA': '🇦🇷', 'COLOMBIA': '🇨🇴', 'PERU': '🇵🇪', 'CHILE': '🇨🇱',
        'POLAND': '🇵🇱', 'NETHERLANDS': '🇳🇱', 'TURKEY': '🇹🇷'
    };
    return map[cleanCountry] || '';
}


function getGroupColor(groupName) {
    let hash = 0;
    for (let i = 0; i < groupName.length; i++) {
        hash = groupName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

export class GraphManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.nodesDataset = new DataSet();
        this.edgesDataset = new DataSet();
        this.network = null;
        this.allNodesData = [];   // Original data for filtering
        this.allEdgesData = [];
        this.deletedNodes = new Map();  // id -> node data
        this.nodeHistory = [];    // { action, nodeId, data, timestamp }
        this.actionStack = [];    // For bulk Undo (Ctrl+Z)
        this.redoStack = [];      // For bulk Redo (Ctrl+Y)
        this.selectedNodeId = null;
        this.connectionMode = false;
        this.connectionSourceId = null;
        this.layoutMode = 'centralized'; // 'centralized' or 'hierarchical'

        // Callbacks
        this.onNodeSelect = null;
        this.onNodeDeselect = null;
        this.onNodeContextMenu = null;
        this.onNodeDoubleClick = null;
        this.onSuperuserDoubleClick = null; // Callback for superuser popup

        // Exploration tracking
        this.explorationNodeIds = new Set();
        this.explorationEdgeIds = new Set();
        this.explorationVisible = true;
        this.exploredUserIds = new Set();
    }


    init() {
        const options = {
            physics: {
                enabled: true,
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                    gravitationalConstant: -60,
                    centralGravity: 0.008,
                    springLength: 150,
                    springConstant: 0.04,
                    damping: 0.9, // Default to Fast
                    avoidOverlap: 0.5,
                },
                hierarchicalRepulsion: {
                    centralGravity: 0.0,
                    springLength: 100,
                    springConstant: 0.01,
                    nodeDistance: 150,
                    damping: 0.09
                },
                stabilization: {
                    enabled: true,
                    iterations: 200,
                    updateInterval: 25,
                },
                maxVelocity: 30,
                minVelocity: 0.5,
            },
            layout: {
                hierarchical: {
                    enabled: false,
                    direction: 'UD',
                    sortMethod: 'directed',
                    levelSeparation: 150,
                    nodeSpacing: 100,
                    treeSpacing: 200,
                }
            },
            interaction: {
                hover: true,
                tooltipDelay: 200,
                dragNodes: true,
                dragView: true,
                zoomView: true,
                multiselect: true, // Enabled for ctx-remove-group and copy group
            },
            edges: {
                smooth: {
                    type: 'continuous',
                    roundness: 0.3,
                },
                width: 1.2,
                color: {
                    color: 'rgba(100, 116, 139, 0.35)',
                    highlight: 'rgba(0, 212, 255, 0.6)',
                    hover: 'rgba(0, 212, 255, 0.4)',
                },
                selectionWidth: 2,
            },
            nodes: {
                borderWidth: 2,
                borderWidthSelected: 3,
                font: {
                    color: '#e2e8f0',
                    face: 'Inter, sans-serif',
                    size: 12,
                },
                widthConstraint: { maximum: 300 },
                shadow: {
                    enabled: true,
                    color: 'rgba(0,0,0,0.3)',
                    size: 8,
                    x: 0,
                    y: 2,
                },
            },
            groups: {
                domainPrimary: {
                    shape: 'hexagon',
                    size: 40,
                    color: {
                        background: 'rgba(68, 138, 255, 0.15)',
                        border: '#448aff',
                        highlight: { background: 'rgba(68, 138, 255, 0.25)', border: '#448aff' },
                        hover: { background: 'rgba(68, 138, 255, 0.25)', border: '#448aff' },
                    },
                    font: { size: 16, color: '#448aff', bold: true },
                    shadow: { enabled: true, color: 'rgba(68, 138, 255, 0.3)', size: 15 },
                    borderWidth: 3,
                },
                domainSecondary: {
                    shape: 'hexagon',
                    size: 30,
                    color: {
                        background: 'rgba(226, 232, 240, 0.08)',
                        border: '#e2e8f0',
                        highlight: { background: 'rgba(226, 232, 240, 0.15)', border: '#f1f5f9' },
                        hover: { background: 'rgba(226, 232, 240, 0.15)', border: '#f1f5f9' },
                    },
                    font: { size: 14, color: '#e2e8f0', bold: true },
                    shadow: { enabled: true, color: 'rgba(226, 232, 240, 0.15)', size: 10 },
                    borderWidth: 2,
                },
                domain: {
                    shape: 'hexagon',
                    size: 40,
                    color: {
                        background: 'rgba(68, 138, 255, 0.15)',
                        border: '#448aff',
                        highlight: { background: 'rgba(68, 138, 255, 0.25)', border: '#448aff' },
                        hover: { background: 'rgba(68, 138, 255, 0.25)', border: '#448aff' },
                    },
                    font: { size: 16, color: '#448aff', bold: true },
                    shadow: { enabled: true, color: 'rgba(68, 138, 255, 0.3)', size: 15 },
                    borderWidth: 3,
                },
                servicePrimary: {
                    shape: 'square',
                    size: 25,
                    color: {
                        background: 'rgba(68, 138, 255, 0.15)',
                        border: '#448aff',
                        highlight: { background: 'rgba(68, 138, 255, 0.25)', border: '#448aff' },
                        hover: { background: 'rgba(68, 138, 255, 0.25)', border: '#448aff' },
                    },
                    font: { size: 10, color: '#448aff' },
                    borderWidth: 2,
                },
                service: {
                    shape: 'square',
                    size: 25,
                    font: { size: 10, color: '#f1f5f9' },
                    borderWidth: 2,
                },
                userEmployee: {
                    shape: 'dot',
                    size: 17,
                    color: {
                        background: 'transparent',
                        border: '#448aff',
                        highlight: { background: 'rgba(68, 138, 255, 0.15)', border: '#448aff' },
                        hover: { background: 'rgba(68, 138, 255, 0.1)', border: '#448aff' },
                    },
                    font: { size: 9, color: '#448aff' },
                    borderWidth: 1.5,
                },
                userExternal: {
                    shape: 'dot',
                    size: 15,
                    color: {
                        background: 'transparent',
                        border: '#e2e8f0',
                        highlight: { background: 'rgba(226, 232, 240, 0.15)', border: '#f1f5f9' },
                        hover: { background: 'rgba(226, 232, 240, 0.1)', border: '#f1f5f9' },
                    },
                    font: { size: 9, color: '#e2e8f0' },
                    borderWidth: 1.5,
                },
                userIdentifiable: {
                    shape: 'dot',
                    size: 17,
                    color: {
                        background: 'transparent',
                        border: '#00e676',
                        highlight: { background: 'rgba(0, 230, 118, 0.25)', border: '#00e676' },
                        hover: { background: 'rgba(0, 230, 118, 0.1)', border: '#00e676' },
                    },
                    font: { size: 9, color: '#00e676' },
                    borderWidth: 1.5,
                },
                userPossibleIdentifiable: {
                    shape: 'dot',
                    size: 16,
                    color: {
                        background: 'transparent',
                        border: '#ffab00',
                        highlight: { background: 'rgba(255, 171, 0, 0.25)', border: '#ffab00' },
                        hover: { background: 'rgba(255, 171, 0, 0.1)', border: '#ffab00' },
                    },
                    font: { size: 9, color: '#ffab00' },
                    borderWidth: 1.5,
                },
                userNonIdentifiable: {
                    shape: 'dot',
                    size: 14,
                    color: {
                        background: 'rgba(100, 116, 139, 0.15)',
                        border: '#64748b',
                        highlight: { background: 'rgba(100, 116, 139, 0.25)', border: '#94a3b8' },
                        hover: { background: 'rgba(100, 116, 139, 0.25)', border: '#94a3b8' },
                    },
                    font: { size: 9, color: '#64748b' },
                    borderWidth: 1.5,
                },
                userContext: {
                    shape: 'dot',
                    size: 16,
                    color: {
                        background: 'rgba(255, 51, 102, 0.15)',
                        border: '#ff3366',
                        highlight: { background: 'rgba(255, 51, 102, 0.25)', border: '#ff3366' },
                        hover: { background: 'rgba(255, 51, 102, 0.25)', border: '#ff3366' },
                    },
                    font: { size: 9, color: '#ff3366', bold: true },
                    borderWidth: 1.5,
                },
                user: {
                    shape: 'dot',
                    size: 15,
                    color: {
                        background: '#1e293b',
                        border: '#64748b',
                        highlight: { background: '#334155', border: '#94a3b8' },
                        hover: { background: '#334155', border: '#94a3b8' },
                    },
                    font: { size: 9, color: '#94a3b8' },
                    borderWidth: 1.5,
                },
                userOrg: {
                    shape: 'dot',
                    size: 17,
                    color: {
                        background: 'rgba(68, 138, 255, 0.15)',
                        border: '#448aff',
                        highlight: { background: 'rgba(68, 138, 255, 0.25)', border: '#448aff' },
                        hover: { background: 'rgba(68, 138, 255, 0.25)', border: '#448aff' },
                    },
                    font: { size: 9, color: '#448aff' },
                    borderWidth: 1.5,
                },
                userDeleted: {
                    shape: 'dot',
                    size: 12,
                    color: {
                        background: 'rgba(255, 51, 102, 0.1)',
                        border: 'rgba(255, 51, 102, 0.4)',
                        highlight: { background: 'rgba(255, 51, 102, 0.2)', border: '#ff3366' },
                        hover: { background: 'rgba(255, 51, 102, 0.2)', border: '#ff3366' },
                    },
                    font: { size: 9, color: 'rgba(255, 51, 102, 0.6)' },
                    borderWidth: 1,
                },
                superuserOrg: {
                    shape: 'triangle',
                    size: 28,
                    color: {
                        background: 'transparent',
                        border: '#448aff',
                        highlight: { background: 'rgba(68, 138, 255, 0.15)', border: '#448aff' },
                        hover: { background: 'rgba(68, 138, 255, 0.1)', border: '#448aff' },
                    },
                    font: { size: 11, color: '#448aff', bold: true },
                    shadow: { enabled: true, color: 'rgba(68, 138, 255, 0.25)', size: 12 },
                    borderWidth: 2.5,
                },
                superuserExternal: {
                    shape: 'triangle',
                    size: 25,
                    color: {
                        background: 'transparent',
                        border: '#e2e8f0',
                        highlight: { background: 'rgba(226, 232, 240, 0.15)', border: '#f1f5f9' },
                        hover: { background: 'rgba(226, 232, 240, 0.1)', border: '#f1f5f9' },
                    },
                    font: { size: 11, color: '#e2e8f0' },
                    shadow: { enabled: true, color: 'rgba(226, 232, 240, 0.15)', size: 10 },
                    borderWidth: 2,
                },
                superuserIdentifiable: {
                    shape: 'triangle',
                    size: 28,
                    color: {
                        background: 'transparent',
                        border: '#00e676',
                        highlight: { background: 'rgba(0, 230, 118, 0.15)', border: '#00e676' },
                        hover: { background: 'rgba(0, 230, 118, 0.1)', border: '#00e676' },
                    },
                    font: { size: 11, color: '#00e676', bold: true },
                    shadow: { enabled: true, color: 'rgba(0, 230, 118, 0.25)', size: 12 },
                    borderWidth: 2.5,
                },
                superuserPossibleIdentifiable: {
                    shape: 'triangle',
                    size: 26,
                    color: {
                        background: 'transparent',
                        border: '#ffab00',
                        highlight: { background: 'rgba(255, 171, 0, 0.15)', border: '#ffab00' },
                        hover: { background: 'rgba(255, 171, 0, 0.1)', border: '#ffab00' },
                    },
                    font: { size: 11, color: '#ffab00', bold: true },
                    shadow: { enabled: true, color: 'rgba(255, 171, 0, 0.25)', size: 12 },
                    borderWidth: 2.5,
                },
                superuserNonIdentifiable: {
                    shape: 'triangle',
                    size: 24,
                    color: {
                        background: 'transparent',
                        border: '#64748b',
                        highlight: { background: 'rgba(100, 116, 139, 0.15)', border: '#94a3b8' },
                        hover: { background: 'rgba(100, 116, 139, 0.1)', border: '#94a3b8' },
                    },
                    font: { size: 11, color: '#64748b' },
                    shadow: { enabled: true, color: 'rgba(100, 116, 139, 0.15)', size: 10 },
                    borderWidth: 2,
                },
                superuserContext: {
                    shape: 'triangle',
                    size: 26,
                    color: {
                        background: 'transparent',
                        border: '#ff3366',
                        highlight: { background: 'rgba(255, 51, 102, 0.15)', border: '#ff3366' },
                        hover: { background: 'rgba(255, 51, 102, 0.1)', border: '#ff3366' },
                    },
                    font: { size: 11, color: '#ff3366', bold: true },
                    shadow: { enabled: true, color: 'rgba(255, 51, 102, 0.25)', size: 12 },
                    borderWidth: 2.5,
                },
            },
        };

        this.network = new Network(
            this.container,
            { nodes: this.nodesDataset, edges: this.edgesDataset },
            options
        );

        // Event handlers
        this.network.on('click', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                this._handleNodeClick(nodeId);
            } else {
                this._handleDeselect();
            }
        });

        this.network.on('doubleClick', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const nodeData = this._getNodeData(nodeId);
                if (nodeData && this.onNodeDoubleClick) {
                    this.onNodeDoubleClick(nodeId, nodeData);
                } else {
                    const pos = this.network.getPositions([nodeId])[nodeId];
                    if (pos) {
                        this.network.moveTo({
                            position: pos,
                            scale: 1.2,
                            animation: { duration: 400, easingFunction: 'easeInOutQuad' },
                        });
                    }
                }
            }
        });

        // Right-click context menu
        this.network.on('oncontext', (params) => {
            params.event.preventDefault();
            const nodeId = this.network.getNodeAt(params.pointer.DOM);
            if (nodeId) {
                const nodeData = this._getNodeData(nodeId);
                if (nodeData && this.onNodeContextMenu) {
                    this.onNodeContextMenu({
                        nodeId,
                        nodeData,
                        x: params.event.clientX || params.pointer.DOM.x,
                        y: params.event.clientY || params.pointer.DOM.y,
                    });
                }
            } else {
                const edgeId = this.network.getEdgeAt(params.pointer.DOM);
                if (edgeId && this.onEdgeContextMenu) {
                    this.onEdgeContextMenu({
                        edgeId,
                        x: params.event.clientX || params.pointer.DOM.x,
                        y: params.event.clientY || params.pointer.DOM.y,
                    });
                }
            }
        });
    }

    loadData(processedData) {
        // Deduplicate nodes resolving identical alphanumeric generation collisions
        const uniqueNodesMap = new Map();
        for (const node of processedData.nodes) {
            if (!uniqueNodesMap.has(node.id)) {
                uniqueNodesMap.set(node.id, node);
            } else {
                console.warn(`[GraphManager] Deduplicating node ID collision: ${node.id}`);
            }
        }
        this.allNodesData = Array.from(uniqueNodesMap.values());
        this.allEdgesData = processedData.edges;
        this.deletedNodes.clear();
        this.nodeHistory = [];
        this.explorationNodeIds.clear();
        this.explorationEdgeIds.clear();
        this.exploredUserIds.clear();
        this.explorationVisible = true;

        const visNodes = this.allNodesData.map((n) => this._toVisNode(n));
        const visEdges = this.allEdgesData.map((e, i) => this._toVisEdge(e, i));

        this.nodesDataset.clear();
        this.edgesDataset.clear();
        this.nodesDataset.add(visNodes);
        this.edgesDataset.add(visEdges);

        this.network.fit();
    }

    appendData(processedData) {
        let newNodesCount = 0;
        let newEdgesCount = 0;

        // Deduplicate incoming nodes and check against existing
        const existingNodeIds = new Set(this.allNodesData.map(n => n.id));
        const nodesToAdd = [];

        for (const node of processedData.nodes) {
            if (!existingNodeIds.has(node.id)) {
                existingNodeIds.add(node.id);
                this.allNodesData.push(node);
                nodesToAdd.push(this._toVisNode(node));
                newNodesCount++;
            }
        }

        // Deduplicate incoming edges and check against existing
        const existingEdgeIds = new Set(this.allEdgesData.map(e => `${e.from}_${e.to}_${e.type}`));
        const edgesToAdd = [];
        const startIndex = this.allEdgesData.length;

        for (let i = 0; i < processedData.edges.length; i++) {
            const edge = processedData.edges[i];
            const edgeKey = `${edge.from}_${edge.to}_${edge.type}`;
            if (!existingEdgeIds.has(edgeKey)) {
                existingEdgeIds.add(edgeKey);
                this.allEdgesData.push(edge);
                edgesToAdd.push(this._toVisEdge(edge, startIndex + i));
                newEdgesCount++;
            }
        }

        if (nodesToAdd.length > 0) {
            this.nodesDataset.add(nodesToAdd);
        }
        if (edgesToAdd.length > 0) {
            this.edgesDataset.add(edgesToAdd);
        }

        if (nodesToAdd.length > 0 || edgesToAdd.length > 0) {
            this.network.fit();
            console.log(`[GraphManager] Appended ${newNodesCount} nodes and ${newEdgesCount} edges.`);
        }

        return { newNodes: newNodesCount, newEdges: newEdgesCount };
    }

    _toVisNode(node) {
        const levelMap = {
            'domain': 0,
            'service': 1,
            'superuser': 2,
            'user': 3
        };

        const base = {
            id: node.id,
            label: this._truncateLabel(node.label, 25),
            title: this._buildTooltip(node),
            _data: node,
            level: levelMap[node.type] !== undefined ? levelMap[node.type] : (node.type === 'crypto_address' ? (node._isDetailWallet ? 4 : 5) : 4),
        };
        if (node.hidden !== undefined) base.hidden = node.hidden;

        if (node.type === 'domain') {
            // All primary hubs render as identical blue hexagons via domainPrimary group
            base.group = 'domainPrimary';
            if (node.isHub) {
                const isEmail = node.label.includes('@');
                base.label = isEmail ? `✉️ ${node.label}` : `👤 ${node.label}`;
            } else {
                base.label = `🌐 ${node.label}`;
            }
        } else if (node.type === 'service') {
            // Subdomains of primary domain = blue squares
            // External services = colored squares based on hostname
            if (node.isLinkedToDomain) {
                base.group = 'servicePrimary';
                const icon = node.sourceType === 'stealer' ? '🔒' : '🌐';
                base.label = `${icon} ${this._truncateLabel(node.label, 20)}`;
                if (node.sourceType === 'stealer') {
                    base.shape = 'diamond';
                }
            } else {
                base.group = 'service';
                // External services = pink
                const color = '#ff69b4';
                base.color = {
                    background: hexToRgba(color, 0.15),
                    border: color,
                    highlight: { background: hexToRgba(color, 0.25), border: color },
                    hover: { background: hexToRgba(color, 0.25), border: color },
                };
                base.font = { size: 10, color: color };
                const icon = node.sourceType === 'stealer' ? '🔒' : '🌐';
                base.label = `${icon} ${this._truncateLabel(node.label, 20)}`;
                if (node.sourceType === 'stealer') {
                    base.shape = 'diamond';
                } else {
                    // External services are hexagons (pink)
                    base.shape = 'hexagon';
                    base.size = 22;
                }
            }
        } else if (node.type === 'user') {
            const userIcon = node.isOrgEmail ? '✓' : '';
            const flag = node.country ? `${countryToFlag(node.country)} ` : '';
            base.label = `${flag}${userIcon}👤 ${node.label}`;

            // Context evaluation for RED highlighting
            const hasContextData = node.explorationData && (
                (node.explorationData.context && node.explorationData.context.length > 0) ||
                (node.explorationData.emailContexts && Object.keys(node.explorationData.emailContexts).length > 0) ||
                (node.explorationData.contexts && Object.keys(node.explorationData.contexts).length > 0)
            );

            if (node.deleted) {
                base.group = 'userDeleted';
            } else if (node.identifiable === true) {
                // After AI analysis: identifiable = green
                base.group = 'userIdentifiable';
            } else if (node.possibleIdentifiable === true) {
                // After AI analysis: possible identifiable = amber
                base.group = 'userPossibleIdentifiable';
                base.label = `${flag}?${userIcon}👤 ${node.label}`;
            } else if (node.identifiable === false) {
                // After AI analysis: non-identifiable = grey
                base.group = 'userNonIdentifiable';
            } else if (node.isOrgEmail) {
                // Employee = blue circle
                base.group = 'userEmployee';
            } else {
                // Non-employee = white circle
                base.group = 'userExternal';
            }
        } else if (node.type === 'superuser') {
            const userCount = node.linkedUserIds ? node.linkedUserIds.length : 0;
            const flag = node.country ? `${countryToFlag(node.country)} ` : '';
            base.label = `${flag}🔗 Superuser (${userCount})`;

            // Context evaluation for RED highlighting
            const hasContextData = node.explorationData && (
                (node.explorationData.context && node.explorationData.context.length > 0) ||
                (node.explorationData.emailContexts && Object.keys(node.explorationData.emailContexts).length > 0) ||
                (node.explorationData.contexts && Object.keys(node.explorationData.contexts).length > 0)
            );

            // Select group based on AI analysis result
            if (node.aiAnalysis) {
                if (node.aiAnalysis.identifiable) {
                    base.group = 'superuserIdentifiable';
                } else if (node.aiAnalysis.possibleIdentifiable) {
                    base.group = 'superuserPossibleIdentifiable';
                } else {
                    base.group = 'superuserNonIdentifiable';
                }
            } else {
                base.group = node.isOrgSuperuser ? 'superuserOrg' : 'superuserExternal';
            }
        } else if (['user_detail', 'user_detail_phone', 'user_detail_service', 'social_profile', 'social_post'].includes(node.type)) {
            // Detail nodes: pass through visual properties from node data
            base.label = node.label || '';
            if (node.title) base.title = node.title;
            if (node.shape) base.shape = node.shape;
            if (node.color) base.color = node.color;
            if (node.image) base.image = node.image;
            if (node.brokenImage) base.brokenImage = node.brokenImage;
            if (node.size !== undefined) base.size = node.size;
            if (node.icon) base.icon = node.icon;
            if (node.font) base.font = node.font;
        } else if (node.type === 'crypto_address') {
            // Crypto destination address node
            const truncAddr = node.label ? (node.label.length > 12 ? node.label.slice(0, 6) + '…' + node.label.slice(-4) : node.label) : '?';
            base.label = `₿ ${truncAddr}`;
            base.title = this._buildTooltip(node);
            if (node.image) {
                base.shape = 'image';
                base.image = node.image;
                base.size = node.size || 16;
            } else {
                base.shape = 'dot';
                base.size = 14;
            }
            // Grey styling if zero balance, orange if has balance
            const hasBalance = node.cryptoBalance && node.cryptoBalance > 0;
            const borderColor = hasBalance ? '#f7931a' : '#64748b';
            base.color = {
                background: hasBalance ? 'rgba(247, 147, 26, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                border: borderColor,
                highlight: { background: hasBalance ? 'rgba(247, 147, 26, 0.25)' : 'rgba(100, 116, 139, 0.25)', border: borderColor },
                hover: { background: hasBalance ? 'rgba(247, 147, 26, 0.25)' : 'rgba(100, 116, 139, 0.25)', border: borderColor },
            };
            base.font = { size: 10, color: borderColor, face: 'Inter' };
        }

        // Global Context Evaluation for Universal RED Highlighting
        let hasContextData = false;
        const ed = node.explorationData || node._explorationData;
        const ctx1 = node.context;
        const ctx2 = ed?.context;
        const ctx3 = ed?.emailContexts;
        const ctx4 = ed?.contexts;
        const ctx5 = node.emailContexts;

        const isValidString = (s) => typeof s === 'string' && s.trim().length > 0 && s.trim() !== '[]' && s.trim() !== '{}' && s.trim() !== '""';
        const isValidObject = (o) => o && typeof o === 'object' && Object.keys(o).length > 0 && !Array.isArray(o);
        const isValidArray = (a) => Array.isArray(a) && a.length > 0 && a.some(item => (typeof item === 'string' ? isValidString(item) : isValidObject(item) || (Array.isArray(item) && item.length > 0)));

        if (isValidString(ctx1) || isValidArray(ctx1) || isValidObject(ctx1)) hasContextData = true;
        if (isValidString(ctx2) || isValidArray(ctx2) || isValidObject(ctx2)) hasContextData = true;

        // emailContexts and contexts are usually arrays/objects
        if (isValidArray(ctx3) || isValidObject(ctx3)) hasContextData = true;
        if (isValidArray(ctx4) || isValidObject(ctx4)) hasContextData = true;
        if (isValidArray(ctx5) || isValidObject(ctx5)) hasContextData = true;

        if (hasContextData) {
            const redColor = '#ff3366';
            const fontSize = base.font && base.font.size ? base.font.size : 12;
            // Only override font color to red, preserving native group shape/color
            base.font = { size: fontSize, color: redColor, bold: true };
            // Add a subtle red aura shadow behind the node to enhance visibility
            base.shadow = { enabled: true, color: 'rgba(255, 51, 102, 0.6)', size: 8, x: 0, y: 0 };
        }

        return base;
    }

    _toVisEdge(edge, index) {
        const base = {
            id: `edge_${index}_${edge.from}_${edge.to}`,
            from: edge.from,
            to: edge.to,
            _data: edge,
        };
        if (edge.hidden !== undefined) base.hidden = edge.hidden;

        if (edge.type === 'domain-service') {
            base.width = 2;
            base.color = { color: 'rgba(0, 212, 255, 0.25)' };
            base.dashes = false;
        } else if (edge.type === 'service-user') {
            base.width = 1;
            base.color = { color: 'rgba(100, 116, 139, 0.2)' };
        } else if (edge.type === 'direct-org-user') {
            base.width = 2;
            base.color = { color: 'rgba(0, 230, 118, 0.3)' };
            base.dashes = [10, 5];
        } else if (edge.type === 'user-user') {
            base.width = 1.5;
            base.color = { color: 'rgba(179, 136, 255, 0.4)' };
            base.dashes = [5, 5];
        } else if (edge.type === 'domain-domain') {
            base.width = 2;
            base.color = { color: 'rgba(0, 212, 255, 0.15)' };
            base.dashes = true;
        } else if (edge.type === 'superuser-user') {
            base.width = 1.5;
            base.color = { color: 'rgba(68, 138, 255, 0.3)' };
            base.dashes = [3, 3];
        } else if (edge.type === 'superuser-new-user') {
            base.width = 1.5;
            base.color = { color: 'rgba(255, 171, 0, 0.5)' }; // Orange distinguishing new pivot users
            base.dashes = [5, 5];
        } else if (edge.type === 'detail-link') {
            base.width = 1;
            base.color = { color: 'rgba(0, 212, 255, 0.2)' };
            base.dashes = [2, 4];
        } else if (edge.type === 'crypto-link') {
            base.width = 1.5;
            base.color = { color: 'rgba(247, 147, 26, 0.4)' }; // Bitcoin orange
            base.dashes = [4, 4];
        }

        return base;
    }

    _truncateLabel(label, max) {
        if (!label) return '?';
        return label.length > max ? label.slice(0, max) + '…' : label;
    }

    _buildTooltip(node) {
        const lines = [];
        if (node.type === 'domain') {
            lines.push(`<b>Domain:</b> ${node.label}`);
            const domainCount = this.allNodesData.filter((n) => n.type === 'domain').length;
            if (domainCount > 1) {
                lines.push(`<b>Total Domains:</b> ${domainCount}`);
            }
        } else if (node.type === 'service') {
            lines.push(`<b>Hostname:</b> ${node.hostname || node.label}`);
            if (node.sourceType) lines.push(`<b>Type:</b> ${node.sourceType === 'stealer' ? 'Infostealer Logs' : 'Breach Data'}`);
            if (node.isLinkedToDomain !== undefined) {
                lines.push(`<b>Linked:</b> ${node.isLinkedToDomain ? '✓ Yes' : '✗ No'}`);
            }
            if (node.mainDomain && !node.isLinkedToDomain) {
                lines.push(`<b style="color:#94a3b8">External Service</b>`);
            }
            if (node.usersCount !== undefined) lines.push(`<b>Users:</b> ${node.usersCount}`);
            if (node.credentialsFound) lines.push(`<b>Credentials:</b> ${node.credentialsFound}`);
        } else if (node.type === 'user') {
            if (node.email) lines.push(`<b>Email:</b> ${node.email}`);
            if (node.username) lines.push(`<b>Username:</b> ${node.username}`);
            if (node.name) lines.push(`<b>Name:</b> ${node.name}`);
            if (node.phone) lines.push(`<b>Phone:</b> ${node.phone}`);
            if (node.isOrgEmail) lines.push(`<b style="color:#00e676">Organization Email</b>`);
            if (node.serviceIds) lines.push(`<b>Hostnames:</b> ${node.serviceIds.length}`);
            if (node.deleted) lines.push(`<b style="color:#ff3366">DELETED</b>`);
            if (node.identifiable === true) lines.push(`<b style="color:#ffab00">Identifiable</b>`);
        } else if (node.type === 'superuser') {
            const userCount = node.linkedUserIds ? node.linkedUserIds.length : 0;
            const hwidCount = node.allHwids ? node.allHwids.length : 0;
            lines.push(`<b>Superuser</b>`);
            lines.push(`<b>Linked Users:</b> ${userCount}`);
            lines.push(`<b>HWIDs:</b> ${hwidCount}`);
            if (node.isOrgSuperuser) lines.push(`<b style="color:#448aff">Organization Linked</b>`);
            if (node.country) lines.push(`<b>Country:</b> ${node.country}`);
            if (node.aiAnalysis) lines.push(`<b style="color:#ffab00">AI Analyzed</b>`);
            lines.push(`<i style="color:#94a3b8">Double-click for details</i>`);
        } else if (node.type === 'crypto_address') {
            lines.push(`<b style="color:#f7931a">Crypto Address</b>`);
            lines.push(`<b>Address:</b> ${node.label}`);
            if (node.cryptoNetwork) lines.push(`<b>Network:</b> ${node.cryptoNetwork}`);
            if (node.cryptoBalance !== undefined) lines.push(`<b>Balance:</b> ${node.cryptoBalance.toFixed(6)} ${node.cryptoNetwork === 'EVM' ? 'ETH' : 'BTC'}`);
            if (node.txCount !== undefined) lines.push(`<b>Transactions:</b> ${node.txCount}`);
            if (node.totalReceived !== undefined) lines.push(`<b>Total received:</b> ${node.totalReceived.toFixed(6)}`);
        }
        return lines.join('<br>');
    }

    _handleNodeClick(nodeId) {
        if (this.connectionMode) {
            this._completeConnection(nodeId);
            return;
        }

        this.selectedNodeId = nodeId;
        const nodeData = this._getNodeData(nodeId);
        if (this.onNodeSelect) {
            this.onNodeSelect(nodeId, nodeData);
        }
    }

    _handleDeselect() {
        this.selectedNodeId = null;
        if (this.connectionMode) {
            this.exitConnectionMode();
        }
        if (this.onNodeDeselect) {
            this.onNodeDeselect();
        }
    }

    _getNodeData(nodeId) {
        const visNode = this.nodesDataset.get(nodeId);
        return visNode?._data || null;
    }

    /**
     * Delete multiple nodes and their connected edges in one undoable action.
     * @param {string[]} nodeIds 
     */
    deleteNodes(nodeIds) {
        if (!nodeIds || nodeIds.length === 0) return;

        const nodesDataList = [];
        const edgesDataList = [];
        const edgesToRemove = new Set();

        // 1. Collect all valid nodes and mark them
        const validNodeIds = nodeIds.filter(id => this.nodesDataset.get(id));
        for (const nid of validNodeIds) {
            const data = this._getNodeData(nid);
            if (data) {
                nodesDataList.push({ ...data });
                data.deleted = true;
                this.deletedNodes.set(nid, data);

                const origIdx = this.allNodesData.findIndex(n => n.id === nid);
                if (origIdx >= 0) this.allNodesData[origIdx].deleted = true;

                // Find connected edges
                const cEdges = this.edgesDataset.get({ filter: e => e.from === nid || e.to === nid });
                for (const ce of cEdges) edgesToRemove.add(ce.id);
            }
        }

        // 2. Collect edges
        for (const eid of edgesToRemove) {
            const edgeData = this.edgesDataset.get(eid);
            if (edgeData) edgesDataList.push({ ...edgeData });
        }

        if (nodesDataList.length === 0) return;

        // 3. Push to Stack
        this.actionStack.push({
            type: 'delete_bulk',
            nodes: nodesDataList,
            edges: edgesDataList,
            timestamp: Date.now()
        });

        // 4. Remove from visible datasets
        this.nodesDataset.remove(validNodeIds);
        this.edgesDataset.remove(Array.from(edgesToRemove));

        // 5. Purge memory cache of edges to prevent resurrection 
        for (const ed of edgesDataList) {
            if (ed && ed._data) {
                const target = ed._data;
                const origIdx = this.allEdgesData.findIndex(ge =>
                    ge.from === target.from &&
                    ge.to === target.to &&
                    ge.type === target.type
                );
                if (origIdx !== -1) {
                    this.allEdgesData.splice(origIdx, 1);
                }
            }
        }

        this.selectedNodeId = null;
        if (this.onNodeDeselect) this.onNodeDeselect();
    }

    /**
     * Delete a single edge and push to undo stack
     */
    deleteEdge(edgeId) {
        if (!edgeId) return;
        const edgeData = this.edgesDataset.get(edgeId);
        if (!edgeData) return;

        this.actionStack.push({
            type: 'delete_bulk',
            nodes: [],
            edges: [{ ...edgeData }],
            timestamp: Date.now()
        });

        this.redoStack = []; // Clear redo stack on new action

        this.edgesDataset.remove(edgeId);

        // Purge memory cache
        if (edgeData && edgeData._data) {
            const target = edgeData._data;
            const origIdx = this.allEdgesData.findIndex(ge =>
                ge.from === target.from &&
                ge.to === target.to &&
                ge.type === target.type
            );
            if (origIdx !== -1) {
                this.allEdgesData.splice(origIdx, 1);
            }
        }
    }

    /**
     * Delete multiple edges and push to undo stack
     */
    deleteEdges(edgeIds) {
        if (!edgeIds || edgeIds.length === 0) return;

        const edgesDataList = [];
        for (const eid of edgeIds) {
            const edgeData = this.edgesDataset.get(eid);
            if (edgeData) edgesDataList.push({ ...edgeData });
        }

        if (edgesDataList.length === 0) return;

        this.actionStack.push({
            type: 'delete_bulk',
            nodes: [],
            edges: edgesDataList,
            timestamp: Date.now()
        });

        this.redoStack = [];

        // Purge visually from visJS
        this.edgesDataset.remove(edgeIds);

        // Purge memory cache to prevent resurrection during layout builds
        for (const ed of edgesDataList) {
            if (ed && ed._data) {
                const target = ed._data;
                const origIdx = this.allEdgesData.findIndex(ge =>
                    ge.from === target.from &&
                    ge.to === target.to &&
                    ge.type === target.type
                );
                if (origIdx !== -1) {
                    this.allEdgesData.splice(origIdx, 1);
                }
            }
        }
    }

    /**
     * Soft-delete a single node (Legacy single node, updated to use bulk for stack compat)
     */
    deleteNode(nodeId) {
        const nodeData = this._getNodeData(nodeId);
        if (!nodeData || nodeData.type === 'domain') return;
        this.deleteNodes([nodeId]);
    }

    /**
     * Hard delete a domain (bypasses domain safety check)
     */
    deleteDomainHard(domainId) {
        const nodeData = this._getNodeData(domainId);
        if (nodeData && nodeData.type === 'domain') {
            this.deleteNodes([domainId]);
        }
    }

    /**
     * Deletes a domain and all its downward hierarchical children securely.
     */
    deleteDomainCascading(domainId) {
        const targetIds = new Set([domainId]);

        // Simple BFS to find all children recursively
        let queue = [domainId];
        while (queue.length > 0) {
            const currentId = queue.shift();
            // Find all outgoing edges from currentId
            const outEdges = this.edgesDataset.get({ filter: e => e.from === currentId });
            for (const edge of outEdges) {
                if (!targetIds.has(edge.to)) {
                    targetIds.add(edge.to);
                    queue.push(edge.to);
                }
            }
        }

        this.deleteNodes(Array.from(targetIds));
    }

    /**
     * Copy JSON representing selected nodes to the clipboard
     */
    copyNodes(nodeIds) {
        if (!nodeIds || nodeIds.length === 0) return;
        const result = nodeIds.map(nid => this._getNodeData(nid)).filter(Boolean);
        try {
            navigator.clipboard.writeText(JSON.stringify(result, null, 2));
            console.log(`Copied ${result.length} nodes to clipboard.`);
        } catch (e) {
            console.error('Failed to copy to clipboard', e);
        }
    }

    /**
     * Undo the last bulk action from the actionStack.
     */
    undoLastAction() {
        if (this.actionStack.length === 0) {
            console.log('Nothing to undo.');
            return;
        }

        const lastAction = this.actionStack.pop();

        if (lastAction.type === 'delete_bulk') {
            // Restore Nodes
            const nodesToRestore = [];
            for (const n of lastAction.nodes) {
                n.deleted = false;
                this.deletedNodes.delete(n.id);

                const origIdx = this.allNodesData.findIndex(x => x.id === n.id);
                if (origIdx >= 0) this.allNodesData[origIdx].deleted = false;

                nodesToRestore.push(this._toVisNode(n));
            }
            this.nodesDataset.add(nodesToRestore);

            // Restore Edges
            const edgesToRestore = lastAction.edges.map(e => e); // assuming format is identical 
            this.edgesDataset.add(edgesToRestore);

            this.redoStack.push(lastAction);
        }
    }

    /**
     * Redo the last undone action from the redoStack.
     */
    redoLastAction() {
        if (this.redoStack.length === 0) {
            console.log('Nothing to redo.');
            return;
        }

        const nextAction = this.redoStack.pop();

        if (nextAction.type === 'delete_bulk') {
            // Delete Nodes again
            const nodesToRemove = nextAction.nodes.map(n => n.id);
            for (const n of nextAction.nodes) {
                n.deleted = true;
                this.deletedNodes.set(n.id, n);

                const origIdx = this.allNodesData.findIndex(x => x.id === n.id);
                if (origIdx >= 0) this.allNodesData[origIdx].deleted = true;
            }
            this.nodesDataset.remove(nodesToRemove);

            // Delete Edges again
            const edgesToRemove = nextAction.edges.map(e => e.id);
            this.edgesDataset.remove(edgesToRemove);

            this.actionStack.push(nextAction);
        }
    }

    /**
     * Enter connection mode (to connect two nodes — user-user or domain-domain)
     */
    enterConnectionMode(sourceNodeId) {
        const nodeData = this._getNodeData(sourceNodeId);
        if (!nodeData || (nodeData.type !== 'user' && nodeData.type !== 'domain')) return false;

        this.connectionMode = true;
        this.connectionSourceId = sourceNodeId;
        this._connectionSourceType = nodeData.type;
        document.body.classList.add('connection-mode');
        return true;
    }

    exitConnectionMode() {
        this.connectionMode = false;
        this.connectionSourceId = null;
        document.body.classList.remove('connection-mode');
    }

    _completeConnection(targetNodeId) {
        const sourceId = this.connectionSourceId;
        const sourceType = this._connectionSourceType;
        const targetData = this._getNodeData(targetNodeId);

        if (!targetData || targetNodeId === sourceId) {
            this.exitConnectionMode();
            return;
        }

        // Domain-domain connection
        if (sourceType === 'domain' && targetData.type === 'domain') {
            const edgeId = `edge_dd_${sourceId}_${targetNodeId}`;
            const newEdge = {
                from: sourceId,
                to: targetNodeId,
                type: 'domain-domain',
            };

            this.allEdgesData.push(newEdge);
            this.edgesDataset.add(this._toVisEdge(newEdge, this.allEdgesData.length - 1));

            this.nodeHistory.push({
                action: 'connect-domain',
                nodeId: sourceId,
                data: { source: sourceId, target: targetNodeId },
                timestamp: Date.now(),
            });

            this.exitConnectionMode();
            return;
        }

        // User-user connection
        if (sourceType === 'user' && targetData.type === 'user') {
            const edgeId = `edge_uu_${sourceId}_${targetNodeId}`;
            const newEdge = {
                from: sourceId,
                to: targetNodeId,
                type: 'user-user',
            };

            this.allEdgesData.push(newEdge);
            this.edgesDataset.add(this._toVisEdge(newEdge, this.allEdgesData.length - 1));

            this.nodeHistory.push({
                action: 'connect',
                nodeId: sourceId,
                data: { source: sourceId, target: targetNodeId },
                timestamp: Date.now(),
            });

            this.exitConnectionMode();
            return;
        }

        // Type mismatch
        this.exitConnectionMode();
    }

    /**
     * Apply filters — show/hide nodes based on criteria
     */
    applyFilters(filters) {
        this.filters = filters; // Save for _toVisNode reference
        const { showUsers, nameFilter, orgEmail, nonOrgEmail, multiService, showDeleted, identifiableOnly, linkedServicesOnly, hideExternal, stealerOnly, countryFilter } = filters;

        // ---- PASS 1: Determine visible domain and service nodes ----
        const visibleDomainServiceIds = new Set();

        for (const node of this.allNodesData) {
            // Domain node always visible
            if (node.type === 'domain') {
                visibleDomainServiceIds.add(node.id);
                continue;
            }

            // Service node filtering
            if (node.type === 'service') {
                // Linked services filter
                if (linkedServicesOnly && !node.isLinkedToDomain) {
                    continue;
                }
                // Hide external services filter (hide non-org services)
                if (hideExternal && !node.isLinkedToDomain) {
                    continue;
                }
                visibleDomainServiceIds.add(node.id);
            }
        }

        // ---- PASS 2: Filter user nodes ----
        const visibleUserIds = new Set();

        for (const node of this.allNodesData) {
            if (node.type !== 'user') continue;
            if (!showUsers) continue;

            // Stealer-only filter: skip non-stealer users
            if (stealerOnly && node.dataSource !== 'stealer') continue;

            // Deleted filter
            if (node.deleted && !showDeleted) continue;

            // Name filter
            if (nameFilter && nameFilter.trim()) {
                const search = nameFilter.toLowerCase();
                const matchName = (node.name || '').toLowerCase().includes(search);
                const matchEmail = (node.email || '').toLowerCase().includes(search);
                const matchUsername = (node.username || '').toLowerCase().includes(search);
                if (!matchName && !matchEmail && !matchUsername) continue;
            }

            // Org email filter
            if (orgEmail && !node.isOrgEmail) continue;

            // Non-org email filter
            if (nonOrgEmail && node.isOrgEmail) continue;

            // Multi-service filter: count actual edges to visible domain/service nodes
            if (multiService) {
                const connectedElements = new Set();
                for (const edge of this.allEdgesData) {
                    if (edge.to === node.id && visibleDomainServiceIds.has(edge.from)) {
                        connectedElements.add(edge.from);
                    }
                    if (edge.from === node.id && visibleDomainServiceIds.has(edge.to)) {
                        connectedElements.add(edge.to);
                    }
                }
                if (connectedElements.size < 2) continue;
            }

            // Identifiable filter
            if (identifiableOnly && node.identifiable !== true) continue;

            // Linked services filter for users
            if (linkedServicesOnly) {
                const hasLinkedService = node.serviceIds && node.serviceIds.some(svcId => {
                    const svcNode = this.allNodesData.find(n => n.id === svcId);
                    return svcNode && svcNode.isLinkedToDomain;
                });
                if (!hasLinkedService) continue;
            }

            // Country Filter for users
            if (countryFilter && countryFilter.trim() !== '') {
                if (!node.country) continue; // Hide users without a country if filter is active

                const filterCountryTrimmed = countryFilter.trim().toLowerCase();
                let rawCountry = node.country.trim();
                let cleanNodeCountry = rawCountry;

                const twoLetterMatch = rawCountry.match(/^([A-Za-z]{2})\b/);
                if (twoLetterMatch) {
                    cleanNodeCountry = twoLetterMatch[1].toLowerCase();
                } else {
                    cleanNodeCountry = rawCountry.replace(/-\s*[\d\.:a-fA-F]+/g, '').replace(/[\d\.:a-fA-F]+/g, '').trim().toLowerCase();
                }

                if (cleanNodeCountry !== filterCountryTrimmed && !cleanNodeCountry.includes(filterCountryTrimmed)) continue;
            }

            visibleUserIds.add(node.id);
        }

        // ---- PASS 3: If stealerOnly, restrict domains/services to those connected to visible stealer users ----
        let finalVisibleIds;
        if (stealerOnly) {
            const connectedDomainServiceIds = new Set();
            for (const edge of this.allEdgesData) {
                if (visibleUserIds.has(edge.from) && visibleDomainServiceIds.has(edge.to)) {
                    connectedDomainServiceIds.add(edge.to);
                }
                if (visibleUserIds.has(edge.to) && visibleDomainServiceIds.has(edge.from)) {
                    connectedDomainServiceIds.add(edge.from);
                }
            }
            finalVisibleIds = new Set([...visibleUserIds, ...connectedDomainServiceIds]);
        } else {
            finalVisibleIds = new Set([...visibleDomainServiceIds, ...visibleUserIds]);
        }

        // Always ensure Primary Domains remain visible during Country filtering
        if (countryFilter && countryFilter.trim() !== '') {
            for (const node of this.allNodesData) {
                if (node.type === 'domain') {
                    finalVisibleIds.add(node.id);
                }
            }
        }

        // ---- PASS 4: Determine visible superuser nodes ----
        // A superuser is visible if it matches the country filter (if active),
        // or if at least one of its connected users is visible.
        for (const node of this.allNodesData) {
            if (node.type !== 'superuser') continue;

            let matchesCountry = false;
            let filterActive = false;

            if (countryFilter && countryFilter.trim() !== '') {
                filterActive = true;
                if (node.country) {
                    const filterCountryTrimmed = countryFilter.trim().toLowerCase();
                    let rawCountry = node.country.trim();
                    let cleanNodeCountry = rawCountry;

                    const twoLetterMatch = rawCountry.match(/^([A-Za-z]{2})\b/);
                    if (twoLetterMatch) {
                        cleanNodeCountry = twoLetterMatch[1].toLowerCase();
                    } else {
                        cleanNodeCountry = rawCountry.replace(/-\s*[\d\.:a-fA-F]+/g, '').replace(/[\d\.:a-fA-F]+/g, '').trim().toLowerCase();
                    }

                    matchesCountry = cleanNodeCountry === filterCountryTrimmed || cleanNodeCountry.includes(filterCountryTrimmed);
                }
            }

            const hasVisibleUser = (node.linkedUserIds || []).some(uid => visibleUserIds.has(uid));

            // If the country filter is active and the superuser natively matches it, it is ALWAYS visible.
            if (filterActive) {
                if (matchesCountry) {
                    finalVisibleIds.add(node.id);
                    // Also force the linked users to be visible
                    if (node.linkedUserIds) {
                        node.linkedUserIds.forEach(uid => {
                            visibleUserIds.add(uid);
                            finalVisibleIds.add(uid);
                        });
                    }
                } else if (hasVisibleUser) {
                    finalVisibleIds.add(node.id);
                }
            } else {
                if (hasVisibleUser) {
                    finalVisibleIds.add(node.id);
                }
            }
        }

        // ---- PASS 5: Auto-include all Explored Detail nodes and crypto wallet nodes so Layout resets don't wipe them ----
        for (const node of this.allNodesData) {
            if ((node.type && node.type.startsWith('user_detail')) || node.type === 'crypto_address') {
                finalVisibleIds.add(node.id);
            }
        }

        // Build edges for visible nodes
        const visibleEdges = [];
        for (const edge of this.allEdgesData) {
            if (finalVisibleIds.has(edge.from) && finalVisibleIds.has(edge.to)) {
                visibleEdges.push(edge);
            }
        }

        // Update datasets
        this.nodesDataset.clear();
        this.edgesDataset.clear();

        const visNodes = this.allNodesData
            .filter((n) => finalVisibleIds.has(n.id))
            .map((n) => this._toVisNode(n));

        const visEdgesFormatted = visibleEdges.map((e, i) => this._toVisEdge(e, i));

        this.nodesDataset.add(visNodes);
        this.edgesDataset.add(visEdgesFormatted);
    }

    /**
     * Get stats for the header
     */
    getStats() {
        const services = this.allNodesData.filter((n) => n.type === 'service').length;
        const users = this.allNodesData.filter((n) => n.type === 'user' && !n.deleted).length;
        const domains = this.allNodesData.filter((n) => n.type === 'domain').length;
        const superusers = this.allNodesData.filter((n) => n.type === 'superuser').length;
        const connections = this.allEdgesData.length;
        return { services, users, connections, domains, superusers };
    }

    /**
     * Get all user nodes (for AI analysis)
     */
    getUserNodes() {
        return this.allNodesData.filter((n) => n.type === 'user' && !n.deleted);
    }

    /**
     * Update a user node's identifiable status
     */
    setUserIdentifiable(userId, identifiable, reasons = [], possibleIdentifiable = false) {
        const node = this.allNodesData.find((n) => n.id === userId);
        if (node) {
            node.identifiable = identifiable;
            node.identifiableReasons = reasons;
            node.possibleIdentifiable = possibleIdentifiable;
            // Refresh the node visual in the dataset
            try {
                const visNode = this._toVisNode(node);
                this.nodesDataset.update(visNode);
            } catch (e) {
                // Node might not be in the visible dataset
            }
        }
    }

    /**
     * Update a superuser node's identifiable status
     */
    setSuperuserIdentifiable(superuserId, identifiable, possibleIdentifiable = false) {
        const node = this.allNodesData.find((n) => n.id === superuserId);
        if (node) {
            node.identifiable = identifiable;
            node.possibleIdentifiable = possibleIdentifiable;
            if (!node.aiAnalysis) node.aiAnalysis = {}; // Ensure it exists for _toVisNode logic
            node.aiAnalysis.identifiable = identifiable;
            node.aiAnalysis.possibleIdentifiable = possibleIdentifiable;
            try {
                const visNode = this._toVisNode(node);
                this.nodesDataset.update(visNode);
            } catch (e) { }
        }
    }

    /**
     * Dynamically add a node to the live graph
     * @param {Object} nodeData - node data object
     * @param {boolean} isExploration - if true, tag as exploration data
     */
    addNode(nodeData, isExploration = false) {
        // Check if node already exists
        const existing = this.allNodesData.find(n => n.id === nodeData.id);
        if (existing) return existing;

        if (isExploration) {
            nodeData._exploration = true;
            this.explorationNodeIds.add(nodeData.id);
        }

        this.allNodesData.push(nodeData);
        try {
            this.nodesDataset.add(this._toVisNode(nodeData));
        } catch (e) {
            // Node might already be in dataset
        }
        return nodeData;
    }

    /**
     * Batch add nodes and edges to the live graph directly
     * @param {Array<Object>} newNodes - list of node objects
     * @param {Array<Object>} newEdges - list of edge objects
     */
    batchAdd(newNodes, newEdges) {
        let visNodesToAdd = [];
        let visEdgesToAdd = [];

        for (const nodeData of newNodes) {
            const existing = this.allNodesData.find(n => n.id === nodeData.id);
            if (!existing) {
                this.allNodesData.push(nodeData);
                visNodesToAdd.push(this._toVisNode(nodeData));
            }
        }

        for (let i = 0; i < newEdges.length; i++) {
            const edgeData = newEdges[i];
            const exists = this.allEdgesData.some(e =>
                e.from === edgeData.from && e.to === edgeData.to && e.type === edgeData.type
            );
            if (!exists) {
                this.allEdgesData.push(edgeData);
                const idx = this.allEdgesData.length - 1;
                visEdgesToAdd.push(this._toVisEdge(edgeData, idx));
            }
        }

        if (visNodesToAdd.length > 0) {
            this.nodesDataset.add(visNodesToAdd);
        }
        if (visEdgesToAdd.length > 0) {
            this.edgesDataset.add(visEdgesToAdd);
        }
    }



    /**
     * Dynamically add an edge to the live graph
     * @param {Object} edgeData - { from, to, type }
     * @param {boolean} isExploration - if true, tag as exploration data
     */
    addEdge(edgeData, isExploration = false) {
        // Check for duplicate
        const exists = this.allEdgesData.some(e =>
            e.from === edgeData.from && e.to === edgeData.to && e.type === edgeData.type
        );
        if (exists) return;

        if (isExploration) {
            edgeData._exploration = true;
        }

        this.allEdgesData.push(edgeData);
        const idx = this.allEdgesData.length - 1;
        const visEdge = this._toVisEdge(edgeData, idx);
        if (isExploration) {
            this.explorationEdgeIds.add(visEdge.id);
        }
        try {
            this.edgesDataset.add(visEdge);
        } catch (e) {
            // Edge might already exist
        }
    }

    /**
     * Mark a user as explored
     */
    setUserExplored(userId) {
        this.exploredUserIds.add(userId);
        const node = this.allNodesData.find(n => n.id === userId);
        if (node) {
            node._explored = true;
        }
    }

    /**
     * Check if a user has been explored
     */
    isUserExplored(userId) {
        return this.exploredUserIds.has(userId);
    }

    /**
     * Get a user node by ID
     */
    getUserNodeById(userId) {
        return this.allNodesData.find(n => n.id === userId && n.type === 'user') || null;
    }

    /**
     * Get all superuser nodes
     */
    getSuperuserNodes() {
        return this.allNodesData.filter(n => n.type === 'superuser');
    }

    /**
     * Get a superuser node by ID
     */
    getSuperuserNodeById(id) {
        return this.allNodesData.find(n => n.id === id && n.type === 'superuser') || null;
    }

    /**
     * Start blinking a node (for AI analysis in progress)
     */
    startNodeBlink(nodeId) {
        if (!this._blinkIntervals) this._blinkIntervals = new Map();
        if (this._blinkIntervals.has(nodeId)) return;

        let visible = true;
        const interval = setInterval(() => {
            visible = !visible;
            try {
                this.nodesDataset.update({
                    id: nodeId,
                    opacity: visible ? 1.0 : 0.2,
                });
            } catch (e) { /* node might not exist */ }
        }, 400);
        this._blinkIntervals.set(nodeId, interval);
    }

    /**
     * Stop blinking a node
     */
    stopNodeBlink(nodeId) {
        if (!this._blinkIntervals) return;
        const interval = this._blinkIntervals.get(nodeId);
        if (interval) {
            clearInterval(interval);
            this._blinkIntervals.delete(nodeId);
            try {
                this.nodesDataset.update({ id: nodeId, opacity: 1.0 });
            } catch (e) { /* ignore */ }
        }
    }

    /**
     * Find superuser connected to a given user
     */
    getSuperuserForUser(userId) {
        const edge = this.allEdgesData.find(e => e.type === 'superuser-user' && e.to === userId);
        if (!edge) return null;
        return this.getSuperuserNodeById(edge.from);
    }

    /**
     * Toggle exploration data visibility
     */
    toggleExplorationData(visible) {
        this.explorationVisible = visible;

        if (!visible) {
            // Remove exploration nodes and edges from visible datasets
            const nodeIdsToRemove = Array.from(this.explorationNodeIds);
            const edgeIdsToRemove = Array.from(this.explorationEdgeIds);
            this.nodesDataset.remove(nodeIdsToRemove);
            this.edgesDataset.remove(edgeIdsToRemove);

            // Also remove any edges that connect TO exploration nodes
            const connectedEdges = this.edgesDataset.get({
                filter: (e) => this.explorationNodeIds.has(e.from) || this.explorationNodeIds.has(e.to),
            });
            this.edgesDataset.remove(connectedEdges.map(e => e.id));
        } else {
            // Re-add exploration nodes and edges
            const nodesToAdd = this.allNodesData
                .filter(n => this.explorationNodeIds.has(n.id))
                .map(n => this._toVisNode(n));
            const edgesToAdd = this.allEdgesData
                .filter(e => e._exploration)
                .map((e, i) => this._toVisEdge(e, this.allEdgesData.indexOf(e)));

            try { this.nodesDataset.add(nodesToAdd); } catch (e) { /* already exists */ }
            try { this.edgesDataset.add(edgesToAdd); } catch (e) { /* already exists */ }
        }
    }

    /**
     * Check if any exploration has been done
     */
    hasExplorationData() {
        return this.explorationNodeIds.size > 0;
    }

    /**
     * Set graph layout mode
     * @param {string} mode - 'centralized', 'hierarchical'
     */
    setMode(mode, skipFit = false) {
        if (!this.network) return;
        this.layoutMode = mode;

        if (mode === 'hierarchical') {
            const nodes = this.nodesDataset.get();
            const edges = this.edgesDataset.get();

            // 1. Group nodes by structural type (vis.js DataSet stores original data in _data)
            const getType = (n) => (n._data && n._data.type) || '';
            const domains = nodes.filter(n => getType(n) === 'domain');
            const services = nodes.filter(n => getType(n) === 'service');
            const users = nodes.filter(n => getType(n) === 'user');
            const superusers = nodes.filter(n => getType(n) === 'superuser');
            // Details are broken into generic features vs domains/networks
            const userDetails = nodes.filter(n => getType(n) === 'user_detail' || getType(n) === 'user_detail_phone' || (getType(n) === 'crypto_address' && n._data && n._data._isDetailWallet));
            const detailServices = nodes.filter(n => getType(n) === 'user_detail_service');
            const socialProfiles = nodes.filter(n => getType(n) === 'social_profile');
            const socialPosts = nodes.filter(n => getType(n) === 'social_post');
            const cryptoDestinations = nodes.filter(n => getType(n) === 'crypto_address' && !(n._data && n._data._isDetailWallet));

            // 2. Build adjacency mappings
            const userToParent = {}; // userId -> parentId (service or domain)
            const userToSuperuser = {}; // userId -> superuserId
            const superuserToUsers = {}; // superuserId -> [userIds]

            const detailToParent = {}; // detailId -> parentId (superuser or user)
            const detailServiceToDetail = {}; // detailServiceId -> detailId
            const socialProfileToService = {}; // socialProfileId -> detailServiceId
            const socialPostToProfile = {}; // socialPostId -> socialProfileId
            const cryptoDestToWallet = {}; // cryptoDestId -> walletNodeId

            edges.forEach(e => {
                const rawType = e._data.type;
                if (rawType === 'service-user' || rawType === 'direct-org-user' || rawType === 'domain-user') {
                    userToParent[e.to] = e.from;
                } else if (rawType === 'superuser-user' || rawType === 'superuser-new-user') {
                    userToSuperuser[e.to] = e.from;
                    if (!superuserToUsers[e.from]) superuserToUsers[e.from] = [];
                    superuserToUsers[e.from].push(e.to);
                } else if (rawType === 'detail-link') {
                    // from: Superuser/User, to: user_detail or user_detail_service
                    // This was added in extractAndVisualizeUserData
                    const targetNode = nodes.find(n => n.id === e.to);
                    if (targetNode) {
                        const tType = getType(targetNode);
                        if (tType === 'user_detail' || tType === 'user_detail_phone' || tType === 'crypto_address') {
                            detailToParent[e.to] = e.from;
                        } else if (tType === 'user_detail_service') {
                            const fromNode = nodes.find(n => n.id === e.from);
                            const fType = fromNode ? getType(fromNode) : '';
                            if (fType === 'user' || fType === 'superuser') {
                                detailToParent[e.to] = e.from;
                            } else {
                                detailServiceToDetail[e.to] = e.from;
                            }
                        }
                    }
                } else if (rawType === 'social-link') {
                    socialProfileToService[e.to] = e.from;
                } else if (rawType === 'social-post-link') {
                    socialPostToProfile[e.to] = e.from;
                } else if (rawType === 'crypto-link') {
                    cryptoDestToWallet[e.to] = e.from;
                }
            });

            // Identify root and sub superusers, and map subs to their roots
            const rootSuperusers = [];
            const subSuperusers = [];
            const superuserToRoot = {};

            // Sort superusers by creation time (which is the timestamp in their ID)
            // Example: superuser_1678888888888 or superuser_1678888888888_0
            const getTimestamp = id => {
                const parts = id.split('_');
                return parts.length > 1 ? parseInt(parts[1], 10) : Number.MIN_SAFE_INTEGER;
            };
            superusers.sort((a, b) => getTimestamp(a.id) - getTimestamp(b.id));

            superusers.forEach(su => {
                let isSub = false;
                let rootSuParentId = su.id;

                const connectedUsers = superuserToUsers[su.id] || [];
                // Find if any user is already linked to an OLDER superuser
                for (const uid of connectedUsers) {
                    const siblingEdges = edges.filter(e => e.to === uid && (e.type === 'superuser-user' || e.type === 'superuser-new-user') && e.from !== su.id);
                    for (const edge of siblingEdges) {
                        if (getTimestamp(edge.from) < getTimestamp(su.id)) {
                            // Link to the older superuser's root
                            rootSuParentId = superuserToRoot[edge.from] || edge.from;
                            isSub = true;
                            break;
                        }
                    }
                    if (isSub) break;
                }

                superuserToRoot[su.id] = rootSuParentId;
                if (isSub) {
                    subSuperusers.push(su);
                } else {
                    rootSuperusers.push(su);
                }
            });

            const rootDomainMap = {};
            Object.keys(superuserToUsers).forEach(suId => {
                const root = superuserToRoot[suId] || suId;
                if (!rootDomainMap[root]) {
                    const usersOfSu = superuserToUsers[suId] || [];
                    for (const uid of usersOfSu) {
                        if (userToParent[uid]) {
                            rootDomainMap[root] = userToParent[uid];
                            break;
                        }
                    }
                }
            });

            // 3. Sort nodes systematically
            users.sort((a, b) => {
                const suA = userToSuperuser[a.id] || '';
                const suB = userToSuperuser[b.id] || '';

                const rootA = superuserToRoot[suA] || suA;
                const rootB = superuserToRoot[suB] || suB;

                const pA = userToParent[a.id] || (rootA ? rootDomainMap[rootA] || '' : '');
                const pB = userToParent[b.id] || (rootB ? rootDomainMap[rootB] || '' : '');

                if (pA !== pB) return pA.localeCompare(pB);

                if (rootA !== rootB) return rootA.localeCompare(rootB);

                if (suA !== suB) return suA.localeCompare(suB);

                return a.id.localeCompare(b.id);
            });

            const updates = [];
            const X_SPACING = 300;
            const Y_SPACING = 120;

            // X-Coordinates mappings (Left to Right)
            // L0: Domain
            // L1: Service
            // L2: Superuser
            // L3: User
            // L4: User Details (Emails, Phones, Usernames)
            // L5: Detail Services (Platform icons, websites)
            let currentY = 0;
            const yPositions = {};

            // Optimize lookups to avoid O(N^3) freezes
            const detailsByParent = new Map();
            userDetails.forEach(d => {
                const parentId = detailToParent[d.id];
                if (parentId) {
                    if (!detailsByParent.has(parentId)) detailsByParent.set(parentId, []);
                    detailsByParent.get(parentId).push(d);
                }
            });

            const detailServicesByDetail = new Map();
            const detailServicesByParent = new Map(); // For direct connections to SU/User
            detailServices.forEach(ds => {
                const detId = detailServiceToDetail[ds.id];
                if (detId) {
                    if (!detailServicesByDetail.has(detId)) detailServicesByDetail.set(detId, []);
                    detailServicesByDetail.get(detId).push(ds);
                }
                const pId = detailToParent[ds.id];
                if (pId) {
                    if (!detailServicesByParent.has(pId)) detailServicesByParent.set(pId, []);
                    detailServicesByParent.get(pId).push(ds);
                }
            });

            // Render right-most cluster first (Details & Detail Services) to allocate Y space natively upwards

            const socialProfilesByAct = new Map();
            socialProfiles.forEach(sp => {
                const actId = socialProfileToService[sp.id];
                if (actId) {
                    if (!socialProfilesByAct.has(actId)) socialProfilesByAct.set(actId, []);
                    socialProfilesByAct.get(actId).push(sp);
                }
            });

            const socialPostsByProfile = new Map();
            socialPosts.forEach(sp => {
                const profId = socialPostToProfile[sp.id];
                if (profId) {
                    if (!socialPostsByProfile.has(profId)) socialPostsByProfile.set(profId, []);
                    socialPostsByProfile.get(profId).push(sp);
                }
            });

            const placedUsers = new Set();

            const placeSuperuser = (su) => {
                if (yPositions[su.id] !== undefined) return;

                let startY = currentY;

                // 1. Process its details (emails, phones) from Amplify
                const suDetails = detailsByParent.get(su.id) || [];
                suDetails.forEach(det => {
                    yPositions[det.id] = currentY;
                    updates.push({ id: det.id, x: 3 * X_SPACING, y: currentY }); // Draw them at L3 alongside users

                    let maxSubSubY = currentY;
                    const acts = [];
                    if (detailServicesByDetail.has(det.id)) acts.push(...detailServicesByDetail.get(det.id));
                    if (detailServicesByParent.has(det.id)) acts.push(...detailServicesByParent.get(det.id));

                    let addedActs = 0;
                    acts.forEach(act => {
                        if (!yPositions[act.id]) {
                            yPositions[act.id] = maxSubSubY;
                            updates.push({ id: act.id, x: 4 * X_SPACING, y: maxSubSubY });

                            const sProfiles = socialProfilesByAct.get(act.id) || [];
                            let profileCount = 0;
                            sProfiles.forEach(sp => {
                                yPositions[sp.id] = maxSubSubY;
                                updates.push({ id: sp.id, x: 5 * X_SPACING, y: maxSubSubY });

                                const sPosts = socialPostsByProfile.get(sp.id) || [];
                                let postCount = 0;
                                sPosts.forEach(post => {
                                    yPositions[post.id] = maxSubSubY;
                                    updates.push({ id: post.id, x: 6 * X_SPACING, y: maxSubSubY });
                                    maxSubSubY += Y_SPACING;
                                    postCount++;
                                });
                                if (postCount === 0) maxSubSubY += Y_SPACING;
                                profileCount++;
                            });

                            if (profileCount === 0) maxSubSubY += Y_SPACING;
                            addedActs++;
                        }
                    });

                    if (addedActs === 0) {
                        // For crypto wallet details: position transaction destination nodes
                        const isCryptoWallet = det._data && det._data.type === 'crypto_address';
                        if (isCryptoWallet) {
                            const destNodes = cryptoDestinations.filter(cd => cryptoDestToWallet[cd.id] === det.id);
                            destNodes.forEach(cd => {
                                if (!yPositions[cd.id]) {
                                    yPositions[cd.id] = maxSubSubY;
                                    updates.push({ id: cd.id, x: 4 * X_SPACING, y: maxSubSubY });
                                    maxSubSubY += Y_SPACING;
                                }
                            });
                            if (destNodes.length === 0) maxSubSubY += Y_SPACING;
                        } else {
                            maxSubSubY += Y_SPACING;
                        }
                    }
                    currentY = maxSubSubY;
                });

                // 2. Process its Sub-Superusers recursively (placing them directly below the root body)
                const nestedSUs = subSuperusers.filter(sub => superuserToRoot[sub.id] === su.id);
                nestedSUs.forEach(sub => placeSuperuser(sub));

                // 3. Process its linked users
                const rawLinkedUsers = superuserToUsers[su.id] || [];
                const linkedUsers = rawLinkedUsers
                    .map(uid => users.find(u => u.id === uid))
                    .filter(Boolean)
                    .sort((a, b) => a.id.localeCompare(b.id));

                linkedUsers.forEach(u => {
                    if (placedUsers.has(u.id)) return;
                    placedUsers.add(u.id);

                    yPositions[u.id] = currentY;
                    updates.push({ id: u.id, x: 3 * X_SPACING, y: currentY });

                    let maxSubSubY = currentY;

                    // 1. Process direct services attached to the User (since deduplication skips email dots)
                    const directActs = detailServicesByParent.get(u.id) || [];
                    let addedDirectActs = 0;
                    directActs.forEach(act => {
                        if (!yPositions[act.id]) {
                            yPositions[act.id] = maxSubSubY;
                            updates.push({ id: act.id, x: 4 * X_SPACING, y: maxSubSubY });

                            const sProfiles = socialProfilesByAct.get(act.id) || [];
                            let profileCount = 0;
                            sProfiles.forEach(sp => {
                                yPositions[sp.id] = maxSubSubY;
                                updates.push({ id: sp.id, x: 5 * X_SPACING, y: maxSubSubY });

                                const sPosts = socialPostsByProfile.get(sp.id) || [];
                                let postCount = 0;
                                sPosts.forEach(post => {
                                    yPositions[post.id] = maxSubSubY;
                                    updates.push({ id: post.id, x: 6 * X_SPACING, y: maxSubSubY });
                                    maxSubSubY += Y_SPACING;
                                    postCount++;
                                });
                                if (postCount === 0) maxSubSubY += Y_SPACING;
                                profileCount++;
                            });

                            if (profileCount === 0) maxSubSubY += Y_SPACING;
                            addedDirectActs++;
                        }
                    });

                    // 2. Process conventional User Detail dots
                    const uDetails = detailsByParent.get(u.id) || [];
                    uDetails.forEach(det => {
                        yPositions[det.id] = maxSubSubY;
                        updates.push({ id: det.id, x: 4 * X_SPACING, y: maxSubSubY });

                        const acts = [];
                        if (detailServicesByDetail.has(det.id)) acts.push(...detailServicesByDetail.get(det.id));
                        if (detailServicesByParent.has(det.id)) acts.push(...detailServicesByParent.get(det.id));

                        let addedActs = 0;
                        acts.forEach(act => {
                            if (!yPositions[act.id]) {
                                yPositions[act.id] = maxSubSubY;
                                updates.push({ id: act.id, x: 5 * X_SPACING, y: maxSubSubY });

                                const sProfiles = socialProfilesByAct.get(act.id) || [];
                                let profileCount = 0;
                                sProfiles.forEach(sp => {
                                    yPositions[sp.id] = maxSubSubY;
                                    updates.push({ id: sp.id, x: 6 * X_SPACING, y: maxSubSubY });

                                    const sPosts = socialPostsByProfile.get(sp.id) || [];
                                    let postCount = 0;
                                    sPosts.forEach(post => {
                                        yPositions[post.id] = maxSubSubY;
                                        updates.push({ id: post.id, x: 7 * X_SPACING, y: maxSubSubY });
                                        maxSubSubY += Y_SPACING;
                                        postCount++;
                                    });
                                    if (postCount === 0) maxSubSubY += Y_SPACING;
                                    profileCount++;
                                });

                                if (profileCount === 0) maxSubSubY += Y_SPACING;
                                addedActs++;
                            }
                        });

                        if (addedActs === 0) maxSubSubY += Y_SPACING;
                    });

                    if (uDetails.length === 0 && addedDirectActs === 0) maxSubSubY += Y_SPACING;
                    currentY = maxSubSubY;
                });

                // Center the Superuser vertically within its entire clustered family
                let suY = startY;
                if (currentY > startY) {
                    suY = startY + ((currentY - Y_SPACING - startY) / 2);
                } else {
                    currentY += Y_SPACING;
                }

                yPositions[su.id] = suY;
                updates.push({ id: su.id, x: 2 * X_SPACING, y: suY });
            };

            // Process all root superusers FIRST to maintain block coherence
            rootSuperusers.forEach(su => placeSuperuser(su));

            // Process any remaining orphaned standalone users grouped by Domain
            users.forEach(u => {
                if (placedUsers.has(u.id)) return;
                placedUsers.add(u.id);

                yPositions[u.id] = currentY;
                updates.push({ id: u.id, x: 3 * X_SPACING, y: currentY });

                let maxSubSubY = currentY;

                // 1. Process direct services attached to the User (since deduplication skips email dots)
                const directActs = detailServicesByParent.get(u.id) || [];
                let addedDirectActs = 0;
                directActs.forEach(act => {
                    if (!yPositions[act.id]) {
                        yPositions[act.id] = maxSubSubY;
                        updates.push({ id: act.id, x: 4 * X_SPACING, y: maxSubSubY });

                        const sProfiles = socialProfilesByAct.get(act.id) || [];
                        let profileCount = 0;
                        sProfiles.forEach(sp => {
                            yPositions[sp.id] = maxSubSubY;
                            updates.push({ id: sp.id, x: 5 * X_SPACING, y: maxSubSubY });

                            const sPosts = socialPostsByProfile.get(sp.id) || [];
                            let postCount = 0;
                            sPosts.forEach(post => {
                                yPositions[post.id] = maxSubSubY;
                                updates.push({ id: post.id, x: 6 * X_SPACING, y: maxSubSubY });
                                maxSubSubY += Y_SPACING;
                                postCount++;
                            });
                            if (postCount === 0) maxSubSubY += Y_SPACING;
                            profileCount++;
                        });

                        if (profileCount === 0) maxSubSubY += Y_SPACING;
                        addedDirectActs++;
                    }
                });

                // 2. Process conventional User Detail dots
                const uDetails = detailsByParent.get(u.id) || [];
                uDetails.forEach(det => {
                    yPositions[det.id] = maxSubSubY;
                    updates.push({ id: det.id, x: 4 * X_SPACING, y: maxSubSubY });

                    const acts = [];
                    if (detailServicesByDetail.has(det.id)) acts.push(...detailServicesByDetail.get(det.id));
                    if (detailServicesByParent.has(det.id)) acts.push(...detailServicesByParent.get(det.id));

                    let addedActs = 0;
                    acts.forEach(act => {
                        if (!yPositions[act.id]) {
                            yPositions[act.id] = maxSubSubY;
                            updates.push({ id: act.id, x: 5 * X_SPACING, y: maxSubSubY });

                            const sProfiles = socialProfilesByAct.get(act.id) || [];
                            let profileCount = 0;
                            sProfiles.forEach(sp => {
                                yPositions[sp.id] = maxSubSubY;
                                updates.push({ id: sp.id, x: 6 * X_SPACING, y: maxSubSubY });

                                const sPosts = socialPostsByProfile.get(sp.id) || [];
                                let postCount = 0;
                                sPosts.forEach(post => {
                                    yPositions[post.id] = maxSubSubY;
                                    updates.push({ id: post.id, x: 7 * X_SPACING, y: maxSubSubY });
                                    maxSubSubY += Y_SPACING;
                                    postCount++;
                                });
                                if (postCount === 0) maxSubSubY += Y_SPACING;
                                profileCount++;
                            });

                            if (profileCount === 0) maxSubSubY += Y_SPACING;
                            addedActs++;
                        }
                    });

                    if (addedActs === 0) maxSubSubY += Y_SPACING;
                });

                if (uDetails.length === 0 && addedDirectActs === 0) maxSubSubY += Y_SPACING;
                currentY = maxSubSubY;
            });

            // Position any remaining unpositioned crypto destination nodes recursively
            // Groups children by parent, aligns first child at parent's Y, stacks vertically
            let cryptoChanged = true;
            while (cryptoChanged) {
                cryptoChanged = false;

                // Group unpositioned destinations by their already-positioned parent
                const childrenByParent = new Map();
                for (const cd of cryptoDestinations) {
                    if (yPositions[cd.id] !== undefined) continue;
                    const parentId = cryptoDestToWallet[cd.id];
                    if (!parentId || yPositions[parentId] === undefined) continue;
                    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
                    childrenByParent.get(parentId).push(cd);
                }

                for (const [parentId, children] of childrenByParent) {
                    const parentUpdate = updates.find(u => u.id === parentId);
                    const parentX = parentUpdate ? parentUpdate.x : 4 * X_SPACING;
                    const parentY = yPositions[parentId];
                    const childX = parentX + X_SPACING;

                    children.forEach((cd, idx) => {
                        const childY = parentY + idx * Y_SPACING;
                        yPositions[cd.id] = childY;
                        updates.push({ id: cd.id, x: childX, y: childY });
                        if (childY >= currentY) currentY = childY + Y_SPACING;
                    });
                    cryptoChanged = true;
                }
            }

            // Position Services (L1): Average Y of their users
            services.forEach(s => {
                const connectedUsers = users.filter(u => userToParent[u.id] === s.id).map(u => u.id);
                let y = 0;
                if (connectedUsers.length > 0) {
                    const ySum = connectedUsers.reduce((sum, uid) => sum + (yPositions[uid] || 0), 0);
                    y = ySum / connectedUsers.length;
                } else {
                    y = currentY;
                    currentY += Y_SPACING;
                }
                yPositions[s.id] = y;
                updates.push({ id: s.id, x: 1 * X_SPACING, y });
            });

            // Position Domain (L0): Snap to First Superuser or Average Y
            let maxDomainY = 0;
            // Iterate roots, preserving `yPositions` mapping natively
            domains.forEach(d => {
                let y = null;

                // STRATEGY 1: Deep search for linked users
                const linkedUserIds = new Set();
                edges.forEach(e => {
                    if (e.from === d.id && (e._data.type === 'domain-user' || e._data.type === 'direct-org-user' || e._data.type === 'hub-user' || e._data.type === 'service-user')) {
                        linkedUserIds.add(e.to);
                    }
                });

                // Also check through connected services recursively
                edges.forEach(e1 => {
                    if (e1.from === d.id && e1._data.type === 'domain-service') {
                        edges.forEach(e2 => {
                            if (e2.from === e1.to && (e2._data.type === 'service-user' || e2._data.type === 'direct-org-user')) {
                                linkedUserIds.add(e2.to);
                            }
                        });
                    }
                });

                // Match with their designated superusers prioritizing root superusers mathematically
                for (const uid of linkedUserIds) {
                    const suId = userToSuperuser[uid];
                    if (suId && yPositions[suId] !== undefined) {
                        y = yPositions[suId];
                        break;
                    }
                }

                if (y === null) {
                    // Fallback math average if users exist but skipped superuser linkage
                    if (linkedUserIds.size > 0) {
                        let ySum = 0;
                        linkedUserIds.forEach(uid => ySum += (yPositions[uid] || 0));
                        y = ySum / linkedUserIds.size;
                    } else {
                        // Completely disconnected hub (e.g., an empty email hub search)
                        y = maxDomainY;
                    }
                }

                // Extra failsafe to ensure domains don't mathematically collide on identical Y levels natively
                yPositions[d.id] = y;
                if (y >= maxDomainY) maxDomainY = y + Y_SPACING;

                updates.push({ id: d.id, x: 0, y });
            });

            // Apply calculated positions
            this.nodesDataset.update(updates);

            const options = {
                layout: {
                    hierarchical: {
                        enabled: false // Override vis.js, we plotted everything manually
                    }
                },
                interaction: {
                    hover: true,
                    dragNodes: true,
                    dragView: true,
                    zoomView: true,
                },
                edges: {
                    smooth: {
                        type: 'cubicBezier',
                        roundness: 0.4
                    }
                },
                physics: {
                    enabled: false // Freeze completely
                }
            };
            this.network.setOptions(options);

            // Fit the view to our new manual tree
            if (!skipFit) {
                setTimeout(() => {
                    if (this.network) this.network.fit();
                }, 50);
            }

        } else {
            // Centralized mode: restore force-directed layout and straight edges
            // Unfix coordinates by scattering them over an area proportional to node count!
            // If we cram 1000 nodes in a 200x200 box, the physics engine will freeze the main thread.
            const nodes = this.nodesDataset.get();
            const spread = Math.sqrt(nodes.length) * 150;
            const updates = nodes.map(n => ({
                id: n.id,
                x: (Math.random() * spread) - (spread / 2),
                y: (Math.random() * spread) - (spread / 2),
                fixed: { x: false, y: false } // ensure they are free to move
            }));
            this.nodesDataset.update(updates);

            const options = {
                layout: {
                    hierarchical: {
                        enabled: false
                    }
                },
                interaction: {
                    hover: true,
                    dragNodes: true,
                    dragView: true,
                    zoomView: true,
                },
                edges: {
                    smooth: {
                        type: 'continuous',
                        roundness: 0.3
                    }
                },
                physics: {
                    enabled: true,
                    solver: 'forceAtlas2Based'
                }
            };
            this.network.setOptions(options);

            // Re-apply the saved physics damping
            const savedPhysics = localStorage.getItem('visPhysicsConfig') || 'fast';
            this.setPhysics(savedPhysics);

            if (!skipFit) {
                setTimeout(() => {
                    if (this.network) this.network.fit();
                }, 50);
            }
        }
    }

    /**
     * Set graph physics parameters
     * @param {string} mode - 'smooth', 'medium', 'fast', 'blocked'
     */
    setPhysics(mode) {
        if (!this.network) return;

        // If we are in hierarchical mode, changing physics shouldn't override solver to forceAtlas2Based. 
        // We only conditionally update damping if not hierarchical, or we set physics enabled false
        const options = {
            physics: {
                enabled: mode !== 'blocked',
            }
        };

        // Only manage forceAtlas2Based damping if not blocked
        if (mode !== 'blocked') {
            options.physics.forceAtlas2Based = {};
            if (mode === 'smooth') {
                options.physics.forceAtlas2Based.damping = 0.4;
            } else if (mode === 'medium') {
                options.physics.forceAtlas2Based.damping = 0.7;
            } else if (mode === 'fast') {
                options.physics.forceAtlas2Based.damping = 0.9;
            }
        }

        this.network.setOptions(options);
    }

    clear() {
        this.nodesDataset.clear();
        this.edgesDataset.clear();
        this.allNodesData = [];
        this.allEdgesData = [];
        this.deletedNodes.clear();
        this.nodeHistory = [];
        this.actionStack = [];
        this.redoStack = [];
        this.selectedNodeId = null;
        this.connectionMode = false;
        this.connectionSourceId = null;
        this.explorationNodeIds.clear();
        this.explorationEdgeIds.clear();
        this.explorationVisible = true;
        this.exploredUserIds.clear();
        if (this._blinkIntervals) {
            for (const interval of this._blinkIntervals.values()) clearInterval(interval);
            this._blinkIntervals.clear();
        }
    }

    destroy() {
        if (this.network) {
            this.network.destroy();
            this.network = null;
        }
    }
}

