import React, { useMemo } from 'react';
import ReactFlow, {
    Controls,
    Background,
    MarkerType,
    Handle,
    Position
} from 'reactflow';
import type { Node, Edge, NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import { useDebug } from '../contexts/DebugContext';

// --- Custom Node ---
// Displays struct name and fields.
// Logic: If a field is a pointer (next, left, etc.), we add a Handle.
const StructNode = ({ data }: NodeProps) => {
    return (
        <div className="bg-gray-800 border-2 border-blue-500 rounded min-w-[150px] shadow-lg text-xs font-mono">
            <div className="bg-blue-600 text-white px-2 py-1 font-bold truncate">
                {data.label}
            </div>
            <div className="p-2 space-y-1 text-gray-300">
                {data.fields.map((f: any, i: number) => (
                    <div key={i} className="flex justify-between relative group">
                        <span className="text-blue-300 mr-2">{f.name}:</span>
                        <span className="truncate max-w-[100px]" title={f.value}>{f.value}</span>

                        {/* If this field is a pointer/connection, add a Handle */}
                        {/* We use the field name as the handle ID to link edges correctly */}
                        {f.isPointer && (
                            <Handle
                                type="source"
                                position={Position.Right}
                                id={f.name}
                                style={{ background: '#3b82f6', right: -13, width: 8, height: 8 }}
                            />
                        )}
                    </div>
                ))}
            </div>
            {/* Main Target Handle for incoming connections */}
            <Handle type="target" position={Position.Left} style={{ background: '#3b82f6', width: 10, height: 10 }} />
        </div>
    );
};

const nodeTypes = { struct: StructNode };

const GraphPanel: React.FC = () => {
    const { variables, varChildren, varObjects, expandedVars } = useDebug();

    const { nodes, edges } = useMemo(() => {
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // Map: AddressString -> NodeData
        const addressMap = new Map<string, { id: string, label: string, fields: any[], isGhost: boolean }>();
        const pendingEdges: { fromAddr: string, toAddr: string, fieldName: string }[] = [];

        // Helper to extract hex address safely
        const getAddress = (val: string): string | null => {
            const match = val.match(/(0x[0-9a-fA-F]+)/);
            return match ? match[1] : null;
        };

        // 1. Identify Root Nodes from Top-Level Variables
        variables.forEach(v => {
            const addr = getAddress(v.value);
            // Only treat as graph node if it looks like a pointer and has an address
            // We ignore string literals that might look like pointers unless type explicitly says pointer?
            // For safety, check if type has '*' or if value is purely hex.
            const isPointer = v.type?.includes('*') || v.value.startsWith('0x');

            if (isPointer && addr && addr !== '0x0') { // 0x0 is NULL
                const gdbId = varObjects[v.name];
                const children = gdbId ? varChildren[gdbId] : [];

                // Fields logic
                const fields = children?.map(c => ({
                    name: c.exp,
                    value: c.value,
                    isPointer: (c.type?.includes('*')) || getAddress(c.value) !== null
                })) || [];

                addressMap.set(addr, {
                    id: addr, // Use Address as ID for uniquing
                    label: v.name,
                    fields,
                    isGhost: false
                });

                // Collect outgoing potential edges from fields
                fields.forEach(f => {
                    if (f.isPointer) {
                        const targetAddr = getAddress(f.value);
                        if (targetAddr && targetAddr !== '0x0') {
                            pendingEdges.push({ fromAddr: addr, toAddr: targetAddr, fieldName: f.name });
                        }
                    }
                });
            }
        });

        // 2. Handle "Ghost Nodes" (targets that aren't top-level vars)
        // If a field points to an address we haven't seen, create a placeholder node
        // But only if we want to show deep structures.
        // For now, let's include them to show connectivity, but label them "Node @ 0x..."
        pendingEdges.forEach(edge => {
            if (!addressMap.has(edge.toAddr)) {
                addressMap.set(edge.toAddr, {
                    id: edge.toAddr,
                    label: `${edge.toAddr}`,
                    fields: [], // We don't know fields yet
                    isGhost: true
                });
            }
        });

        // 3. Layout and Node Creation
        // Naive Layout: Grid based on iteration order?
        // Or rank based?
        // Let's use a Map to track X,Y to prevent overlap
        let xPos = 0;
        let yPos = 0;
        const GRID_WIDTH = 250;
        const GRID_HEIGHT = 200;
        const COLS = 4;

        Array.from(addressMap.values()).forEach((nodeData, idx) => {
            const x = (idx % COLS) * GRID_WIDTH + 50;
            const y = Math.floor(idx / COLS) * GRID_HEIGHT + 50;

            newNodes.push({
                id: nodeData.id,
                type: 'struct',
                position: { x, y },
                data: { label: nodeData.label, fields: nodeData.fields },
                // Highlight ghost nodes differently?
                style: nodeData.isGhost ? { opacity: 0.7 } : {}
            });
        });

        // 4. Edge Creation
        pendingEdges.forEach((edge, idx) => {
            newEdges.push({
                id: `e-${edge.fromAddr}-${edge.fieldName}-${idx}`,
                source: edge.fromAddr,
                target: edge.toAddr,
                sourceHandle: edge.fieldName, // The field handle
                targetHandle: null, // Connects to the main Block handle
                animated: true,
                style: { stroke: '#3b82f6', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
            });
        });

        return { nodes: newNodes, edges: newEdges };

    }, [variables, varChildren, varObjects]);

    return (
        <div style={{ width: '100%', height: '100%' }} className="bg-gray-900">
            {nodes.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-xs">
                    Expand variables in the "Variables" tab to see them here.
                </div>
            ) : (
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    fitView
                    attributionPosition="bottom-right"
                >
                    <Background color="#333" gap={16} />
                    <Controls />
                </ReactFlow>
            )}
        </div>
    );
};

export default GraphPanel;
