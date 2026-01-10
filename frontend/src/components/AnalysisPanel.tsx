import React from 'react';
import { X, AlertCircle, Lightbulb, Code } from 'lucide-react';

interface AnalysisResult {
    explanation: any;
    suggested_fix: any;
    related_code?: any[];
}

interface AnalysisPanelProps {
    result: AnalysisResult | null;
    onClose: () => void;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ result, onClose }) => {
    if (!result) return null;

    const renderContent = (content: any) => {
        if (typeof content === 'string') return content;
        if (typeof content === 'object') {
            // Check for specific known schema from error message
            if (content.reasoning && content.code_change) {
                return (
                    <div className="flex flex-col gap-2">
                        <div><span className="font-bold text-purp-300">Reasoning:</span> {content.reasoning}</div>
                        <div className="bg-black p-2 rounded text-xs font-mono">{content.code_change}</div>
                    </div>
                );
            }
            return <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(content, null, 2)}</pre>;
        }
        return String(content);
    };

    const [isMinimized, setIsMinimized] = React.useState(false);

    if (isMinimized) {
        return (
            <div className="absolute top-4 right-4 z-50">
                <button
                    onClick={() => setIsMinimized(false)}
                    className="bg-purple-900 border border-purple-700 text-purple-300 p-2 rounded shadow-xl hover:bg-purple-800 flex items-center gap-2 animate-in fade-in slide-in-from-right-10"
                    title="Expand AI Analysis"
                >
                    <AlertCircle size={20} />
                    <span className="text-xs font-bold">Analysis Ready</span>
                </button>
            </div>
        );
    }

    return (
        <div className="absolute top-0 right-0 h-full w-[600px] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col z-50 animate-in slide-in-from-right-full duration-200">
            {/* Header */}
            <div className="bg-purple-900 px-4 py-3 flex items-center justify-between border-b border-purple-700">
                <div className="flex items-center gap-2">
                    <AlertCircle size={20} className="text-purple-300" />
                    <h2 className="font-semibold text-white">AI Analysis</h2>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsMinimized(true)}
                        className="text-purple-300 hover:text-white p-1 rounded hover:bg-purple-800"
                        title="Minimize"
                    >
                        <div className="w-4 h-0.5 bg-current my-2"></div>
                    </button>
                    <button
                        onClick={onClose}
                        className="text-purple-300 hover:text-white p-1 rounded hover:bg-purple-800"
                        title="Close"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Explanation Section */}
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertCircle size={18} className="text-red-400" />
                        <h3 className="font-semibold text-white">Problem Identified</h3>
                    </div>
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                        {renderContent(result.explanation)}
                    </div>
                </div>

                {/* Suggested Fix Section */}
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                        <Lightbulb size={18} className="text-yellow-400" />
                        <h3 className="font-semibold text-white">Suggested Fix</h3>
                    </div>
                    <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                        {renderContent(result.suggested_fix)}
                    </div>
                </div>

                {/* Code Snippet Section */}
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center gap-2 mb-3">
                        <Code size={18} className="text-blue-400" />
                        <h3 className="font-semibold text-white">Related Code</h3>
                    </div>
                    <div className="bg-black rounded p-3 font-mono text-xs text-gray-400">
                        {result.related_code && result.related_code.length > 0 ? (
                            result.related_code.map((snippet: any, idx: number) => (
                                <div key={idx} className="mb-4 border-b border-gray-800 pb-2 last:border-0 last:pb-0 last:mb-0">
                                    <pre className="whitespace-pre-wrap break-words">{typeof snippet === 'string' ? snippet : JSON.stringify(snippet, null, 2)}</pre>
                                </div>
                            ))
                        ) : (
                            <div className="text-gray-500 italic">No context retrieved.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-800 px-4 py-3 border-t border-gray-700">
                <p className="text-xs text-gray-500 text-center">
                    Powered by Local SLM • Privacy-First
                </p>
            </div>
        </div>
    );
};
