import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, MemoryData, PersonaData, ScriptData, ScriptParams, StatusResponse, UrlLearningResult } from '../api';

interface AppState {
  activeView: 'persona' | 'learn-url' | 'workbench' | 'library';
  status: StatusResponse | null;
  persona: PersonaData | null;
  learnedUrls: UrlLearningResult[];
  scripts: ScriptData[];
  memories: MemoryData[];
  isLoading: boolean;
}

interface AppContextType extends AppState {
  setActiveView: (view: AppState['activeView']) => void;
  loadInitialState: () => Promise<void>;
  updatePersona: (data: Partial<PersonaData>) => Promise<void>;
  suggestCta: (data: Partial<PersonaData>) => Promise<string[]>;
  suggestBoundaries: (data: Partial<PersonaData>) => Promise<string[]>;
  learnUrl: (data: { url?: string; text?: string }) => Promise<void>;
  deleteLearning: (id: string) => Promise<void>;
  generateScript: (params: ScriptParams) => Promise<void>;
  rewriteScript: (id: string, action: string) => Promise<void>;
  addMemory: (content: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  updateScriptStatus: (id: string, status: ScriptData['status']) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>({
    activeView: 'workbench',
    status: null,
    persona: null,
    learnedUrls: [],
    scripts: [],
    memories: [],
    isLoading: true,
  });

  const loadInitialState = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const [status, fullState] = await Promise.all([
        api.getStatus(),
        api.getState(),
      ]);
      setState((prev) => ({
        ...prev,
        status,
        persona: fullState.persona,
        learnedUrls: fullState.learnedUrls,
        scripts: fullState.scripts,
        memories: fullState.memories,
        isLoading: false,
      }));
    } catch (error) {
      console.error(error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const updatePersona = async (data: Partial<PersonaData>) => {
    const newPersona = await api.updatePersona(data);
    setState((prev) => ({ ...prev, persona: newPersona }));
  };

  const learnUrl = async (data: { url?: string; text?: string }) => {
    const result = await api.learnUrl(data);
    setState((prev) => ({ ...prev, learnedUrls: [result, ...prev.learnedUrls] }));
  };

  const deleteLearning = async (id: string) => {
    const result = await api.deleteLearning(id);
    setState((prev) => ({
      ...prev,
      learnedUrls: prev.learnedUrls.filter((item) => item.id !== id),
      scripts: result.scripts || prev.scripts,
    }));
  };

  const generateScript = async (params: ScriptParams) => {
    const newScript = await api.generateScript(params);
    setState((prev) => ({ ...prev, scripts: [newScript, ...prev.scripts] }));
  };

  const rewriteScript = async (id: string, action: string) => {
    const newScript = await api.rewriteScript(id, action);
    setState((prev) => ({ ...prev, scripts: [newScript, ...prev.scripts] }));
  };

  const addMemory = async (content: string) => {
    const newMemory = await api.addMemory(content);
    setState((prev) => ({ ...prev, memories: [newMemory, ...prev.memories] }));
  };

  const deleteMemory = async (id: string) => {
    await api.deleteMemory(id);
    setState((prev) => ({ ...prev, memories: prev.memories.filter((memory) => memory.id !== id) }));
  };

  const updateScriptStatus = async (id: string, status: ScriptData['status']) => {
    const updated = await api.updateScriptStatus(id, status);
    if (updated) {
      setState((prev) => ({
        ...prev,
        scripts: prev.scripts.map((script) => script.id === id ? updated : script),
      }));
    }
  };

  useEffect(() => {
    loadInitialState();
  }, []);

  const value: AppContextType = {
    ...state,
    setActiveView: (view) => setState((prev) => ({ ...prev, activeView: view })),
    loadInitialState,
    updatePersona,
    suggestCta: api.suggestCta,
    suggestBoundaries: api.suggestBoundaries,
    learnUrl,
    deleteLearning,
    generateScript,
    rewriteScript,
    addMemory,
    deleteMemory,
    updateScriptStatus,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
