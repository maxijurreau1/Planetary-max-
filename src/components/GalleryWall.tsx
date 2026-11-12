import React from 'react';
import type { Artwork } from '../hooks/useArtworks';

interface GalleryWallProps {
  artworks: Artwork[];
  loading: boolean;
  error: string | null;
  onSelectArtwork: (artwork: Artwork) => void;
  onSelectArtist: (artwork: Artwork) => void;
}

export function GalleryWall({ artworks, loading, error, onSelectArtwork, onSelectArtist }: GalleryWallProps) {
  return (
    <main className="showroom-page">
      <header className="showroom-hero">
        <div>
          <span className="eyebrow">Planetary-Max Exhibition · Curated online</span>
          <h1>The Immersive<br /><span>Showroom</span></h1>
        </div>
        <p className="hero-note">A quiet space to encounter original work, explore the artists behind it, and discover the details that make each piece singular.</p>
        <div className="hero-index" aria-hidden="true"><span>PM—01</span><span>OPEN COLLECTION</span></div>
      </header>

      <section aria-labelledby="collection-heading" className="collection-section">
        <div className="section-heading">
          <div><span className="eyebrow">The collection</span><h2 id="collection-heading">Works on view</h2></div>
          <span className="collection-count">{loading ? 'Loading works' : `${artworks.length.toString().padStart(2, '0')} works`}</span>
        </div>

        {loading ? (
          <div className="showroom-state" role="status">Preparing the exhibition<span className="loading-mark">•••</span></div>
        ) : error ? (
          <div className="showroom-state showroom-error" role="alert">The collection could not be loaded. {error}</div>
        ) : artworks.length === 0 ? (
          <div className="showroom-state">The gallery is being prepared. Please return soon.</div>
        ) : (
          <div className="artwork-grid">
            {artworks.map((artwork, index) => (
              <article className="artwork-card" key={artwork.id}>
                <button className="artwork-image-button" type="button" onClick={() => onSelectArtwork(artwork)} aria-label={`View ${artwork.title} details`}>
                  <div className="artwork-image-wrap">
                    <img src={artwork.image_url} alt={artwork.title} loading={index < 3 ? 'eager' : 'lazy'} />
                    <span className={`status-chip status-${artwork.status}`}>{artwork.status}</span>
                    <span className="view-artwork">View artwork <span aria-hidden="true">↗</span></span>
                  </div>
                </button>
                <div className="artwork-caption">
                  <div><p className="artwork-artist">{artwork.artist_name}</p><h3>{artwork.title}</h3></div>
                  <span className="artwork-price">{formatPrice(artwork.price_cents)}</span>
                </div>
                <p className="artwork-meta">{artwork.medium}{artwork.dimensions ? ` · ${artwork.dimensions}` : ''}</p>
                <button className="text-link" type="button" onClick={() => onSelectArtist(artwork)}>Explore artist <span aria-hidden="true">→</span></button>
              </article>
            ))}
          </div>
        )}
      </section>
      <footer className="showroom-footer"><span>PLANETARY-MAX / JURREAUISM</span><span>AN ONLINE EXHIBITION SPACE</span></footer>
    </main>
  );
}

export function formatPrice(priceCents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(priceCents / 100);
}
