
import React, { useEffect, useState } from 'react';
import { Folder, File, ChevronRight, ChevronDown } from 'lucide-react';
import { ProjectSelectorModal } from './ProjectSelectorModal';
import { Target } from 'lucide-react';

interface FileEntry {
    name: string;
    is_dir: boolean;
    path: string; // Absolute path
}

interface DirContent {
    files: FileEntry[];
    dirs: FileEntry[];
    loaded: boolean;
}

interface FileTreeProps {
    onSelectFile: (path: string) => void;
    currentFile: string | null;
    onSetDebugTarget?: (path: string) => void;
    debugTarget?: string | null;
}

export const FileTree: React.FC<FileTreeProps> = ({ onSelectFile, currentFile, onSetDebugTarget, debugTarget }) => {
    // Map of Absolute Path -> Content
    const [cache, setCache] = useState<Record<string, DirContent>>({});
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [rootPath, setRootPath] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showSelector, setShowSelector] = useState(false);

    // Initial Load: Get Root Path then LS it.
    const loadRoot = () => {
        setIsLoading(true);
        // First get the current project root path
        fetch('http://localhost:8000/api/files/tree') // We can use tree just to get the root path quickly or introduce a simple 'get_root'
            // Actually, the existing /api/files/tree returns {root: "...", tree: ...}
            // We can still use it for the root path, or just assume we start empty.
            // Let's use it but ignore the tree part if it's huge? Or better, use /api/files/ls immediately if we knew the root.
            // We don't know the root initially. Let's call tree lightly or fix backend to give root?
            // Backend has POST /api/files/root but GET just returns tree.
            // Let's stick to /api/files/tree for now to get 'root', but ignore the heavy tree payload if we can.
            // OPTIMIZATION: In real app, make a lightweight GET /api/config or similar.
            // For now, we'll parse the 'root' from the tree response and then discard the tree data.
            .then(res => res.json())
            .then(data => {
                setRootPath(data.root);
                // Now fetch LS for this root
                fetchDir(data.root);
                setExpanded(new Set([data.root])); // Expand root by default
            })
            .catch(err => console.error("Failed to load root:", err))
            .finally(() => setIsLoading(false));
    };

    const fetchDir = (path: string) => {
        // If already loading or loaded? We can refresh.

        fetch('http://localhost:8000/api/files/ls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    console.error(data.error);
                    return;
                }

                const entries: any[] = data.entries;
                const files = entries.filter(e => !e.is_dir).map(e => ({ ...e, path: e.path }));
                const dirs = entries.filter(e => e.is_dir).map(e => ({ ...e, path: e.path }));

                setCache(prev => ({
                    ...prev,
                    [path]: { files, dirs, loaded: true }
                }));
            })
            .catch(err => console.error("LS failed:", err));
    };

    const handleChangeProject = (newPath: string) => {
        fetch('http://localhost:8000/api/files/root', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: newPath })
        })
            .then(res => {
                if (res.ok) {
                    // Reset everything
                    setCache({});
                    setExpanded(new Set());
                    loadRoot();
                    setShowSelector(false);
                } else {
                    alert("Failed to set project path");
                }
            });
    };

    useEffect(() => {
        loadRoot();
    }, []);

    const toggleFolder = (path: string) => {
        const next = new Set(expanded);
        if (next.has(path)) {
            next.delete(path);
        } else {
            next.add(path);
            // Lazy Load if needed
            if (!cache[path] || !cache[path].loaded) {
                fetchDir(path);
            }
        }
        setExpanded(next);
    };

    const handleContextMenu = (e: React.MouseEvent, path: string) => {
        e.preventDefault();
        if (onSetDebugTarget) {
            if (confirm(`Set '${path.split('/').pop()}' as the Debug Target executable?`)) {
                onSetDebugTarget(path);
            }
        }
    };

    // Recursive Node Renderer
    const renderDir = (dirPath: string) => {
        const content = cache[dirPath];
        if (!content) return <div className="pl-4 text-xs text-gray-600">Loading...</div>;

        return (
            <div className="pl-4">
                {/* Dirs */}
                {content.dirs.map(dir => {
                    const isDirExpanded = expanded.has(dir.path);
                    return (
                        <div key={dir.path}>
                            <div
                                onClick={() => toggleFolder(dir.path)}
                                className="flex items-center gap-2 cursor-pointer py-1 px-2 text-gray-400 hover:bg-gray-800 rounded text-sm font-semibold whitespace-nowrap"
                            >
                                {isDirExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Folder size={14} className="text-yellow-600 flex-shrink-0" />
                                <span className="truncate">{dir.name}</span>
                            </div>
                            {isDirExpanded && renderDir(dir.path)}
                        </div>
                    );
                })}

                {/* Files */}
                {content.files.map(file => {
                    const isActive = file.path === currentFile;
                    const isTarget = debugTarget && (file.path === debugTarget);

                    return (
                        <div
                            key={file.path}
                            onClick={() => onSelectFile(file.path)}
                            onContextMenu={(e) => handleContextMenu(e, file.path)}
                            className={`flex items-center gap-2 cursor-pointer py-1 px-2 rounded text-sm group whitespace-nowrap ${isActive ? 'bg-purple-900 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
                        >
                            <File size={14} className="flex-shrink-0" />
                            <span className="flex-1 truncate">{file.name}</span>

                            {isTarget ? (
                                <span title="Current Debug Target" className="flex items-center justify-center">
                                    <Target size={14} className="text-red-500 flex-shrink-0" />
                                </span>
                            ) : (
                                <button
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-red-400 transition-opacity"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleContextMenu(e, file.path);
                                    }}
                                    title="Set as Debug Target"
                                >
                                    <Target size={14} />
                                </button>
                            )}
                        </div>
                    );
                })}

                {content.files.length === 0 && content.dirs.length === 0 && (
                    <div className="pl-6 text-xs text-gray-600 italic">Empty</div>
                )}
            </div>
        );
    };

    return (
        <div className="bg-gray-900 h-full overflow-hidden flex flex-col border-r border-gray-700 select-none">
            <div className="p-3 border-b border-gray-800 flex justify-between items-center bg-gray-950 flex-shrink-0">
                <div
                    className="text-xs font-bold text-gray-500 uppercase tracking-wider truncate cursor-pointer hover:text-white"
                    onClick={() => setShowSelector(true)}
                    title={rootPath}
                >
                    {rootPath ? rootPath.split('/').pop() : 'NO PROJECT'}
                </div>
                <button onClick={loadRoot} className={`text-gray-500 hover:text-white ${isLoading ? 'animate-spin' : ''}`}>
                    <Folder size={14} />
                </button>
            </div>

            <div className="p-2 flex-1 overflow-auto">
                {rootPath ? renderDir(rootPath) : <div className="text-gray-500 text-sm text-center mt-4">No Project Loaded</div>}
            </div>

            {showSelector && (
                <ProjectSelectorModal
                    currentPath={rootPath}
                    onSelect={handleChangeProject}
                    onClose={() => setShowSelector(false)}
                />
            )}
        </div>
    );
};
