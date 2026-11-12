import React, { useEffect, useState } from 'react';
import type { Artwork } from '../hooks/useArtworks';
import { formatPrice } from './GalleryWall';
import { AuthModal, type AuthUser } from './AuthModal';

interface ArtworkLightboxProps {
  artwork: Artwork | null;
  currentUser: AuthUser | null;
  onUserChange: (user: AuthUser | null) => void;
  onClose: () => void;
  onReserveSuccess: (orderId: string) => void;
}

export function ArtworkLightbox({ artwork, currentUser, onUserChange, onClose, onReserveSuccess }: ArtworkLightboxProps) {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!artwork) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !loading && !isAuthOpen) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [artwork, onClose, loading, isAuthOpen]);

  if (!artwork) return null;

  const handleAcquisitionAttempt = async () => {
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/marketplace/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artwork_id: artwork.id }),
      });
      const data = await response.json() as { error?: string; order_id?: string };
      if (!response.ok || !data.order_id) throw new Error(data.error || 'Reservation failed.');
      setSuccess(`Reservation ${data.order_id} created. Payment is pending; no charge was made.`);
      onReserveSuccess(data.order_id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Reservation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !loading) onClose(); }}>
        <section className="lightbox" role="dialog" aria-modal="true" aria-labelledby="lightbox-title">
          <button className="lightbox-close" type="button" onClick={onClose} aria-label="Close artwork details">Close <span aria-hidden="true">×</span></button>
          <div className="lightbox-image"><img src={artwork.image_url} alt={artwork.title} /></div>
          <div className="lightbox-details">
            <span className="eyebrow">Jurreauism collection · {artwork.status}</span>
            <h2 id="lightbox-title">{artwork.title}</h2>
            <p className="lightbox-byline">by {artwork.artist_name}</p>
            <p className="lightbox-price">{formatPrice(artwork.price_cents)}</p>
            <dl className="artwork-facts">
              <div><dt>Medium</dt><dd>{artwork.medium}</dd></div>
              <div><dt>Dimensions</dt><dd>{artwork.dimensions || 'Not specified'}</dd></div>
              <div><dt>Availability</dt><dd className={`fact-status status-text-${artwork.status}`}>{artwork.status}</dd></div>
            </dl>

            {error && <p className="auth-message auth-error" role="alert">{error}</p>}
            {success && <div className="checkout-notice" role="status"><span className="notice-mark" aria-hidden="true">✳</span><div><strong>Reservation received</strong><p>{success}</p></div></div>}
            <div className="lightbox-acquisition">
              {artwork.status === 'available' ? (
                <button className="acquire-button" type="button" onClick={handleAcquisitionAttempt} disabled={loading}>
                  {loading ? 'Processing…' : currentUser ? 'Secure reservation' : 'Sign in to reserve'}
                </button>
              ) : <div className="checkout-notice" role="status">Acquired / reserved</div>}
              {currentUser && <p className="checkout-disclaimer">Signed in as {currentUser.username}. Reservation only — no payment is connected and no charge will be made.</p>}
            </div>
          </div>
        </section>
      </div>
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onSuccess={user => {
        onUserChange(user);
        setIsAuthOpen(false);
        // Request the reservation with the newly issued session cookie.
        void handleAcquisitionAttemptAfterAuth();
      }} />
      <style>{`.lightbox-acquisition{margin-top:1.2rem}.checkout-disclaimer{margin:.65rem 0 0;font-size:.75rem;line-height:1.5;color:var(--muted)}.lightbox-acquisition .acquire-button{width:100%}.auth-error{margin:1rem 0}`}</style>
    </>
  );

  async function handleAcquisitionAttemptAfterAuth() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/marketplace/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artwork_id: artwork.id }),
      });
      const data = await response.json() as { error?: string; order_id?: string };
      if (!response.ok || !data.order_id) throw new Error(data.error || 'Reservation failed.');
      setSuccess(`Reservation ${data.order_id} created. Payment is pending; no charge was made.`);
      onReserveSuccess(data.order_id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Reservation failed.');
    } finally {
      setLoading(false);
    }
  }
}
