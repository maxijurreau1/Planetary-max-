import React, { useEffect, useState } from 'react';
import { AuthModal, type AuthUser } from './AuthModal';

interface NavbarUserProps {
  currentUser: AuthUser | null;
  onUserChange: (user: AuthUser | null) => void;
}

export function NavbarUser({ currentUser, onUserChange }: NavbarUserProps) {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && isAuthOpen && !loggingOut) setIsAuthOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAuthOpen, loggingOut]);

  const handleLogout = async () => {
    setLoggingOut(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      if (!response.ok) throw new Error('Sign out failed. Please try again.');
      onUserChange(null);
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : 'Sign out failed.');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <>
      <div className="navbar-user">
        {currentUser ? (
          <div className="navbar-user-signed-in">
            <span className="navbar-user-name" title={currentUser.username}>{currentUser.username}</span>
            <button type="button" onClick={handleLogout} disabled={loggingOut} className="navbar-user-action">{loggingOut ? 'Signing out…' : 'Sign out'}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setIsAuthOpen(true)} className="navbar-user-access">Sovereign Access</button>
        )}
        {error && <span className="navbar-user-error" role="alert">{error}</span>}
      </div>
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onSuccess={user => { onUserChange(user); setIsAuthOpen(false); }} />
      <style>{`.navbar-user{position:relative;display:flex;align-items:center}.navbar-user-signed-in{display:flex;align-items:center;gap:14px;font:9px 'DM Mono',monospace;letter-spacing:.08em;text-transform:uppercase}.navbar-user-name{max-width:130px;overflow:hidden;text-overflow:ellipsis;color:#aaa69e}.navbar-user-action,.navbar-user-access{border:1px solid rgba(238,234,226,.18);background:transparent;color:#eeeae2;padding:9px 12px;font:9px 'DM Mono',monospace;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}.navbar-user-action:hover,.navbar-user-access:hover{background:rgba(238,234,226,.08)}.navbar-user-action:disabled{opacity:.55;cursor:wait}.navbar-user-error{position:absolute;top:100%;right:0;width:max-content;max-width:240px;color:#e18c7f;font-size:11px}`}</style>
    </>
  );
}
