import React, { useEffect, useState } from 'react';

interface CertificateModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
}
interface CertificateData {
  id: string;
  order_id: string;
  artwork_id: string;
  owner_id: string;
  edition_string: string;
  hash_signature: string;
  issued_at: string;
}

export function CertificateModal({ orderId, isOpen, onClose }: CertificateModalProps) {
  const [certificate, setCertificate] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !orderId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setCertificate(null);
    fetch(`/api/provenance/verify/${encodeURIComponent(orderId)}`, { credentials: 'include', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as CertificateData & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Failed to load certificate.');
        setCertificate(data);
      })
      .catch(requestError => { if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Failed to load certificate.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isOpen, orderId]);

  if (!isOpen) return null;
  return <div className="certificate-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="certificate-modal" role="dialog" aria-modal="true" aria-labelledby="certificate-title">
      <button className="certificate-close" type="button" onClick={onClose} aria-label="Close certificate">×</button>
      <header><span className="eyebrow">Jurreauism · Provenance record</span><h2 id="certificate-title">Certificate of authenticity</h2><p>Issued only after confirmed payment settlement.</p></header>
      {loading ? <p role="status">Verifying certificate…</p> : error ? <p className="certificate-error" role="alert">{error}</p> : certificate && <div className="certificate-grid">
        <div><span>Artwork ID</span><strong>{certificate.artwork_id}</strong></div><div><span>Edition</span><strong>{certificate.edition_string}</strong></div>
        <div><span>Owner ID</span><strong>{certificate.owner_id}</strong></div><div><span>Issued</span><strong>{new Date(certificate.issued_at).toLocaleString()}</strong></div>
        <div className="certificate-hash"><span>HMAC-SHA-256 signature</span><strong>{certificate.hash_signature}</strong></div>
      </div>}
      <style>{`.certificate-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:20px;background:rgba(7,7,6,.88);backdrop-filter:blur(12px)}.certificate-modal{position:relative;width:min(100%,620px);padding:clamp(24px,5vw,42px);border:1px solid var(--line);background:#11110f;color:var(--ink)}.certificate-modal header{text-align:center;border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:22px}.certificate-modal h2{font:400 1.6rem 'Playfair Display',serif}.certificate-modal header p{font-size:.8rem;color:var(--muted)}.certificate-close{position:absolute;top:14px;right:17px;border:0;background:none;color:inherit;font-size:1.5rem;cursor:pointer}.certificate-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.certificate-grid>div{padding:13px;border:1px solid var(--line);background:rgba(255,255,255,.02);min-width:0}.certificate-grid span,.certificate-grid strong{display:block}.certificate-grid span{font:9px 'DM Mono',monospace;text-transform:uppercase;color:var(--muted);margin-bottom:7px}.certificate-grid strong{font:11px 'DM Mono',monospace;overflow-wrap:anywhere}.certificate-grid .certificate-hash{grid-column:1/-1}.certificate-error{padding:15px;color:#e18c7f;text-align:center}`}</style>
    </section>
  </div>;
}
