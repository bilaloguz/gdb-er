
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWebSocket } from './WebSocketContext';

type StackFrame = {
    level: string;
    addr: string;
    func: string;
    file: string;
    line: string;
};

type Variable = {
    name: string;
    value: string;
    type?: string;
};

type DebugContextType = {
    stack: StackFrame[];
    variables: Variable[];
    isRunning: boolean;
    status: string;
    breakpoints: Breakpoint[];
    toggleBreakpoint: (file: string, line: number) => void;

    // Deep Inspection
    expandedVars: Record<string, boolean>; // UI state: is expression expanded?
    toggleExpansion: (expression: string, gdbVarId?: string) => void;
    // We map generic expressions (names) to GDB Var IDs (var1)
    varObjects: Record<string, string>; // expression -> gdbVarId
    varChildren: Record<string, any[]>; // gdbVarId -> children list
    // Memory Inspection
    memoryData: { address: string; contents: string } | null;
    readMemory: (address: string, count?: number) => void;
};

export interface Breakpoint {
    id: string;
    file: string;
    line: number;
}

const DebugContext = createContext<DebugContextType | null>(null);

export const DebugProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { messages, sendMessage } = useWebSocket();
    const [stack, setStack] = useState<StackFrame[]>([]);
    const [variables, setVariables] = useState<Variable[]>([]);
    const [status, setStatus] = useState<string>("Ready");
    const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);

    // Deep Inspection State
    const [expandedVars, setExpandedVars] = useState<Record<string, boolean>>({});
    const [varObjects, setVarObjects] = useState<Record<string, string>>({});
    const [varChildren, setVarChildren] = useState<Record<string, any[]>>({});

    // Memory Inspection
    const [memoryData, setMemoryData] = useState<{ address: string; contents: string } | null>(null);

    // Derived for backward compatibility
    const isRunning = status === 'Running';

    useEffect(() => {
        if (!messages.length) return;
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) return;

        if (lastMsg.type === 'state_update') {
            const payload = lastMsg.payload;
            setStatus(payload.status);
            setStack(payload.stack || []);
            setVariables(payload.variables || []);
            if (payload.status === 'Running') {
                setVarObjects({});
                setVarChildren({});
                setExpandedVars({});
                setMemoryData(null);
            }
        } else if (lastMsg.type === 'breakpoint_created') {
            const bp = lastMsg.payload;
            setBreakpoints(prev => {
                if (prev.some(b => b.id === bp.id)) return prev;
                return [...prev, { id: bp.id, file: bp.file, line: parseInt(bp.line) }];
            });
        } else if (lastMsg.type === 'memory_read') {
            setMemoryData(lastMsg.payload);
        }
    }, [messages]);

    // Ref to track what we are currently expanding
    const pendingExpansionRef = React.useRef<string | null>(null);

    // Update effect to handle var_creation and children
    useEffect(() => {
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg) return;

        if (lastMsg.type === 'var_created') {
            if (pendingExpansionRef.current) {
                const expr = pendingExpansionRef.current;
                setVarObjects(prev => ({ ...prev, [expr]: lastMsg.payload.name }));
                const numchild = parseInt(lastMsg.payload.numchild);
                if (numchild > 0) {
                    sendMessage('var_list_children', { name: lastMsg.payload.name });
                } else {
                    pendingExpansionRef.current = null;
                }
            }
        } else if (lastMsg.type === 'var_children') {
            if (pendingExpansionRef.current) {
                const expr = pendingExpansionRef.current;
                const gdbVarId = varObjects[expr];

                // Try to find the target ID if strict mapping fails
                const targetId = varObjects[expr];
                if (targetId) {
                    const children = lastMsg.payload.children || [];
                    setVarChildren(prev => ({ ...prev, [targetId]: children }));
                    pendingExpansionRef.current = null;
                }
            }
        }
    }, [messages, varObjects]);

    const toggleBreakpoint = (file: string, line: number) => {
        const existing = breakpoints.find(b =>
            (b.file === file || file.endsWith(b.file) || b.file.endsWith(file)) &&
            b.line === line
        );
        if (existing) {
            setBreakpoints(prev => prev.filter(b => b.id !== existing.id));
            sendMessage('remove_breakpoint', { id: existing.id });
        } else {
            sendMessage('break', { location: `${file}:${line}` });
        }
    };

    const toggleExpansion = (expression: string, gdbVarId?: string) => {
        const isExpanded = !!expandedVars[expression];
        if (isExpanded) {
            setExpandedVars(prev => {
                const next = { ...prev };
                delete next[expression];
                return next;
            });
        } else {
            setExpandedVars(prev => ({ ...prev, [expression]: true }));
            pendingExpansionRef.current = expression;
            if (!gdbVarId) {
                sendMessage('var_create', { expression });
            }
        }
    };

    const readMemory = (address: string, count: number = 256) => {
        setMemoryData(null);
        sendMessage('read_memory', { address, count });
    };

    return (
        <DebugContext.Provider value={{
            stack, variables, isRunning, status, breakpoints, toggleBreakpoint,
            expandedVars, toggleExpansion, varObjects, varChildren,
            memoryData, readMemory
        }}>
            {children}
        </DebugContext.Provider>
    );
};

export const useDebug = () => {
    const context = useContext(DebugContext);
    if (!context) {
        throw new Error("useDebug must be used within a DebugProvider");
    }
    return context;
};
