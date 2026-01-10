

import React, { useState } from 'react';
import { useDebug } from '../contexts/DebugContext';
import clsx from 'clsx';
import { ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import GraphPanel from './GraphPanel';

interface VariableTreeItemProps {
    name: string;
    value: string;
    expression: string; // The path to this variable (e.g. "my_struct.field")
    level: number;
    type?: string;
    existingGdbId?: string;
}
const VariableTreeItem: React.FC<VariableTreeItemProps> = ({ name, value, expression, level, type, existingGdbId }) => {
    const { expandedVars, toggleExpansion, varObjects, varChildren } = useDebug();

    // If passed an existing ID (child), use it. Else lookup from expression (root).
    const gdbVarId = existingGdbId || varObjects[expression];
    const isExpanded = !!expandedVars[expression];
    const children = gdbVarId ? varChildren[gdbVarId] : undefined;

    // behavior for root vs children.
    // For root (no GDB ID yet), look at value string for hints ({...}, 0x...) OR type (*, struct).
    const safeValue = value || "";
    const seemsComplex =
        safeValue.includes('{') ||
        safeValue.includes('(') ||
        safeValue.includes('=') ||
        safeValue.startsWith('*') ||
        safeValue.startsWith('0x') ||
        (type ? (type.includes('*') || type.includes('struct') || type.includes('class')) : false);

    const showArrow = seemsComplex || children?.length || (isExpanded && !children); // Keep arrow if loading

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleExpansion(expression, gdbVarId);
    };

    return (
        <div className="select-none">
            <div
                className={`flex items-start py-0.5 hover:bg-gray-800 cursor-pointer text-xs font-mono`}
                style={{ paddingLeft: `${level * 12 + 4}px` }}
                onClick={handleToggle}
            >
                {/* Arrow */}
                <div className="mr-1 mt-0.5 text-gray-500 w-4 flex-shrink-0">
                    {showArrow && (
                        isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    )}
                    {!showArrow && <div className="w-3" />}
                </div>

                {/* Content */}
                <div className="flex-1 truncate">
                    <span className="text-blue-400 mr-2 font-bold">{name}</span>
                    <span className="text-gray-300 whitespace-pre-wrap break-all">{safeValue}</span>
                </div>

                {/* Loading Indicator */}
                {isExpanded && !children && !gdbVarId && (
                    <RefreshCw size={10} className="animate-spin text-gray-500 mr-2" />
                )}
            </div>

            {/* Children */}
            {isExpanded && children && (
                <div>
                    {children.map((child: any) => (
                        <VariableTreeItem
                            key={child.name} // This is the GDB unique ID for the child var object (e.g. var1.child)
                            name={child.exp}
                            value={child.value}
                            // We use the internal GDB Name (child.name) as the key/expression for the next level.
                            expression={child.name}
                            level={level + 1}
                            type={child.type}
                            existingGdbId={child.name} // Pass the ID so we don't try to create it again
                        />
                    ))}
                </div>
            )}
        </div>
    );
};


const DebugInfoPanel: React.FC = () => {
    const { variables, stack, memoryData, readMemory } = useDebug();
    const [activeTab, setActiveTab] = useState<'variables' | 'stack' | 'memory' | 'graph'>('variables');
    const [memAddress, setMemAddress] = useState("&head"); // Default suggestion

    const handleReadMemory = (e?: React.FormEvent) => {
        e?.preventDefault();
        readMemory(memAddress, 256);
    };

    const renderMemory = () => {
        if (!memoryData) {
            return (
                <div className="p-4 text-xs text-center text-gray-500">
                    Enter an address (e.g. 0x..., &var) to view memory.
                </div>
            );
        }

        const rows = [];
        const bytes = memoryData.contents.match(/.{1,2}/g) || [];
        const startAddr = BigInt(memoryData.address);

        for (let i = 0; i < bytes.length; i += 16) {
            const chunk = bytes.slice(i, i + 16);
            const hex = chunk.join(' ').padEnd(47, ' ');
            const ascii = chunk.map((b: string) => {
                const code = parseInt(b, 16);
                return code >= 32 && code <= 126 ? String.fromCharCode(code) : '.';
            }).join('');

            const addr = (startAddr + BigInt(i)).toString(16).padStart(16, '0');

            rows.push(
                <div key={i} className="flex font-mono hover:bg-gray-800">
                    <span className="text-gray-500 mr-3 select-all">0x{addr}</span>
                    <span className="text-blue-300 mr-3 w-[300px]">{hex}</span>
                    <span className="text-gray-400 opacity-70">{ascii}</span>
                </div>
            );
        }

        return (
            <div className="font-mono text-xs p-2 whitespace-pre">
                {rows}
            </div>
        );
    };

    return (
        <div className="bg-gray-900 border-t border-gray-700 h-full flex flex-col">
            <div className="flex border-b border-gray-800">
                <button
                    className={clsx("px-4 py-2 text-xs font-semibold", activeTab === 'variables' ? "text-white border-b-2 border-blue-500 bg-gray-800" : "text-gray-400 hover:text-white")}
                    onClick={() => setActiveTab('variables')}
                >
                    Variables
                </button>
                <button
                    className={clsx("px-4 py-2 text-xs font-semibold", activeTab === 'stack' ? "text-white border-b-2 border-blue-500 bg-gray-800" : "text-gray-400 hover:text-white")}
                    onClick={() => setActiveTab('stack')}
                >
                    Call Stack
                </button>
                <button
                    className={clsx("px-4 py-2 text-xs font-semibold", activeTab === 'memory' ? "text-white border-b-2 border-blue-500 bg-gray-800" : "text-gray-400 hover:text-white")}
                    onClick={() => setActiveTab('memory')}
                >
                    Memory
                </button>
                <button
                    className={clsx("px-4 py-2 text-xs font-semibold", activeTab === 'graph' ? "text-white border-b-2 border-blue-500 bg-gray-800" : "text-gray-400 hover:text-white")}
                    onClick={() => setActiveTab('graph')}
                >
                    Graph
                </button>
            </div>

            <div className="flex-1 overflow-auto p-0">
                {activeTab === 'variables' && (
                    variables.length === 0 ? (
                        <div className="text-gray-600 text-xs italic p-4">No variables available</div>
                    ) : (
                        <div className="py-2">
                            {variables.map((v, i) => (
                                <VariableTreeItem key={i} name={v.name} value={v.value} type={v.type} expression={v.name} level={0} />
                            ))}
                        </div>
                    )
                )}

                {activeTab === 'stack' && (
                    stack.length === 0 ? (
                        <div className="text-gray-600 text-xs italic p-4">No stack trace available</div>
                    ) : (
                        <ul className="space-y-0.5 p-2">
                            {stack.map((s, i) => (
                                <li key={i} className="text-xs font-mono text-gray-300 border-b border-gray-800 pb-1 hover:bg-gray-800 cursor-pointer px-2 py-1 rounded">
                                    <div className="flex justify-between text-gray-500 text-[10px]">
                                        <span>#{s.level}</span>
                                        <span>{s.addr}</span>
                                    </div>
                                    <div className="text-yellow-400 font-bold">{s.func}</div>
                                    <div className="text-gray-400 truncate" title={`${s.file}:${s.line}`}>{s.file}:{s.line}</div>
                                </li>
                            ))}
                        </ul>
                    )
                )}

                {activeTab === 'memory' && (
                    <div className="flex flex-col h-full">
                        <form onSubmit={handleReadMemory} className="flex p-2 border-b border-gray-800">
                            <input
                                type="text"
                                value={memAddress}
                                onChange={(e) => setMemAddress(e.target.value)}
                                className="bg-gray-800 text-gray-300 text-xs border border-gray-600 rounded px-2 py-1 flex-1 mr-2 font-mono"
                                placeholder="&head or 0x..."
                            />
                            <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded">
                                Read
                            </button>
                        </form>
                        <div className="flex-1 overflow-auto">
                            {renderMemory()}
                        </div>
                    </div>
                )}

                {activeTab === 'graph' && (
                    <GraphPanel />
                )}
            </div>
        </div>
    );
};

export default DebugInfoPanel;
