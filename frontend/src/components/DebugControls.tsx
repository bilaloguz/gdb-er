import React, { useState } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useAnalysis } from '../contexts/AnalysisContext';
import { Play, FastForward, SkipForward, Square, Bug, Pause } from 'lucide-react';
import { useDebug } from '../contexts/DebugContext';

interface DebugControlsProps {
    debugTarget: string | null;
    currentFile: string | null;
}

export const DebugControls: React.FC<DebugControlsProps> = ({ debugTarget, currentFile }) => {
    const { sendMessage, isConnected, messages } = useWebSocket();
    const { setAnalysisResult } = useAnalysis();
    const { status, stack } = useDebug();

    // ... (rest of component until analyze button)



    // Internal state for error display
    const [lastError, setLastError] = useState<string | null>(null);

    // Warn if no target
    const effectiveTarget = debugTarget || "";

    // Derived Status Helpers
    const isPaused = status === 'Paused';
    // const isRunning = status === 'Running'; // Unused
    const isReady = status === 'Ready' || status === 'Exited';

    // Listen for Errors
    React.useEffect(() => {
        if (!messages.length) return;
        const lastMsg = messages[messages.length - 1];

        if (lastMsg.type === 'error') { // From backend explicit error
            setLastError(lastMsg.payload);
        } else if (lastMsg.type === 'result' && lastMsg.message === 'error') { // Legacy result error
            setLastError(lastMsg.payload?.msg || "Unknown Error");
        } else if (lastMsg.type === 'state_update') {
            setLastError(null);
        }
    }, [messages]);

    const handleRun = () => {
        setAnalysisResult(null); // Clear old analysis
        if (isPaused) {
            sendMessage('continue');
        } else {
            sendMessage('run', { stop_at_entry: true });
        }
    };

    const handleNext = () => sendMessage('next');
    const handleStep = () => sendMessage('step');
    const handleStop = () => sendMessage('stop');

    const handleReInit = () => {
        setAnalysisResult(null); // Clear old analysis
        if (!effectiveTarget) {
            setLastError("No Debug Target selected! (Right-click a file in Explorer)");
            return;
        }
        setLastError(null);
        sendMessage('init', { executable: effectiveTarget });
    };

    if (!isConnected) return <div className="p-4 text-red-500 font-mono text-xs">Disconnected from Backend</div>;

    return (
        <div className="p-2 bg-gray-900 border-b border-gray-700 flex flex-col gap-1">

            {/* Top Row: Status & Config */}
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                    <div className="mr-2 text-xs font-mono flex items-center gap-1">
                        <span className="text-gray-500 text-[10px]">STATUS:</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold leading-none
                            ${status === "Ready" ? "bg-gray-700 text-gray-300" : ""}
                            ${status === "Running" ? "bg-green-900 text-green-300 animate-pulse" : ""}
                            ${status === "Paused" ? "bg-yellow-900 text-yellow-300" : ""}
                            ${status === "Exited" ? "bg-gray-800 text-gray-400" : ""}
                            ${status === "Stopped" ? "bg-red-900 text-red-300" : ""}
                        `}>{status.toUpperCase()}</span>
                    </div>

                    <input
                        type="text"
                        value={effectiveTarget}
                        readOnly
                        className={`bg-gray-800 text-white px-2 py-0.5 rounded textxs w-48 border border-gray-700 font-mono text-[10px] ${!effectiveTarget ? 'border-red-500/50' : ''}`}
                        placeholder="Select Target..."
                        title={effectiveTarget || "No Target Selected"}
                    />

                    <button
                        onClick={handleReInit}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded flex items-center gap-1 text-[10px] font-bold transition-colors uppercase leading-none"
                    >
                        Init
                    </button>
                </div>

                <div className="h-4 w-px bg-gray-700 mx-1" />

                {/* Debug Actions */}
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={handleRun}
                        disabled={status === 'Running'}
                        className={`p-1 rounded transition-colors ${status === 'Running' ? 'text-gray-600 cursor-not-allowed' :
                            isPaused ? 'text-green-400 hover:bg-green-900/30' : 'text-green-500 hover:bg-gray-800'
                            }`}
                        title={isPaused ? "Continue" : "Start"}
                    >
                        <Play size={16} fill={isPaused ? "currentColor" : "none"} />
                    </button>

                    <button
                        onClick={handleNext}
                        disabled={!isPaused}
                        className={`p-1 rounded transition-colors ${!isPaused ? 'text-gray-600 cursor-not-allowed' : 'text-blue-400 hover:bg-gray-800'}`}
                        title="Next (Step Over)"
                    >
                        <SkipForward size={16} />
                    </button>

                    <button
                        onClick={handleStep}
                        disabled={!isPaused}
                        className={`p-1 rounded transition-colors ${!isPaused ? 'text-gray-600 cursor-not-allowed' : 'text-yellow-400 hover:bg-gray-800'}`}
                        title="Step (Step Into)"
                    >
                        <FastForward size={16} />
                    </button>

                    <button
                        onClick={handleStop}
                        disabled={isReady || status === 'Exited'}
                        className={`p-1 rounded transition-colors ${isReady || status === 'Exited' ? 'text-gray-600 cursor-not-allowed' : 'text-red-500 hover:bg-gray-800'}`}
                        title="Stop Execution"
                    >
                        <Square size={16} fill="currentColor" />
                    </button>
                </div>

                <div className="h-4 w-px bg-gray-700 mx-1" />

                {/* Analyze Button */}
                <button
                    onClick={async () => {
                        sendMessage('get_context'); // Trigger refresh just in case
                        try {
                            const resp = await fetch('http://localhost:8000/api/analyze', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    stack_trace: stack,
                                    exception_msg: "Analyze current state " + new Date().toISOString(),
                                    recent_logs: "User requested analysis",
                                    current_file: currentFile
                                })
                            });
                            const data = await resp.json();
                            setAnalysisResult(data);
                        } catch (e) {
                            setAnalysisResult({
                                explanation: "Analysis Service Error",
                                suggested_fix: "Check if SLM service is running (port 8002)."
                            });
                        }
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-colors uppercase leading-none"
                    style={{ marginLeft: 'auto' }} // Push to end if needed, or just fit
                >
                    <Bug size={12} /> Analyze
                </button>
            </div>

            {/* Error Banner */}
            {lastError && (
                <div className="bg-red-900/30 border border-red-900/50 text-red-300 px-3 py-1 rounded text-xs font-mono flex items-center animate-in fade-in slide-in-from-top-1">
                    <span className="font-bold mr-2">⚠ Error:</span>
                    {lastError}
                </div>
            )}
        </div>
    );
};
