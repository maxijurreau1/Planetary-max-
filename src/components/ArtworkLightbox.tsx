import React, { useEffect } from 'react';
import type { Artwork } from '../hooks/useArtworks';
import { formatPrice } from './GalleryWall';

interface ArtworkLightboxProps {
  artwork: Artwork;
  onClose: () => void;
}

export function ArtworkLightbox({ artwork, onClose }: ArtworkLightboxProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="lightbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
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
          <div className="checkout-notice">
            <span className="notice-mark" aria-hidden="true">✳</span>
            <div><strong>Acquisition is not available yet</strong><p>Secure sign-in and payment settlement are not configured. No order or charge will be created.</p></div>
          </div>
          <button className="acquire-button" type="button" disabled>Acquisition coming soon</button>
        </div>
      </section>
    </div>
  );
}
