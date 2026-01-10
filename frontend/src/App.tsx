
import { WebSocketProvider, useWebSocket } from './contexts/WebSocketContext';
import { DebugProvider, useDebug } from './contexts/DebugContext';
import { DebugControls } from './components/DebugControls';
import DebugInfoPanel from './components/VariablesPanel';
import { useEffect, useRef, useState } from 'react';
import { CodeEditor } from './components/CodeEditor';
import { AnalysisPanel } from './components/AnalysisPanel';
import { FileTree } from './components/FileTree';
import { AnalysisProvider, useAnalysis } from './contexts/AnalysisContext';

const ConsoleOutput = () => {
  const { messages } = useWebSocket();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 bg-black p-4 font-mono text-xs overflow-auto">
      {messages.map((msg, i) => {
        if (!msg) return null;

        // 1. Standard Output (Stdout)
        if (msg.type === 'console') {
          return (
            <div key={i} className="mb-0.5 pb-0.5 border-b border-gray-900/50">
              <span className="text-gray-500 mr-2 opacity-50 select-none">[{new Date().toLocaleTimeString()}]</span>
              <span className="text-gray-300 whitespace-pre-wrap">{msg.payload}</span>
            </div>
          );
        }

        // 2. Backend Log Events (Clean Status/Errors)
        if (msg.type === 'log_event') {
          const { level, text, timestamp } = msg.payload;

          let timeDisplay = timestamp;
          try {
            // Treat as ISO UTC, convert to local
            timeDisplay = new Date(timestamp).toLocaleTimeString();
            if (timeDisplay === "Invalid Date") timeDisplay = timestamp;
          } catch (e) { }

          const colorClass =
            level === 'error' ? 'text-red-500 font-bold' :
              level === 'gdb' ? 'text-blue-400 opacity-70' :
                'text-green-400 font-bold'; // info

          return (
            <div key={i} className="mb-0.5 pb-0.5 border-b border-gray-900/50">
              <span className="text-gray-500 mr-2 opacity-50 select-none">[{timeDisplay}]</span>
              <span className={colorClass}>{text}</span>
            </div>
          );
        }

        // Ignore everything else (state_update, etc)
        return null;
      })}
      <div ref={bottomRef} />
    </div>
  );
};




import { Panel, Group, Separator } from 'react-resizable-panels';

const ResizeHandle = ({ className = "", id }: { className?: string; id?: string }) => {
  return (
    <Separator
      className={`relative flex items-center justify-center w-1.5 bg-transparent hover:bg-transparent transition-colors group outline-none ${className}`}
      id={id}
    >
      {/* Visual Border Line */}
      <div className="h-full w-px bg-gray-800 group-hover:bg-purple-500 transition-colors" />
    </Separator>
  );
};

const VerticalResizeHandle = ({ className = "" }) => {
  return (
    <Separator
      className={`relative flex items-center justify-center h-1.5 bg-transparent hover:bg-transparent transition-colors group outline-none ${className}`}
    >
      {/* Visual Border Line */}
      <div className="w-full h-px bg-gray-800 group-hover:bg-purple-500 transition-colors" />
    </Separator>
  );
}


function AppContent() {
  const { analysisResult, setAnalysisResult } = useAnalysis();
  const { stack } = useDebug();
  const { sendMessage, clearMessages } = useWebSocket();

  // File System State
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('// Select a file to view code');

  // Debug Target State
  const [debugTarget, setDebugTarget] = useState<string | null>(null);

  const handleSelectFile = async (path: string) => {
    // Clear previous output to reduce clutter
    clearMessages();

    // Detect likely binary files by name (simple heuristic for demo)
    const filename = path.split('/').pop() || "";
    if (!filename.includes('.') && filename !== "Makefile") {
      setFileContent("// Binary file selected.\n// To debug this executable:\n// 1. Click the Target icon to the right.\n// 2. Click 'Init' at the top.");
      setActiveFile(path);
      return;
    }

    // Auto-Set Target Heuristic
    // If opening a source file (e.g. logic_test.c), and no target is set (or different),
    // see if a binary sibling (logic_test) exists.
    // For this demo, we can just "guess" the binary name.
    // Auto-Set Target Heuristic
    // Only apply if we have an absolute path to avoid "Binary not found" loops with relative GDB paths
    if ((path.startsWith('/') || path.match(/^[a-zA-Z]:\\/)) && (path.endsWith('.c') || path.endsWith('.cpp'))) {
      const binaryPath = path.replace(/\.(c|cpp|cc)$/, '');

      // Update if no target set OR if it's different.
      if (debugTarget !== binaryPath) {
        console.log("Auto-setting debug target to:", binaryPath);
        setDebugTarget(binaryPath);

        // AUTO-INIT: Start GDB immediately so breakpoints work
        console.log("Auto-initializing GDB session for:", binaryPath);
        sendMessage('init', { executable: binaryPath });
      }
    }

    try {
      const res = await fetch(`http://localhost:8000/api/files/content?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error("Failed to load file");
      const data = await res.json();
      setFileContent(data.content);
      setActiveFile(path);
    } catch (e) {
      console.error(e);
      setFileContent("// Error loading file");
    }
  };

  // Auto-Open file from GDB Stack
  useEffect(() => {
    console.log("App: stack update:", stack);
    if (stack.length > 0) {
      const frame = stack[0];
      console.log("App: Top frame:", frame);

      // Check if frame.file exists and is different from current
      // Handle potential relative paths from GDB (e.g. "logic_test.c" matching "/abs/path/to/logic_test.c")
      if (frame.file) {
        const isSameFile = activeFile === frame.file || (activeFile && activeFile.endsWith(`/${frame.file}`));

        if (!isSameFile) {
          console.log("Auto-opening file from execution:", frame.file);
          handleSelectFile(frame.file);
        } else {
          console.log("App: File already active (suffix match):", frame.file);
        }
      }
    }
  }, [stack, activeFile]);

  return (
    <div className="h-screen w-screen bg-gray-950 text-white overflow-hidden">
      <Group className="h-full w-full" orientation="horizontal">

        {/* 1. LEFT PANE: File Explorer */}
        <Panel defaultSize={15} minSize={10} className="flex flex-col h-full bg-gray-950">
          <FileTree
            onSelectFile={handleSelectFile}
            currentFile={activeFile}
            onSetDebugTarget={setDebugTarget}
            debugTarget={debugTarget}
          />
        </Panel>

        <ResizeHandle />

        {/* 2. MIDDLE PANE: Workbench */}
        <Panel defaultSize={52} minSize={20} className="flex flex-col min-w-0 h-full bg-gray-950">
          <DebugControls debugTarget={debugTarget} currentFile={activeFile} />
          <div className="flex-1 relative">
            <CodeEditor fileContent={fileContent} filePath={activeFile} />
          </div>
        </Panel>

        <ResizeHandle />

        {/* 3. RIGHT PANE: Debug Info & AI */}
        <Panel defaultSize={33} minSize={15} className="flex flex-col relative bg-gray-900 h-full">
          {/* AI Overlay (Takes over if active) */}
          {analysisResult && (
            <AnalysisPanel
              result={analysisResult}
              onClose={() => setAnalysisResult(null)}
            />
          )}

          <Group className="h-full w-full" orientation="vertical">
            {/* Variables (Top Half) */}
            <Panel defaultSize={50} minSize={20} className="flex flex-col overflow-hidden h-full">
              <DebugInfoPanel />
            </Panel>

            <VerticalResizeHandle />

            {/* Console (Bottom Half) */}
            <Panel defaultSize={50} minSize={20} className="flex flex-col overflow-hidden h-full">
              <div className="bg-gray-800 px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 border-b border-gray-700">
                Console Output
              </div>
              <ConsoleOutput />
            </Panel>
          </Group>
        </Panel>

      </Group>
    </div>
  );
}

function App() {
  return (
    <WebSocketProvider>
      <DebugProvider>
        <AnalysisProvider>
          <AppContent />
        </AnalysisProvider>
      </DebugProvider>
    </WebSocketProvider>
  );
}

export default App;
