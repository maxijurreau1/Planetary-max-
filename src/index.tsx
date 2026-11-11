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

export function PortalOS1App() {
  const [activeTab, setActiveTab] = useState<'gallery' | 'marketplace' | 'hud'>('gallery');
  const [assets, setAssets] = useState<PlanetaryAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [datBalance, setDatBalance] = useState<number>(1428.50);
  const [hudLogs, setHudLogs] = useState<string[]>([
    'SYSTEM INITIALIZED // QAL SECURE HASH 0x9F82',
    'BEEMAX MESH LINK ACTIVE // D1 NODE CONNECTED'
  ]);
  const [hudInput, setHudInput] = useState<string>('');

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    try {
      const res = await fetch('/api/assets');
      const data = await res.json();
      if (data.success) {
        setAssets(data.assets);
      }
    } catch (err) {
      // Fallback mock assets if offline emulation
      setAssets([
        {
          asset_id: 'ASSET-001',
          creator: 'MaxJ',
          title: 'Sovereign Sight Contact Lens Blueprint',
          category: 'Hardware Identity',
          quantum_hash: '0x8f9c2b3e4a1d5f67',
          signature: 'DAT-VERIFIED-01',
          created_at: Date.now()
        },
        {
          asset_id: 'ASSET-002',
          creator: 'MaxJ',
          title: 'Portal-OS1 Core Edge Router',
          category: 'Software Architecture',
          quantum_hash: '0x3a4b5c6d7e8f9012',
          signature: 'DAT-VERIFIED-02',
          created_at: Date.now()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleHudSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hudInput.trim()) return;

    const newLog = `> ${hudInput}`;
    const response = `GEMINI HUD: Processed command [${hudInput.toUpperCase()}] across decentralized mesh nodes.`;
    setHudLogs(prev => [...prev, newLog, response]);
    setHudInput('');
  };

  return (
    <div className="min-h-screen bg-black text-emerald-400 font-mono p-4 md:p-6 selection:bg-emerald-900 selection:text-white">
      {/* Top Header / Portal OS Bar */}
      <header className="border border-emerald-800 p-4 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center bg-zinc-950 gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-widest text-white">PORTAL-OS1 // PLANETARY-MAX</h1>
          <p className="text-xs text-emerald-500 mt-1">QAL AUTHENTICATED // DAT ECONOMY ACTIVE</p>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          <div className="border border-emerald-900 px-3 py-1 bg-black text-xs">
            <span className="text-zinc-500">DAT BALANCE:</span> <span className="text-white font-bold">{datBalance.toFixed(2)} DAT</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('gallery')}
              className={`px-3 py-1 text-xs border ${activeTab === 'gallery' ? 'bg-emerald-900 text-white border-emerald-500' : 'bg-black text-emerald-400 border-emerald-900'}`}
            >
              GALLERY
            </button>
            <button
              onClick={() => setActiveTab('marketplace')}
              className={`px-3 py-1 text-xs border ${activeTab === 'marketplace' ? 'bg-emerald-900 text-white border-emerald-500' : 'bg-black text-emerald-400 border-emerald-900'}`}
            >
              BEEMAX MARKET
            </button>
            <button
              onClick={() => setActiveTab('hud')}
              className={`px-3 py-1 text-xs border ${activeTab === 'hud' ? 'bg-emerald-900 text-white border-emerald-500' : 'bg-black text-emerald-400 border-emerald-900'}`}
            >
              GEMINI HUD
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="grid grid-cols-1 gap-6">
        {activeTab === 'gallery' && (
          <section className="border border-emerald-800 p-6 bg-zinc-950/50">
            <h2 className="text-lg font-semibold text-white mb-4">SPATIAL ASSET GALLERY &amp; REGISTRY</h2>
            {loading ? (
              <p className="text-xs animate-pulse">QUERYING D1 DATABASE...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assets.map((asset) => (
                  <div key={asset.asset_id} className="border border-emerald-900 p-4 bg-black flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between text-xs text-emerald-600 mb-1">
                        <span>ID: {asset.asset_id}</span>
                        <span>{asset.signature}</span>
                      </div>
                      <h3 className="text-white font-bold text-sm mb-2">{asset.title}</h3>
                      <p className="text-xs text-emerald-400 mb-2">Category: {asset.category}</p>
                      <p className="text-xs text-zinc-400 truncate font-mono mb-4">Hash: {asset.quantum_hash}</p>
                    </div>
                    <button className="w-full border border-emerald-700 bg-emerald-950/30 text-emerald-300 py-1 text-xs hover:bg-emerald-900 hover:text-white transition-colors">
                      VERIFY QUANTUM SIGNATURE
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'marketplace' && (
          <section className="border border-emerald-800 p-6 bg-zinc-950/50">
            <h2 className="text-lg font-semibold text-white mb-4">BEEMAX DECENTRALIZED MARKETPLACE</h2>
            <p className="text-xs text-zinc-400 mb-6">Peer-to-peer asset exchange and vector staking powered by edge nodes.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-emerald-900 p-4 bg-black">
                <div className="text-xs text-emerald-600 mb-1">NODE LICENSE #01</div>
                <h3 className="text-white font-bold text-sm mb-2">Planetary Relay Node</h3>
                <p className="text-xs text-emerald-400 mb-4">Yield: 12.4% APR in DAT</p>
                <button className="w-full border border-emerald-700 bg-emerald-950 text-emerald-300 py-2 text-xs">STAKE 100 DAT</button>
              </div>
              <div className="border border-emerald-900 p-4 bg-black">
                <div className="text-xs text-emerald-600 mb-1">NODE LICENSE #02</div>
                <h3 className="text-white font-bold text-sm mb-2">Quantum Edge Gateway</h3>
                <p className="text-xs text-emerald-400 mb-4">Yield: 18.2% APR in DAT</p>
                <button className="w-full border border-emerald-700 bg-emerald-950 text-emerald-300 py-2 text-xs">STAKE 250 DAT</button>
              </div>
              <div className="border border-emerald-900 p-4 bg-black">
                <div className="text-xs text-emerald-600 mb-1">NODE LICENSE #03</div>
                <h3 className="text-white font-bold text-sm mb-2">Mesh Storage Vault</h3>
                <p className="text-xs text-emerald-400 mb-4">Yield: 15.0% APR in DAT</p>
                <button className="w-full border border-emerald-700 bg-emerald-950 text-emerald-300 py-2 text-xs">STAKE 150 DAT</button>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'hud' && (
          <section className="border border-emerald-800 p-6 bg-zinc-950/50">
            <h2 className="text-lg font-semibold text-white mb-4">GEMINI HUD // COMMAND CONSOLE</h2>
            <div className="border border-emerald-900 bg-black p-4 h-64 overflow-y-auto mb-4 font-mono text-xs flex flex-col gap-2">
              {hudLogs.map((log, index) => (
                <div key={index} className={log.startsWith('GEMINI') ? 'text-white' : 'text-emerald-500'}>
                  {log}
                </div>
              ))}
            </div>
            <form onSubmit={handleHudSubmit} className="flex gap-2">
              <input
                type="text"
                value={hudInput}
                onChange={(e) => setHudInput(e.target.value)}
                placeholder="Enter command or query telemetry..."
                className="flex-1 bg-black border border-emerald-900 px-4 py-2 text-xs text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
              <button type="submit" className="border border-emerald-700 bg-emerald-950 px-6 py-2 text-xs text-white hover:bg-emerald-900">
                TRANSMIT
              </button>
            </form>
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
