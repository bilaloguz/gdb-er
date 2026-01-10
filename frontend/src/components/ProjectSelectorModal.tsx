
import React, { useState, useEffect } from 'react';
import { Folder, ArrowUp, Check, X } from 'lucide-react';

interface ProjectSelectorModalProps {
    currentPath: string;
    onSelect: (path: string) => void;
    onClose: () => void;
}

interface DirEntry {
    name: string;
    is_dir: boolean;
    path: string;
}

export const ProjectSelectorModal: React.FC<ProjectSelectorModalProps> = ({ currentPath, onSelect, onClose }) => {
    const [path, setPath] = useState(currentPath || '/home');
    const [entries, setEntries] = useState<DirEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadDir = async (targetPath: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('http://localhost:8000/api/files/ls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: targetPath })
            });
            const data = await res.json();

            if (data.error) {
                setError(data.error);
            } else {
                setPath(data.path);
                setEntries(data.entries);
            }
        } catch (e) {
            setError("Failed to connect to backend");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDir(path);
    }, []);

    const handleGoUp = () => {
        // Simple string manipulation for parent
        const parent = path.split('/').slice(0, -1).join('/') || '/';
        loadDir(parent);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl h-[600px] flex flex-col shadow-2xl">

                {/* Header */}
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Folder className="text-blue-400" />
                        Select Project Root
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Path Bar */}
                <div className="p-2 bg-gray-950 flex items-center gap-2 border-b border-gray-800">
                    <button
                        onClick={handleGoUp}
                        className="p-2 hover:bg-gray-800 rounded text-gray-400"
                        title="Go Up"
                    >
                        <ArrowUp size={18} />
                    </button>
                    <input
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm font-mono text-gray-300 focus:outline-none focus:border-blue-500"
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadDir(path)}
                    />
                    <button
                        onClick={() => loadDir(path)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-bold"
                    >
                        Go
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-2">
                    {loading && <div className="text-center text-gray-500 p-4">Loading...</div>}
                    {error && <div className="text-red-400 p-4 bg-red-900/20 rounded mb-2">{error}</div>}

                    {!loading && entries.map(entry => (
                        <div
                            key={entry.path}
                            className={`flex items-center gap-2 p-2 rounded cursor-pointer ${entry.is_dir ? 'hover:bg-gray-800 text-gray-200' : 'text-gray-500 opacity-50 cursor-not-allowed'}`}
                            onClick={() => entry.is_dir && loadDir(entry.path)}
                        >
                            <Folder size={16} className={entry.is_dir ? "text-yellow-600" : "text-gray-600"} />
                            <span className="flex-1 truncate font-mono text-sm">{entry.name}</span>
                        </div>
                    ))}

                    {!loading && entries.length === 0 && !error && (
                        <div className="text-gray-500 italic p-4">Empty directory</div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800 flex justify-end gap-2 bg-gray-950">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded text-gray-400 hover:text-white"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSelect(path)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded flex items-center gap-2 font-bold shadow-lg"
                    >
                        <Check size={18} />
                        Select This Folder
                    </button>
                </div>
            </div>
        </div>
    );
};
