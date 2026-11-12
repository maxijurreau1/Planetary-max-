import React, { useState } from 'react';

export interface AuthUser {
  id: string;
  username: string;
}

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

interface AuthResponse {
  user?: AuthUser;
  error?: string;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json() as AuthResponse;
      if (!response.ok || !data.user) throw new Error(data.error || 'Unable to authenticate.');
      setPassword('');
      onSuccess(data.user);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to authenticate.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <button className="auth-modal-close" type="button" onClick={onClose} disabled={busy} aria-label="Close sign in">×</button>
        <span className="eyebrow">Planetary-Max · secure access</span>
        <h2 id="auth-modal-title">{mode === 'login' ? 'Welcome back.' : 'Join the collection.'}</h2>
        <div className="auth-tabs" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <label>Username<input autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label>Password<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" required minLength={mode === 'register' ? 12 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
          {mode === 'register' && <small>Use at least 12 characters. Passwords are stored as salted PBKDF2 hashes.</small>}
          {error && <p className="auth-message auth-error" role="alert">{error}</p>}
          <button className="acquire-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
      </section>
      <style>{`.auth-modal-backdrop{position:fixed;inset:0;z-index:70;display:grid;place-items:center;padding:20px;background:rgba(7,7,6,.86);backdrop-filter:blur(12px)}.auth-modal{position:relative;width:min(100%,440px);padding:clamp(24px,5vw,42px);border:1px solid rgba(238,234,226,.18);background:#11110f;color:#eeeae2}.auth-modal h2{margin:12px 0 24px;font:400 2rem 'Playfair Display',serif}.auth-modal-close{position:absolute;top:14px;right:16px;border:0;background:none;color:inherit;font-size:1.6rem;cursor:pointer}.auth-tabs{display:flex;gap:18px;margin-bottom:18px;border-bottom:1px solid rgba(238,234,226,.15)}.auth-tabs button{padding:10px 0;border:0;background:none;color:inherit;opacity:.65;cursor:pointer}.auth-tabs button[aria-selected="true"]{opacity:1;border-bottom:1px solid #c5a77b}.auth-form{display:grid;gap:14px}.auth-form label{display:grid;gap:7px;font-size:.85rem}.auth-form input{width:100%;padding:11px;border:1px solid rgba(238,234,226,.22);background:#191917;color:inherit;font:inherit}.auth-form small{line-height:1.5;opacity:.7}.auth-message{margin:0;line-height:1.5}.auth-error{color:#e18c7f}`}</style>
    </div>
  );
}
