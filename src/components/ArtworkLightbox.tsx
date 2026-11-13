import React, { useEffect, useState } from 'react';
import type { Artwork } from '../hooks/useArtworks';
import { formatPrice } from './GalleryWall';
import { AuthModal, type AuthUser } from './AuthModal';

interface ReservationResult {
  order_id: string;
  edition_number: number;
  total_editions: number;
  payment_status: string;
}

interface ArtworkLightboxProps {
  artwork: Artwork | null;
  currentUser: AuthUser | null;
  onUserChange: (user: AuthUser | null) => void;
  onClose: () => void;
  onReserveSuccess: (orderId: string) => void;
}

interface ReservationResponse {
  error?: string;
  order_id?: string;
  edition_number?: number;
  total_editions?: number;
  payment_status?: string;
}

export function ArtworkLightbox({ artwork, currentUser, onUserChange, onClose, onReserveSuccess }: ArtworkLightboxProps) {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [editionNumber, setEditionNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<ReservationResult | null>(null);

  useEffect(() => {
    if (!artwork) return;
    setEditionNumber(1);
    setError(null);
    setReservation(null);
  }, [artwork?.id]);

  useEffect(() => {
    if (!artwork) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading && !isAuthOpen) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [artwork, onClose, loading, isAuthOpen]);

  if (!artwork) return null;

  const totalEditions = artwork.total_editions ?? 1;

  const reserveEdition = async (selectedEdition: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/marketplace/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ artwork_id: artwork.id, edition_number: selectedEdition }),
      });

      const data = await response.json() as ReservationResponse;
      if (!response.ok) {
        if (response.status === 401) throw new Error('Sign in is required to reserve this edition.');
        throw new Error(data.error || 'Reservation request failed.');
      }
      if (!data.order_id || !Number.isSafeInteger(data.edition_number) || !Number.isSafeInteger(data.total_editions)) {
        throw new Error('The reservation service returned an invalid response.');
      }

      const result: ReservationResult = {
        order_id: data.order_id,
        edition_number: data.edition_number!,
        total_editions: data.total_editions!,
        payment_status: data.payment_status || 'reserved',
      };
      setReservation(result);
      onReserveSuccess(result.order_id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to complete reservation.');
    } finally {
      setLoading(false);
    }
  };

  const handleReserve = () => {
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }
    void reserveEdition(editionNumber);
  };

  return (
    <>
      <div className="lightbox-backdrop" onMouseDown={event => {
        if (event.target === event.currentTarget && !loading && !isAuthOpen) onClose();
      }}>
        <section className="lightbox" role="dialog" aria-modal="true" aria-labelledby="lightbox-title">
          <button className="lightbox-close" type="button" onClick={onClose} disabled={loading} aria-label="Close artwork details">
            Close <span aria-hidden="true">×</span>
          </button>
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

            {totalEditions > 1 && !reservation && (
              <div className="edition-reservation-select">
                <label htmlFor="edition-number">Edition (1–{totalEditions})</label>
                <input
                  id="edition-number"
                  type="number"
                  min={1}
                  max={totalEditions}
                  step={1}
                  value={editionNumber}
                  disabled={loading}
                  onChange={event => {
                    const parsed = Number(event.target.value);
                    if (Number.isInteger(parsed)) setEditionNumber(Math.min(totalEditions, Math.max(1, parsed)));
                  }}
                />
              </div>
            )}

            {error && <p className="auth-message auth-error" role="alert">{error}</p>}
            {reservation && (
              <div className="checkout-notice" role="status">
                <span className="notice-mark" aria-hidden="true">✳</span>
                <div>
                  <strong>Reservation received</strong>
                  <p>Status: {reservation.payment_status} — edition {reservation.edition_number} of {reservation.total_editions}.</p>
                  <p>Reservation ID: {reservation.order_id}</p>
                  <p>No payment has been processed.</p>
                </div>
              </div>
            )}

            <div className="lightbox-acquisition">
              {!reservation && artwork.status === 'available' ? (
                <button className="acquire-button" type="button" onClick={handleReserve} disabled={loading}>
                  {loading ? 'Reserving edition…' : currentUser ? `Reserve edition #${editionNumber}` : 'Sign in to reserve'}
                </button>
              ) : !reservation ? (
                <div className="checkout-notice" role="status">This artwork is not currently available to reserve.</div>
              ) : null}
              {currentUser && !reservation && (
                <p className="checkout-disclaimer">Signed in as {currentUser.username}. Reservation only — no payment is connected and no charge will be made.</p>
              )}
            </div>
          </div>
        </section>
      </div>
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={user => {
          onUserChange(user);
          setIsAuthOpen(false);
          void reserveEdition(editionNumber);
        }}
      />
      <style>{`
        .lightbox-acquisition{margin-top:1.2rem}
        .checkout-disclaimer{margin:.65rem 0 0;font-size:.75rem;line-height:1.5;color:var(--muted)}
        .lightbox-acquisition .acquire-button{width:100%}
        .edition-reservation-select{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:1rem 0;padding:.75rem 0;border-bottom:1px solid var(--line,#333)}
        .edition-reservation-select label{font-size:.8rem;color:var(--muted,#aaa)}
        .edition-reservation-select input{width:5rem;padding:.45rem .55rem;border:1px solid var(--line,#555);border-radius:4px;background:var(--surface,#111);color:inherit;text-align:right;font:inherit}
        .checkout-notice p{margin:.35rem 0 0}
      `}</style>
    </>
  );
}
