import React, { useMemo, useState } from 'react';
import { Database, FileText, Loader2, LogIn, LogOut, Play, PlusCircle, Send } from 'lucide-react';
import { ScriptParams } from '../api';
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
  const [email, setEmail] = useState('111');
  const [password, setPassword] = useState('111');
  const [message, setMessage] = useState('');
  const [learningText, setLearningText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latestDraft = roomDrafts[0];
  const transcript = useMemo(() => {
    if (!roomMessages.length) {
      return [{
        id: 'welcome',
        role: 'assistant',
        content: '我是 HERMES 小房間。先貼素材，我會把它存成 room documents；再送訊息或按產出腳本，我會讀取這些素材來生成。',
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

  const handleLogin = (mode: 'in' | 'up') => run(mode, async () => {
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
          <p className="view-subtitle">本機測試版已改成實質 room：會保存素材、對話、voice_dna、腳本草稿到 local store，生成時會讀取已學習資料。</p>
        </div>
        <div className="flow-pills">
          <span className={authUser ? 'active' : ''}>登入</span>
          <span className={room ? 'active' : ''}>Room</span>
          <span className={roomDocuments.length ? 'active' : ''}>Documents</span>
          <span className={roomState?.activeScriptDraftId ? 'active' : ''}>Draft</span>
        </div>
      </header>

      <div className="room-layout">
        <section className="room-main">
          {!authUser && (
            <div className="card auth-card">
              <h2 className="card-header"><LogIn size={18} /> 本機測試登入</h2>
              <p className="field-hint">現在先用本機測試模式，帳號密碼都是 111。正式版再換 Supabase Auth。</p>
              <div className="form-grid two">
                <input className="input-field" placeholder="帳號" value={email} onChange={(event) => setEmail(event.target.value)} />
                <input className="input-field" placeholder="密碼" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              <div className="button-row">
                <button className="btn btn-primary" type="button" onClick={() => handleLogin('in')} disabled={Boolean(busy)}>登入</button>
                <button className="btn btn-secondary" type="button" onClick={() => handleLogin('up')} disabled={Boolean(busy)}>建立測試帳號</button>
              </div>
            </div>
          )}

          {authUser && (
            <div className="card room-toolbar">
              <div>
                <strong>{room ? room.title : '尚未建立 Room'}</strong>
                <p>{authUser.email} · local room runtime</p>
              </div>
              <div className="button-row">
                <button className="btn btn-secondary" type="button" onClick={handleEnsureRoom} disabled={Boolean(busy)}>
                  <PlusCircle size={16} /> {room ? '重新讀取 Room' : '建立 Room'}
                </button>
                <button className="btn btn-ghost" type="button" onClick={signOut}><LogOut size={16} /> 登出</button>
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
                  <p><Loader2 size={14} className="animate-spin inline-icon" /> 正在讀取小房間狀態...</p>
                </div>
              )}
            </div>

            <div className="chat-input-row">
              <textarea
                className="input-field"
                rows={3}
                placeholder="例如：用我剛剛貼的素材，幫我抓出觀眾痛點，然後產一版雙人對話腳本"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <button className="btn btn-primary" type="button" onClick={handleSend} disabled={!room || Boolean(busy)}>
                <Send size={16} /> 送出
              </button>
            </div>
          </div>
        </section>

        <aside className="room-side">
          <section className="card">
            <h2 className="card-header"><FileText size={18} /> 學習資料</h2>
            <textarea
              className="input-field"
              rows={8}
              placeholder="貼品牌介紹、服務說明、TG 口語範例、客戶對話、過去腳本。匯入後會寫入 local room documents。"
              value={learningText}
              onChange={(event) => setLearningText(event.target.value)}
            />
            <button className="btn btn-secondary full-width" type="button" onClick={handleLearn} disabled={!room || Boolean(busy)}>匯入學習</button>
            <p className="field-hint">目前 documents：{roomDocuments.length} 筆</p>
          </section>

          <section className="card">
            <h2 className="card-header"><Database size={18} /> 已學習素材</h2>
            {roomDocuments.length ? roomDocuments.slice(0, 4).map((doc: any) => (
              <div className="script-block-mini" key={doc.id}>
                <strong>{doc.title}</strong>
                <p>{doc.summary}</p>
              </div>
            )) : <p className="field-hint">還沒有資料。先貼一段文字匯入。</p>}
          </section>

          <section className="card">
            <h2 className="card-header"><Play size={18} /> 完整腳本 Pipeline</h2>
            <p className="compact-text">會讀取 documents.chunks、messages、room_state，再跑模擬現場、真人句、故事骨架、腳本草稿、人話檢查。</p>
            <button className="btn btn-primary full-width" type="button" onClick={handleGenerate} disabled={!room || Boolean(busy)}>產出完整腳本</button>
          </section>

          {latestDraft && (
            <section className="card draft-preview">
              <h2 className="card-header">最近草稿</h2>
              {(latestDraft.blocks || []).map((block) => (
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
