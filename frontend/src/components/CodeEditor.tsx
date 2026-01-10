
import React, { useEffect, useRef } from 'react';

import Editor, { type Monaco } from '@monaco-editor/react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useDebug } from '../contexts/DebugContext';

export interface CodeEditorProps {
    fileContent: string;
    filePath: string | null;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ fileContent, filePath }) => {
    // Remove unused sendMessage
    const { stack, isRunning, breakpoints, toggleBreakpoint } = useDebug();
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const decorationsRef = useRef<string[]>([]);
    const bpDecorationsRef = useRef<string[]>([]);

    // Fix stale closure in event listener by using a Ref
    const filePathRef = useRef(filePath);
    useEffect(() => {
        filePathRef.current = filePath;
    }, [filePath]);

    // Determine current line from stack matches current file
    // Only highlight if stack frame matches current file
    const stackFrame = stack.length > 0 ? stack[0] : null;
    // Basic fuzzy match for now, or assume filePath from prop is relative
    const isCurrentFile = stackFrame && filePath && filePath.endsWith(stackFrame.file);
    const currentLine = isCurrentFile && stackFrame.line ? parseInt(stackFrame.line) : 0;

    useEffect(() => {
        if (!editorRef.current || !monacoRef.current) return;
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const model = editor.getModel();
        if (!model) return;

        // 1. Execution Line Decoration
        const execDecorations = [];
        if (currentLine > 0 && !isRunning) {
            execDecorations.push({
                range: new monaco.Range(currentLine, 1, currentLine, 1),
                options: {
                    isWholeLine: true,
                    className: 'bg-yellow-900 bg-opacity-30',
                    glyphMarginClassName: 'bg-green-500 w-3 h-3 rounded-full ml-1',
                },
            });
            editor.revealLineInCenter(currentLine);
        }
        decorationsRef.current = model.deltaDecorations(decorationsRef.current, execDecorations);

        // 2. Breakpoint Decorations
        // Filter breakpoints for this file
        // breakpoints are Breakpoint objects { id, file, line }
        const fileBps = (breakpoints || [])
            .filter(bp => filePath && (bp.file === filePath || filePath.endsWith(bp.file) || bp.file.endsWith(filePath)))
            .map(bp => bp.line);

        const bpNewDecorations = fileBps.map(line => ({
            range: new monaco.Range(line, 1, line, 1),
            options: {
                glyphMarginClassName: 'bg-red-500 w-3 h-3 rounded-full ml-1 cursor-pointer',
                glyphMarginHoverMessage: { value: 'Breakpoint' }
            }
        }));

        bpDecorationsRef.current = model.deltaDecorations(bpDecorationsRef.current, bpNewDecorations);

    }, [currentLine, isRunning, filePath, breakpoints]);

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        editor.onMouseDown((e: any) => {
            // ALWAYS use the Ref to get the latest value, avoiding stale closure
            const currentPath = filePathRef.current;
            console.log("Mouse Down Event:", e.target.type, e.target.position);
            console.log("Current File (from Ref):", currentPath);

            if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
                e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
                const lineNumber = e.target.position.lineNumber;
                if (!currentPath) {
                    console.error("Cannot toggle breakpoint: filePath is null");
                    return;
                }

                console.log("Toggling breakpoint at:", currentPath, lineNumber);
                toggleBreakpoint(currentPath, lineNumber);
            }
        });
    };

    return (
        <div className="h-full w-full">
            <Editor
                height="100%"
                defaultLanguage="c"
                theme="vs-dark"
                value={fileContent}
                path={filePath || undefined} // Optimize Diffing
                onMount={handleEditorDidMount}
                options={{
                    readOnly: true,
                    glyphMargin: true,
                    lineNumbers: 'on',
                    minimap: { enabled: false },
                }}
            />
        </div>
    );
};
