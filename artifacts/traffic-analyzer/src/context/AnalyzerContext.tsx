/**
 * Shared context for the analyzer hook so state persists across route changes.
 * Wrap the router with <AnalyzerProvider> and consume via useAnalyzerContext().
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useAnalyzer, type UseAnalyzerReturn } from '@/hooks/useAnalyzer';

const AnalyzerContext = createContext<UseAnalyzerReturn | null>(null);

export function AnalyzerProvider({ children }: { children: ReactNode }) {
  const analyzer = useAnalyzer();
  return (
    <AnalyzerContext.Provider value={analyzer}>
      {children}
    </AnalyzerContext.Provider>
  );
}

export function useAnalyzerContext(): UseAnalyzerReturn {
  const ctx = useContext(AnalyzerContext);
  if (!ctx) throw new Error('useAnalyzerContext must be used inside <AnalyzerProvider>');
  return ctx;
}
