import React, { createContext, useContext, useState } from 'react';

type AnalysisResult = {
    explanation: string;
    suggested_fix: string;
    related_code?: string[];
} | null;

type AnalysisContextType = {
    analysisResult: AnalysisResult;
    setAnalysisResult: (result: AnalysisResult) => void;
};

const AnalysisContext = createContext<AnalysisContextType | null>(null);

export const AnalysisProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult>(null);

    return (
        <AnalysisContext.Provider value={{ analysisResult, setAnalysisResult }}>
            {children}
        </AnalysisContext.Provider>
    );
};

export const useAnalysis = () => {
    const context = useContext(AnalysisContext);
    if (!context) {
        throw new Error("useAnalysis must be used within an AnalysisProvider");
    }
    return context;
};
