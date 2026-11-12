import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArtworkLightbox } from './components/ArtworkLightbox';
import { ArtistStorefront } from './components/ArtistStorefront';
import { GalleryWall } from './components/GalleryWall';
import { NavbarUser } from './components/NavbarUser';
import type { AuthUser } from './components/AuthModal';
import type { Artwork } from './hooks/useArtworks';
import { useArtworks } from './hooks/useArtworks';
import { showroomStyles } from './showroomStyles';

type View = 'gallery' | 'marketplace' | 'artist';

export function App() {
  const { artworks, loading, error } = useArtworks();
  const [view, setView] = useState<View>('gallery');
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [activeArtistId, setActiveArtistId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { credentials: 'include' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to check session.');
        return response.json() as Promise<{ authenticated?: boolean; user?: AuthUser | null }>;
      })
      .then(data => { if (active && data.authenticated) setCurrentUser(data.user ?? null); })
      .catch(() => { /* Keep the showroom usable when session lookup is unavailable. */ });
    return () => { active = false; };
  }, []);

  const artists = useMemo(() => {
    const unique = new Map<string, Artwork>();
    artworks.forEach(artwork => { if (!unique.has(artwork.artist_id)) unique.set(artwork.artist_id, artwork); });
    return [...unique.values()];
  }, [artworks]);
  const activeArtist = artists.find(artwork => artwork.artist_id === activeArtistId) ?? artists[0];
  const artistWorks = activeArtist ? artworks.filter(artwork => artwork.artist_id === activeArtist.artist_id) : [];
  const marketplaceWorks = artworks.filter(artwork => artwork.status === 'available');

  const openArtist = (artwork: Artwork) => {
    setActiveArtistId(artwork.artist_id);
    setView('artist');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReserveSuccess = () => {
    setSelectedArtwork(current => current ? { ...current, status: 'reserved' } : null);
  };

  return (
    <div className="showroom-app">
      <style>{showroomStyles}</style>
      <nav className="site-nav" aria-label="Main navigation">
        <button className="brand-mark" type="button" onClick={() => setView('gallery')} aria-label="Planetary-Max showroom home"><span className="brand-symbol">P</span><span>PLANETARY-MAX<small>JURREAUISM</small></span></button>
        <div className="nav-links">
          <button className={view === 'gallery' ? 'nav-link active' : 'nav-link'} type="button" onClick={() => setView('gallery')}>Showroom</button>
          <button className={view === 'marketplace' ? 'nav-link active' : 'nav-link'} type="button" onClick={() => setView('marketplace')}>Marketplace</button>
          <button className={view === 'artist' ? 'nav-link active' : 'nav-link'} type="button" onClick={() => { if (activeArtist) setView('artist'); else if (artists[0]) openArtist(artists[0]); }}>{activeArtist ? 'Artist studio' : 'Artists'}</button>
        </div>
        <div className="nav-account"><span className="nav-edition">ONLINE EXHIBITION <i aria-hidden="true" /></span><NavbarUser currentUser={currentUser} onUserChange={setCurrentUser} /></div>
      </nav>

      {view === 'gallery' ? (
        <GalleryWall artworks={artworks} loading={loading} error={error} onSelectArtwork={setSelectedArtwork} onSelectArtist={openArtist} />
      ) : view === 'artist' ? (
        activeArtist ? <ArtistStorefront artistName={activeArtist.artist_name} bio={activeArtist.bio || ''} portfolioUrl={activeArtist.portfolio_url} artworks={artistWorks} onSelectArtwork={setSelectedArtwork} /> : <div className="showroom-page"><div className="showroom-state">{loading ? 'Preparing artist studios…' : 'Artist profiles will appear with the collection.'}</div></div>
      ) : (
        <main className="showroom-page marketplace-page">
          <header className="marketplace-hero"><span className="eyebrow">The collection · Acquisition</span><h1>Find a piece<br /><span>to live with.</span></h1><p>Explore available works from the exhibition. Select a piece to view its story and details.</p><div className="marketplace-rule"><span>{marketplaceWorks.length.toString().padStart(2, '0')} AVAILABLE WORKS</span><span>RESERVATIONS REQUIRE SIGN IN</span></div></header>
          {loading ? <div className="showroom-state" role="status">Preparing the collection…</div> : error ? <div className="showroom-state showroom-error" role="alert">The collection could not be loaded. {error}</div> : marketplaceWorks.length === 0 ? <div className="showroom-state">No works are currently available for acquisition.</div> : (
            <div className="artwork-grid marketplace-grid">{marketplaceWorks.map(artwork => (
              <article className="artwork-card" key={artwork.id}><button className="artwork-image-button" type="button" onClick={() => setSelectedArtwork(artwork)} aria-label={`View ${artwork.title} details`}><div className="artwork-image-wrap"><img src={artwork.image_url} alt={artwork.title} loading="lazy" /><span className="status-chip status-available">Available</span><span className="view-artwork">View artwork <span aria-hidden="true">↗</span></span></div></button><div className="artwork-caption"><div><p className="artwork-artist">{artwork.artist_name}</p><h3>{artwork.title}</h3></div><span className="artwork-price">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(artwork.price_cents / 100)}</span></div><p className="artwork-meta">{artwork.medium}{artwork.dimensions ? ` · ${artwork.dimensions}` : ''}</p></article>
            ))}</div>
          )}
          <footer className="showroom-footer"><span>PLANETARY-MAX / JURREAUISM</span><span>RESERVATION ONLY · NO PAYMENT PROCESSOR CONNECTED</span></footer>
        </main>
      )}

      <ArtworkLightbox artwork={selectedArtwork} currentUser={currentUser} onUserChange={setCurrentUser} onReserveSuccess={handleReserveSuccess} onClose={() => setSelectedArtwork(null)} />
      <style>{`.nav-account{display:flex;align-items:center;gap:20px}.nav-account .nav-edition{white-space:nowrap}@media(max-width:850px){.nav-account .nav-edition{display:none}}@media(max-width:600px){.nav-account{gap:0}.navbar-user-access{padding:7px 8px;font-size:8px}.navbar-user-signed-in{gap:8px}.navbar-user-name{max-width:75px}}`}</style>
    </div>
  );
}

const container = document.getElementById('app');
if (container) createRoot(container).render(<App />);
