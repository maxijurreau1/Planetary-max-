import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

interface PlanetaryAsset {
  asset_id: string;
  creator: string;
  title: string;
  category: string;
  quantum_hash: string;
  signature: string;
  created_at: number;
}

type ActiveTab = 'gallery' | 'marketplace' | 'hud' | 'account';

export function PortalOS1App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('gallery');
  const [assets, setAssets] = useState<PlanetaryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [hudLogs, setHudLogs] = useState<string[]>([
    'SYSTEM INITIALIZED // LOCAL HUD DEMO',
    'PUBLIC ASSET API: /api/assets'
  ]);
  const [hudInput, setHudInput] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchAssets() {
      try {
        const response = await fetch('/api/assets');
        if (!response.ok) throw new Error(`Asset service returned ${response.status}`);
        const data: { success?: boolean; assets?: PlanetaryAsset[]; error?: string } = await response.json();
        if (!data.success || !Array.isArray(data.assets)) {
          throw new Error(data.error || 'The asset service returned an invalid response.');
        }
        if (!cancelled) setAssets(data.assets);
      } catch (error) {
        if (!cancelled) {
          setAssetError(error instanceof Error ? error.message : 'Unable to load assets.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchAssets();
    return () => { cancelled = true; };
  }, []);

  const handleHudSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const command = hudInput.trim();
    if (!command) return;

    setHudLogs(previous => [
      ...previous,
      `> ${command}`,
      'LOCAL HUD DEMO: command recorded in this browser; no worker action was performed.'
    ]);
    setHudInput('');
  };

  const navButton = (tab: ActiveTab, label: string) => (
    <button
      key={tab}
      type="button"
      onClick={() => setActiveTab(tab)}
      aria-current={activeTab === tab ? 'page' : undefined}
      className={`px-3 py-1 text-xs border ${activeTab === tab ? 'bg-emerald-900 text-white border-emerald-500' : 'bg-black text-emerald-400 border-emerald-900'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-black text-emerald-400 font-mono p-4 md:p-6 selection:bg-emerald-900 selection:text-white">
      <header className="border border-emerald-800 p-4 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center bg-zinc-950 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-white">PORTAL-OS1 // PLANETARY-MAX</h1>
          <p className="text-xs text-emerald-500 mt-1">BEEMAX DIGITAL SPACE // WORKER-BACKED ASSET API</p>
        </div>
        <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
          {navButton('gallery', 'ASSET GALLERY')}
          {navButton('marketplace', 'MARKETPLACE')}
          {navButton('hud', 'SPATIAL HUD')}
          {navButton('account', 'ACCOUNT & AUTH')}
        </nav>
      </header>

      <main className="grid grid-cols-1 gap-6">
        {activeTab === 'gallery' && (
          <section className="border border-emerald-800 p-6 bg-zinc-950/50" aria-labelledby="gallery-heading">
            <h2 id="gallery-heading" className="text-lg font-semibold text-white mb-4">SPATIAL ASSET GALLERY &amp; REGISTRY</h2>
            {loading ? (
              <p role="status" className="text-xs animate-pulse">QUERYING THE PLANETARY-MAX ASSET API...</p>
            ) : assetError ? (
              <p role="alert" className="text-xs text-amber-400">Unable to load registered assets: {assetError}</p>
            ) : assets.length === 0 ? (
              <p className="text-xs text-zinc-400">No registered assets are available yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assets.map(asset => (
                  <article key={asset.asset_id} className="border border-emerald-900 p-4 bg-black flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between text-xs text-emerald-600 mb-1">
                        <span>ID: {asset.asset_id}</span>
                        <span>{asset.signature}</span>
                      </div>
                      <h3 className="text-white font-bold text-sm mb-2">{asset.title}</h3>
                      <p className="text-xs text-emerald-400 mb-2">Category: {asset.category}</p>
                      <p className="text-xs text-zinc-400 break-all font-mono">Hash: {asset.quantum_hash}</p>
                      <p className="text-xs text-zinc-500 mt-2">Creator: {asset.creator}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'marketplace' && (
          <section className="border border-emerald-800 p-6 bg-zinc-950/50" aria-labelledby="market-heading">
            <h2 id="market-heading" className="text-lg font-semibold text-white mb-4">BEEMAX MARKETPLACE</h2>
            <p className="text-xs text-zinc-300 mb-3">A storefront for digital spaces and planetary compute services.</p>
            <p className="text-xs text-amber-400 border border-amber-900 bg-black p-3">
              Marketplace checkout and sovereign-ledger transaction endpoints are not configured in this deployment. No purchases, balances, staking, or yield claims are active here.
            </p>
          </section>
        )}

        {activeTab === 'hud' && (
          <section className="border border-emerald-800 p-6 bg-zinc-950/50" aria-labelledby="hud-heading">
            <h2 id="hud-heading" className="text-lg font-semibold text-white mb-2">SPATIAL HUD // LOCAL DEMO</h2>
            <p className="text-xs text-zinc-400 mb-4">Commands are displayed locally; this console does not execute worker operations.</p>
            <div role="log" aria-live="polite" className="border border-emerald-900 bg-black p-4 h-64 overflow-y-auto mb-4 font-mono text-xs flex flex-col gap-2">
              {hudLogs.map((log, index) => (
                <div key={`${index}-${log}`} className={log.startsWith('LOCAL') ? 'text-white' : 'text-emerald-500'}>{log}</div>
              ))}
            </div>
            <form onSubmit={handleHudSubmit} className="flex gap-2">
              <input
                type="text"
                value={hudInput}
                onChange={event => setHudInput(event.target.value)}
                aria-label="HUD demo command"
                placeholder="Enter a local demo command..."
                className="flex-1 bg-black border border-emerald-900 px-4 py-2 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
              <button type="submit" className="border border-emerald-700 bg-emerald-950 px-6 py-2 text-xs text-white hover:bg-emerald-900">TRANSMIT</button>
            </form>
          </section>
        )}

        {activeTab === 'account' && (
          <section className="border border-emerald-800 p-6 bg-zinc-950/50" aria-labelledby="account-heading">
            <h2 id="account-heading" className="text-lg font-semibold text-white mb-4">ACCOUNT &amp; WORKER AUTHENTICATION</h2>
            <p className="text-xs text-zinc-300 mb-3">This deployment does not provide browser-user login or account sessions.</p>
            <p className="text-xs text-zinc-400">
              The worker currently supports QAL-signed requests from registered nodes for protected node telemetry. It is node-to-worker authentication, not a human login system. Keep the QAL secret on a trusted server; do not put it in this browser app.
            </p>
            <p className="text-xs text-zinc-400 mt-3">
              User accounts, auditable economic transactions, and a sovereign ledger API must be implemented and configured on the worker before this storefront can safely display authenticated identities or balances.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<PortalOS1App />);
}
