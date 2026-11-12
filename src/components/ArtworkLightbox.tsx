import React, { useEffect, useState } from 'react';
import type { Artwork } from '../hooks/useArtworks';
import { formatPrice } from './GalleryWall';

interface ArtworkLightboxProps {
  artwork: Artwork;
  onClose: () => void;
}

interface SessionResponse {
  authenticated?: boolean;
  user?: { id: string; username: string } | null;
}

export function ArtworkLightbox({ artwork, onClose }: ArtworkLightboxProps) {
  const [user, setUser] = useState<SessionResponse['user']>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, busy]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { credentials: 'include' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to check sign-in status.');
        return response.json() as Promise<SessionResponse>;
      })
      .then(data => { if (active && data.authenticated) setUser(data.user ?? null); })
      .catch(() => { if (active) setMessage('Sign-in status could not be checked. Please try again.'); })
      .finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, []);

  const submitAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setIsError(false);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json() as SessionResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.');
      setUser(data.user ?? null);
      setPassword('');
      setMessage(mode === 'register' ? 'Account created. You are signed in.' : 'You are signed in.');
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  const reserveArtwork = async () => {
    setBusy(true);
    setMessage('');
    setIsError(false);
    try {
      const response = await fetch('/api/marketplace/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artwork_id: artwork.id }),
      });
      const data = await response.json() as { error?: string; order_id?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to reserve artwork.');
      setMessage(`Reservation ${data.order_id} created. Payment is pending; no charge was made.`);
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : 'Unable to reserve artwork.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setUser(null);
      setMessage('You have signed out.');
      setIsError(false);
    } catch {
      setMessage('Unable to sign out right now.');
      setIsError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="lightbox" role="dialog" aria-modal="true" aria-labelledby="lightbox-title">
        <button className="lightbox-close" type="button" onClick={onClose} aria-label="Close artwork details">Close <span aria-hidden="true">×</span></button>
        <div className="lightbox-image"><img src={artwork.image_url} alt={artwork.title} /></div>
        <div className="lightbox-details">
          <span className="eyebrow">Collection artwork · {artwork.status}</span>
          <h2 id="lightbox-title">{artwork.title}</h2>
          <p className="lightbox-byline">by {artwork.artist_name}</p>
          <p className="lightbox-price">{formatPrice(artwork.price_cents)}</p>
          <dl className="artwork-facts">
            <div><dt>Medium</dt><dd>{artwork.medium}</dd></div>
            <div><dt>Dimensions</dt><dd>{artwork.dimensions || 'Not specified'}</dd></div>
            <div><dt>Availability</dt><dd className={`fact-status status-text-${artwork.status}`}>{artwork.status}</dd></div>
          </dl>

          {sessionLoading ? <p role="status">Checking secure session…</p> : user ? (
            <div className="checkout-panel">
              <p>Signed in as <strong>{user.username}</strong> <button className="auth-text-button" type="button" onClick={signOut} disabled={busy}>Sign out</button></p>
              {artwork.status === 'available' ? (
                <button className="acquire-button" type="button" onClick={reserveArtwork} disabled={busy}>
                  {busy ? 'Reserving…' : 'Reserve artwork'}
                </button>
              ) : <p className="checkout-notice" role="status">This artwork is no longer available to reserve.</p>}
              <small>Reservation only — payment is not connected and no charge will be made.</small>
            </div>
          ) : (
            <div className="checkout-panel">
              <div className="auth-tabs" role="tablist" aria-label="Account access">
                <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setMessage(''); }}>Sign in</button>
                <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setMessage(''); }}>Create account</button>
              </div>
              <form className="auth-form" onSubmit={submitAuth}>
                <label>Username<input autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]+" value={username} onChange={event => setUsername(event.target.value)} /></label>
                <label>Password<input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type="password" required minLength={mode === 'register' ? 12 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
                {mode === 'register' && <small>Use at least 12 characters. Passwords are stored as salted PBKDF2 hashes.</small>}
                <button className="acquire-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to continue' : 'Create account'}</button>
              </form>
            </div>
          )}
          {message && <p className={isError ? 'auth-message auth-error' : 'auth-message'} role={isError ? 'alert' : 'status'}>{message}</p>}
        </div>
      </section>
      <style>{`.checkout-panel{margin-top:1.5rem;padding:1rem;border:1px solid rgba(32,29,25,.16)}.checkout-panel>p{margin:0 0 .85rem}.checkout-panel small{display:block;margin-top:.7rem;line-height:1.5;opacity:.72}.auth-tabs{display:flex;gap:.5rem;margin-bottom:1rem}.auth-tabs button,.auth-text-button{border:0;background:transparent;text-decoration:underline;cursor:pointer;font:inherit}.auth-tabs button[aria-selected="true"]{font-weight:700}.auth-form{display:grid;gap:.8rem}.auth-form label{display:grid;gap:.35rem;font-size:.85rem}.auth-form input{width:100%;padding:.7rem;border:1px solid rgba(32,29,25,.3);font:inherit}.auth-form .acquire-button{margin-top:.25rem}.auth-message{margin-top:.8rem;line-height:1.5}.auth-error{color:#a52c21}.checkout-panel button:disabled{opacity:.6;cursor:wait}`}</style>
    </div>
  );
}
