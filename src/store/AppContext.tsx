import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import {
  api,
  authApi,
  AuthUser,
  MemoryData,
  PersonaData,
  roomApi,
  Room,
  RoomMessage,
  RoomState,
  ScriptData,
  ScriptDraft,
  ScriptParams,
  StatusResponse,
  UrlLearningResult,
} from '../api';

type ActiveView = 'persona' | 'learn-url' | 'room' | 'workbench' | 'library';

interface AppState {
  activeView: ActiveView;
  status: StatusResponse | null;
  persona: PersonaData | null;
  learnedUrls: UrlLearningResult[];
  scripts: ScriptData[];
  memories: MemoryData[];
  isLoading: boolean;
  authUser: AuthUser | null;
  authToken: string | null;
  authError: string | null;
  room: Room | null;
  roomState: RoomState | null;
  roomMessages: RoomMessage[];
  roomDrafts: ScriptDraft[];
  roomDocuments: any[];
}

interface AppContextType extends AppState {
  setActiveView: (view: ActiveView) => void;
  loadInitialState: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  ensureRoom: () => Promise<void>;
  sendRoomMessage: (content: string) => Promise<void>;
  learnRoomText: (text: string) => Promise<void>;
  generateRoomScript: (params?: ScriptParams) => Promise<void>;
  deleteRoomMemory: (id: string) => Promise<void>;
  deleteRoomDocument: (id: string) => Promise<void>;
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

function mergeRoomResponse(prev: AppState, response: any): AppState {
  const state = response.state || prev.roomState;
  return {
    ...prev,
    room: response.room || prev.room,
    roomState: state || null,
    roomMessages: response.messages || prev.roomMessages,
    roomDrafts: response.drafts || prev.roomDrafts,
    roomDocuments: response.documents || prev.roomDocuments,
    memories: response.memories
      ? response.memories.map((memory: any) => ({ id: memory.id, content: memory.content, createdAt: memory.created_at, deletedAt: memory.deleted_at }))
      : prev.memories,
  };
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>({
    activeView: 'room',
    status: null,
    persona: null,
    learnedUrls: [],
    scripts: [],
    memories: [],
    isLoading: true,
    authUser: null,
    authToken: null,
    authError: null,
    room: null,
    roomState: null,
    roomMessages: [],
    roomDrafts: [],
    roomDocuments: [],
  });

  const applyRoomResponse = (response: any) => {
    setState((prev) => mergeRoomResponse(prev, response));
  };

  const loadInitialState = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const [status, fullState, session] = await Promise.all([
        api.getStatus(),
        api.getState(),
        authApi.getSession(),
      ]);
      setState((prev) => ({
        ...prev,
        status,
        persona: fullState.persona,
        learnedUrls: fullState.learnedUrls,
        scripts: fullState.scripts,
        memories: fullState.memories,
        authUser: session?.user || null,
        authToken: session?.access_token || null,
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        authError: error instanceof Error ? error.message : String(error),
        isLoading: false,
      }));
    }
  };

  const signIn = async (email: string, password: string) => {
    const session = await authApi.signIn(email, password);
    setState((prev) => ({ ...prev, authUser: session?.user || null, authToken: session?.access_token || null, authError: null }));
  };

  const signUp = async (email: string, password: string) => {
    const session = await authApi.signUp(email, password);
    setState((prev) => ({ ...prev, authUser: session?.user || null, authToken: session?.access_token || null, authError: null }));
  };

  const signOut = async () => {
    await authApi.signOut();
    setState((prev) => ({ ...prev, authUser: null, authToken: null, room: null, roomState: null, roomMessages: [], roomDrafts: [] }));
  };

  const ensureRoom = async () => {
    const token = state.authToken;
    if (!token) throw new Error('請先登入 Supabase Auth。');
    if (state.room) {
      const response = await roomApi.getState(state.room.id, token);
      applyRoomResponse(response);
      return;
    }
    const response = await roomApi.createRoom(token);
    applyRoomResponse(response);
  };

  const sendRoomMessage = async (content: string) => {
    const token = state.authToken;
    const roomId = state.room?.id;
    if (!token || !roomId) throw new Error('請先建立 HERMES 小房間。');
    const response = await roomApi.sendMessage(roomId, token, content);
    applyRoomResponse(response);
  };

  const learnRoomText = async (text: string) => {
    const token = state.authToken;
    const roomId = state.room?.id;
    if (!token || !roomId) throw new Error('請先建立 HERMES 小房間。');
    const response = await roomApi.learnText(roomId, token, text);
    const updated = await roomApi.getState(roomId, token);
    applyRoomResponse({ ...response, ...updated });
  };

  const generateRoomScript = async (params?: ScriptParams) => {
    const token = state.authToken;
    const roomId = state.room?.id;
    if (!token || !roomId) throw new Error('請先建立 HERMES 小房間。');
    const response = await roomApi.generateScript(roomId, token, state.persona!, params);
    applyRoomResponse(response);
  };

  const deleteRoomMemory = async (id: string) => {
    const token = state.authToken;
    const roomId = state.room?.id;
    if (!token || !roomId) throw new Error('請先建立 HERMES 小房間。');
    await roomApi.deleteMemory(roomId, token, id);
    const response = await roomApi.getState(roomId, token);
    applyRoomResponse(response);
  };

  const deleteRoomDocument = async (id: string) => {
    const token = state.authToken;
    const roomId = state.room?.id;
    if (!token || !roomId) throw new Error('請先建立 HERMES 小房間。');
    await roomApi.deleteDocument(roomId, token, id);
    const response = await roomApi.getState(roomId, token);
    applyRoomResponse(response);
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
        scripts: prev.scripts.map((script) => (script.id === id ? updated : script)),
      }));
    }
  };

  useEffect(() => {
    loadInitialState();
    const sub = authApi.onAuthStateChange((session) => {
      setState((prev) => ({
        ...prev,
        authUser: session?.user || null,
        authToken: session?.access_token || null,
      }));
    });
    return () => sub.unsubscribe();
  }, []);

  const value: AppContextType = {
    ...state,
    setActiveView: (view) => setState((prev) => ({ ...prev, activeView: view })),
    loadInitialState,
    signIn,
    signUp,
    signOut,
    ensureRoom,
    sendRoomMessage,
    learnRoomText,
    generateRoomScript,
    deleteRoomMemory,
    deleteRoomDocument,
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
