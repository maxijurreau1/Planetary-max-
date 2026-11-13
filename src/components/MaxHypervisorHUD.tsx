import React, { useEffect, useState } from 'react';

interface Telemetry {
  status: 'CONNECTING' | 'ONLINE' | 'OFFLINE';
  escrow: 'DISABLED' | 'UNAVAILABLE';
}

export function MaxHypervisorHUD() {
  const [telemetry, setTelemetry] = useState<Telemetry>({ status: 'CONNECTING', escrow: 'DISABLED' });

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const response = await fetch('/api/chess/health', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Chess API unavailable');
        if (mounted) setTelemetry({ status: 'ONLINE', escrow: 'DISABLED' });
      } catch {
        if (mounted) setTelemetry({ status: 'OFFLINE', escrow: 'UNAVAILABLE' });
      }
    };
    void check();
    const timer = window.setInterval(check, 15_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  return <>
    <style>{`
      .max-hud-root{position:fixed;inset:0;z-index:10000;pointer-events:none;color:#f4f4f5;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
      .max-hud-card{position:absolute;top:14px;left:14px;padding:10px 13px;background:rgba(8,12,18,.9);border:1px solid rgba(34,211,238,.5);border-radius:8px;box-shadow:0 8px 30px #0008;backdrop-filter:blur(8px)}
      .max-hud-title{color:#67e8f9;font-weight:700;letter-spacing:.12em}.max-hud-line{margin-top:4px;color:#d4d4d8}.max-hud-warning{color:#fbbf24}
      @media(max-width:600px){.max-hud-root{font-size:10px}.max-hud-card{top:8px;left:8px;padding:7px 9px}}
    `}</style>
    <div className="max-hud-root" aria-label="MAX system status">
      <section className="max-hud-card" aria-live="polite">
        <div className="max-hud-title">MAX // CHESS STATUS</div>
        <div className="max-hud-line">API: {telemetry.status}</div>
        <div className="max-hud-line">WAGERING / ESCROW: <span className="max-hud-warning">{telemetry.escrow}</span></div>
      </section>
    </div>
  </>;
}
