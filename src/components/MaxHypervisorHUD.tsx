import React, { useEffect, useState } from 'react';

type ServiceStatus = 'CONNECTING' | 'ONLINE' | 'OFFLINE';

/** Shows live showroom API availability without implying payments or provenance verification. */
export function MaxHypervisorHUD() {
  const [status, setStatus] = useState<ServiceStatus>('CONNECTING');
  const [latency, setLatency] = useState('---');

  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      const startedAt = performance.now();
      try {
        const response = await fetch('/api/artworks', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Showroom API unavailable');
        if (mounted) {
          setStatus('ONLINE');
          setLatency(`${Math.round(performance.now() - startedAt)}ms`);
        }
      } catch {
        if (mounted) {
          setStatus('OFFLINE');
          setLatency('---');
        }
      }
    };

    void checkStatus();
    const interval = window.setInterval(checkStatus, 15_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <>
      <style>{`
        .max-hud-root{position:fixed;inset:0;z-index:10000;pointer-events:none;color:#f4f4f5;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}
        .max-hud-card{position:absolute;top:14px;left:14px;padding:11px 14px;min-width:220px;background:rgba(8,12,18,.9);border:1px solid rgba(34,211,238,.5);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.35);backdrop-filter:blur(10px)}
        .max-hud-card-right{left:auto;right:14px;border-color:rgba(16,185,129,.5);text-align:right}
        .max-hud-title{color:#67e8f9;font-weight:700;letter-spacing:.12em}.max-hud-title-green{color:#6ee7b7}.max-hud-line{margin-top:5px;color:#d4d4d8}.max-hud-note{color:#a7f3d0}
        @media(max-width:600px){.max-hud-root{font-size:10px}.max-hud-card{top:8px;left:8px;padding:8px 10px;min-width:0}.max-hud-card-right{left:auto;right:8px}}
      `}</style>
      <div className="max-hud-root" aria-label="MAX showroom status">
        <section className="max-hud-card" aria-live="polite">
          <div className="max-hud-title">MAX HYPERVISOR // SHOWROOM</div>
          <div className="max-hud-line">API: {status} | LATENCY: {latency}</div>
        </section>
        <section className="max-hud-card max-hud-card-right">
          <div className="max-hud-title max-hud-title-green">DAT STANDARD</div>
          <div className="max-hud-line">PROVENANCE: CHECK PER ASSET</div>
          <div className="max-hud-line max-hud-note">RESERVATIONS ONLY · NO PAYMENT CONNECTED</div>
        </section>
      </div>
    </>
  );
}
