import React from 'react';
import type { Artwork } from '../hooks/useArtworks';
import { formatPrice } from './GalleryWall';

interface ArtistStorefrontProps {
  artistName: string;
  bio: string;
  portfolioUrl: string | null;
  artworks: Artwork[];
  onSelectArtwork: (artwork: Artwork) => void;
}

export function ArtistStorefront({ artistName, bio, portfolioUrl, artworks, onSelectArtwork }: ArtistStorefrontProps) {
  return (
    <main className="showroom-page artist-page">
      <header className="artist-hero">
        <span className="eyebrow">Artist studio · Planetary-Max</span>
        <h1>{artistName}</h1>
        <p>{bio || 'An artist in the Planetary-Max collection.'}</p>
        {portfolioUrl && <a className="text-link portfolio-link" href={portfolioUrl} target="_blank" rel="noopener noreferrer">Visit portfolio <span aria-hidden="true">↗</span></a>}
        <span className="artist-monogram" aria-hidden="true">{artistName.trim().charAt(0).toUpperCase()}</span>
      </header>

      <section className="collection-section artist-works" aria-labelledby="artist-works-heading">
        <div className="section-heading"><div><span className="eyebrow">Selected works</span><h2 id="artist-works-heading">From the studio</h2></div><span className="collection-count">{artworks.length.toString().padStart(2, '0')} works</span></div>
        {artworks.length === 0 ? <div className="showroom-state">No works are currently listed for this artist.</div> : (
          <div className="artwork-grid">
            {artworks.map(artwork => (
              <article className="artwork-card" key={artwork.id}>
                <button className="artwork-image-button" type="button" onClick={() => onSelectArtwork(artwork)} aria-label={`View ${artwork.title} details`}>
                  <div className="artwork-image-wrap"><img src={artwork.image_url} alt={artwork.title} loading="lazy" /><span className={`status-chip status-${artwork.status}`}>{artwork.status}</span><span className="view-artwork">View artwork <span aria-hidden="true">↗</span></span></div>
                </button>
                <div className="artwork-caption"><h3>{artwork.title}</h3><span className="artwork-price">{formatPrice(artwork.price_cents)}</span></div>
                <p className="artwork-meta">{artwork.medium}{artwork.dimensions ? ` · ${artwork.dimensions}` : ''}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
