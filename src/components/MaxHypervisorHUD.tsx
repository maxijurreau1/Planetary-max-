import React, { useEffect, useState } from 'react';

type ServiceStatus = 'CONNECTING' | 'ONLINE' | 'OFFLINE';

/** A lightweight status overlay; it does not claim identity, escrow, or wagering is active. */
export function MaxHypervisorHUD() {
  const [status, setStatus] = useState<ServiceStatus>('CONNECTING');

  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/chess/status', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Chess service unavailable');
        if (mounted) setStatus('ONLINE');
      } catch {
        if (mounted) setStatus('OFFLINE');
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
        .max-hud-card{position:absolute;top:14px;left:14px;padding:11px 14px;min-width:220px;background:rgba(8,12,18,.9);border:1px solid rgba(34,211,238,.5);border-radius:8px;box-shadow:0 8px 30px #0008;backdrop-filter:blur(8px)}
        .max-hud-title{color:#67e8f9;font-weight:700;letter-spacing:.12em}.max-hud-line{margin-top:5px;color:#d4d4d8}.max-hud-note{color:#fbbf24}
        @media(max-width:600px){.max-hud-root{font-size:10px}.max-hud-card{top:8px;left:8px;padding:8px 10px;min-width:190px}}
      `}</style>
      <div className="max-hud-root" aria-label="MAX service status">
        <section className="max-hud-card" aria-live="polite">
          <div className="max-hud-title">MAX // CHESS STATUS</div>
          <div className="max-hud-line">CHESS API: {status}</div>
          <div className="max-hud-line">MATCH: NONE SELECTED</div>
          <div className="max-hud-line max-hud-note">WAGERING / ESCROW: NOT AVAILABLE</div>
        </section>
      </div>
    </>
  );
}
