import React, { useMemo, useState } from 'react';
import { Loader2, LogIn, LogOut, MessageSquare, Play, PlusCircle, Send, ShieldCheck } from 'lucide-react';
import { authApi, ScriptParams } from '../api';
import { useAppContext } from '../store/AppContext';

const defaultParams: ScriptParams = {
  platform: '多平台',
  purpose: '建立信任',
  scriptStyle: '雙人對話',
  durationSeconds: 45,
  tones: ['自然口語', '台灣在地感'],
  roles: ['品牌主', '藏鏡人'],
};

export const HermesRoomView: React.FC = () => {
  const {
    authUser,
    authError,
    room,
    roomMessages,
    roomState,
    roomDrafts,
    roomDocuments,
    signIn,
    signUp,
    signOut,
    ensureRoom,
    sendRoomMessage,
    learnRoomText,
    generateRoomScript,
  } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [learningText, setLearningText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latestDraft = roomDrafts[0];
  const canUseAuth = authApi.supabaseConfigured();

  const transcript = useMemo(() => {
    if (!roomMessages.length) {
      return [{
        id: 'welcome',
        role: 'assistant',
        content: '我是 HERMES 小房間。先貼素材、補人設或直接說你要的腳本情境，我會先抓 voice_dna，再模擬現場。',
        output_type: 'chat',
      }];
    }
    return roomMessages;
  }, [roomMessages]);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleLogin = (mode: 'in' | 'up') => run(mode === 'in' ? 'login' : 'signup', async () => {
    if (mode === 'in') await signIn(email, password);
    else await signUp(email, password);
  });

  const handleEnsureRoom = () => run('room', ensureRoom);

  const handleSend = () => run('message', async () => {
    const content = message.trim();
    if (!content) return;
    setMessage('');
    await sendRoomMessage(content);
  });

  const handleLearn = () => run('learn', async () => {
    const text = learningText.trim();
    if (!text) return;
    setLearningText('');
    await learnRoomText(text);
  });

  const handleGenerate = () => run('script', async () => {
    await generateRoomScript(defaultParams);
  });

  return (
    <div className="view-shell room-view">
      <header className="view-header flow-header">
        <div>
          <h1 className="view-title">HERMES 小房間</h1>
          <p className="view-subtitle">訊息喚醒式常駐狀態：素材、口氣、模擬、真人句、故事骨架與腳本草稿都會寫入 room_state。</p>
        </div>
        <div className="flow-pills">
          <span className={authUser ? 'active' : ''}>登入</span>
          <span className={room ? 'active' : ''}>Room</span>
          <span className={roomState?.activeScriptDraftId ? 'active' : ''}>草稿</span>
        </div>
      </header>

      <div className="room-layout">
        <section className="room-main">
          {!canUseAuth && (
            <div className="card warning-card">
              <h2 className="card-header"><ShieldCheck size={18} /> Supabase 尚未設定</h2>
              <p>小房間第一版使用 Supabase Auth，不做假登入。請設定 <code>VITE_SUPABASE_URL</code>、<code>VITE_SUPABASE_ANON_KEY</code>，後端再設定 <code>SUPABASE_URL</code> 與 <code>SUPABASE_SERVICE_ROLE_KEY</code>。</p>
            </div>
          )}

          {!authUser && canUseAuth && (
            <div className="card auth-card">
              <h2 className="card-header"><LogIn size={18} /> 登入 HERMES 小房間</h2>
              <div className="form-grid two">
                <input className="input-field" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
                <input className="input-field" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="button-row">
                <button className="btn btn-primary" type="button" onClick={() => handleLogin('in')} disabled={Boolean(busy)}>登入</button>
                <button className="btn btn-secondary" type="button" onClick={() => handleLogin('up')} disabled={Boolean(busy)}>建立帳號</button>
              </div>
            </div>
          )}

          {authUser && (
            <div className="card room-toolbar">
              <div>
                <strong>{room ? room.title : '尚未建立 room'}</strong>
                <p>{authUser.email}</p>
              </div>
              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={handleEnsureRoom} disabled={Boolean(busy)}>
                  <PlusCircle size={16} /> {room ? '重新讀取 Room' : '建立 Room'}
                </button>
                <button className="btn btn-ghost" type="button" onClick={signOut}>
                  <LogOut size={16} /> 登出
                </button>
              </div>
            </div>
          )}

          <div className="room-chat card">
            <div className="chat-scroll">
              {transcript.map((item: any) => (
                <div className={`chat-bubble ${item.role}`} key={item.id}>
                  <div className="bubble-meta">{item.role === 'assistant' ? 'HERMES' : '你'} · {item.output_type}</div>
                  <p>{item.content}</p>
                </div>
              ))}
              {busy && (
                <div className="chat-bubble assistant">
                  <div className="bubble-meta">HERMES</div>
                  <p><Loader2 size={14} className="animate-spin inline-icon" /> 處理中...</p>
                </div>
              )}
            </div>

            <div className="chat-input-row">
              <textarea className="input-field" rows={3} placeholder="貼素材、補充口吻，或直接說：幫我產一版雙人互動腳本" value={message} onChange={(event) => setMessage(event.target.value)} />
              <button className="btn btn-primary" type="button" onClick={handleSend} disabled={!room || Boolean(busy)}>
                <Send size={16} /> 送出
              </button>
            </div>
          </div>
        </section>

        <aside className="room-side">
          <section className="card">
            <h2 className="card-header"><MessageSquare size={18} /> 文字學習</h2>
            <textarea className="input-field" rows={8} placeholder="把品牌介紹、服務說明、TG 口語範例、客戶對話貼在這裡" value={learningText} onChange={(event) => setLearningText(event.target.value)} />
            <button className="btn btn-secondary full-width" type="button" onClick={handleLearn} disabled={!room || Boolean(busy)}>匯入小房間學習</button>
            <p className="field-hint">目前小房間資料：{roomDocuments.length} 筆。刪除後不再參與後續生成。</p>
          </section>

          <section className="card">
            <h2 className="card-header"><Play size={18} /> 完整腳本 Pipeline</h2>
            <p className="compact-text">產出時會依序跑：模擬現場、真人句、故事骨架、腳本草稿、人話檢查。</p>
            <button className="btn btn-primary full-width" type="button" onClick={handleGenerate} disabled={!room || Boolean(busy)}>產出完整腳本</button>
          </section>

          {latestDraft && (
            <section className="card draft-preview">
              <h2 className="card-header">最近草稿</h2>
              {(latestDraft.blocks || []).slice(0, 4).map((block) => (
                <div className="script-block-mini" key={`${block.time}-${block.audio}`}>
                  <strong>{block.time} · {block.speaker}</strong>
                  <p>{block.audio}</p>
                </div>
              ))}
            </section>
          )}

          {(error || authError) && <div className="error-card">{error || authError}</div>}
        </aside>
      </div>
    </div>
  );
};
