import React from 'react';

interface EditionSelectorProps {
  totalEditions: number;
  selectedEdition: number;
  onSelectEdition: (edition: number) => void;
  reservedEditions?: number[];
}

export function EditionSelector({ totalEditions, selectedEdition, onSelectEdition, reservedEditions = [] }: EditionSelectorProps) {
  if (totalEditions <= 1) return null;
  return (
    <div className="edition-selector">
      <label className="edition-selector-label">Select edition ({totalEditions} total)</label>
      <div className="edition-selector-grid">
        {Array.from({ length: totalEditions }, (_, index) => index + 1).map(number => {
          const reserved = reservedEditions.includes(number);
          const selected = selectedEdition === number;
          return <button key={number} type="button" disabled={reserved} aria-pressed={selected} onClick={() => onSelectEdition(number)} className={`edition-choice${reserved ? ' is-reserved' : ''}${selected ? ' is-selected' : ''}`}>
            #{number}{reserved && <span className="sr-only"> reserved</span>}
          </button>;
        })}
      </div>
      <style>{`.edition-selector{margin:1rem 0}.edition-selector-label{display:block;margin-bottom:.6rem;color:var(--muted);font:9px 'DM Mono',monospace;letter-spacing:.1em;text-transform:uppercase}.edition-selector-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;max-height:170px;overflow:auto}.edition-choice{padding:9px 4px;border:1px solid var(--line);background:#191917;color:var(--ink);font:10px 'DM Mono',monospace;cursor:pointer}.edition-choice.is-selected{background:var(--ink);color:var(--paper)}.edition-choice.is-reserved{opacity:.35;text-decoration:line-through;cursor:not-allowed}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`}</style>
    </div>
  );
}
