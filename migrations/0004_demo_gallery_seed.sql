-- Demo collection seed. Artist accounts deliberately have no usable password hash;
-- users must create their own account, and the seeded profiles cannot be logged into.
INSERT OR IGNORE INTO users (id, username, password_hash, role, status)
VALUES
  ('artist_1', 'maxjurreau', '!seeded-artist-no-login!', 'user', 'active'),
  ('artist_2', 'lunaquartz', '!seeded-artist-no-login!', 'user', 'active'),
  ('artist_3', 'atlas061', '!seeded-artist-no-login!', 'user', 'active');

INSERT OR IGNORE INTO artist_profiles (user_id, bio, portfolio_url, verified_status)
VALUES
  ('artist_1', 'Conceptual systems architect and fine artist exploring quantum topology, edge-native infrastructure, and symbolic fine-art frameworks.', 'https://github.com/maxijurreau1', 1),
  ('artist_2', 'Light-based installations and dream-state digital sculpture for modern interiors.', 'https://example.com', 1),
  ('artist_3', 'Speculative minimalism, atmospheric textures, and immersive memory objects.', 'https://example.com', 1);

INSERT OR IGNORE INTO artworks (id, artist_id, title, medium, dimensions, price_cents, image_url, status)
VALUES
  ('art_001', 'artist_1', 'Signal Bloom', 'Digital print', '36 x 48 in', 1800, 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=1400&q=85', 'available'),
  ('art_002', 'artist_1', 'Afterimage Atlas', 'Mixed media', '24 x 36 in', 2400, 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=1400&q=85', 'available'),
  ('art_003', 'artist_2', 'Lunar Archive', 'Archival pigment print', '30 x 40 in', 2100, 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=1400&q=85', 'reserved'),
  ('art_004', 'artist_3', 'Static Horizon', 'Acrylic and ink', '22 x 30 in', 1600, 'https://images.unsplash.com/photo-1577083552431-6e5fd01aa342?auto=format&fit=crop&w=1400&q=85', 'available');
