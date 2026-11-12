import React, { useEffect, useState } from 'react';

export interface Artwork {
  id: string;
  artist_id: string;
  title: string;
  artist_name: string;
  bio: string | null;
  portfolio_url: string | null;
  medium: string;
  dimensions: string | null;
  price_cents: number;
  image_url: string;
  status: 'available' | 'reserved' | 'sold';
}

interface ArtworksResponse {
  artworks?: Artwork[];
  error?: string;
}

export function useArtworks() {
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadArtworks() {
      try {
        const response = await fetch('/api/artworks', { signal: controller.signal });
        const data = await response.json() as ArtworksResponse;
        if (!response.ok) throw new Error(data.error || `Gallery service returned ${response.status}`);
        if (!Array.isArray(data.artworks)) throw new Error('The gallery service returned an invalid response.');
        setArtworks(data.artworks);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load gallery inventory.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadArtworks();
    return () => controller.abort();
  }, []);

  return { artworks, loading, error };
}
