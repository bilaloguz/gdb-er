import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

type WebSocketContextType = {
    isConnected: boolean;
    messages: any[];
    sendMessage: (action: string, args?: any) => void;
    sessionId: string;
    clearMessages: () => void;
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState<any[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const [sessionId] = useState(() => {
        const stored = localStorage.getItem("gdb_session_id");
        if (stored) return stored;
        const newId = "session-" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("gdb_session_id", newId);
        return newId;
    });

    useEffect(() => {
        const wsUrl = `ws://localhost:8000/ws/${sessionId}`;
        console.log("Connecting to", wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WebSocket Connected");
            setIsConnected(true);
        };

        ws.onclose = () => {
            console.log("WebSocket Disconnected");
            setIsConnected(false);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log("Received:", data);
                setMessages((prev) => [...prev, data]);
            } catch (e) {
                console.error("Failed to parse message", event.data);
            }
        };

        return () => {
            ws.close();
        };
    }, [sessionId]);

    const sendMessage = useCallback((action: string, args: any = {}) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const payload = JSON.stringify({ action, args });
            console.log("Sending:", payload);
            wsRef.current.send(payload);
        } else {
            console.warn("WebSocket not connected");
        }
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    return (
        <WebSocketContext.Provider value={{ isConnected, messages, sendMessage, sessionId, clearMessages }}>
            {children}
        </WebSocketContext.Provider>
    );
};

export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) {
        throw new Error("useWebSocket must be used within a WebSocketProvider");
    }
    return context;
};
