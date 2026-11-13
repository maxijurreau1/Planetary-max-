import React from 'react';
import { createRoot } from 'react-dom/client';
import { MaxHypervisorHUD } from './components/MaxHypervisorHUD';

const mount = () => {
  if (document.getElementById('max-hud-root')) return;
  const element = document.createElement('div');
  element.id = 'max-hud-root';
  document.body.appendChild(element);
  createRoot(element).render(<React.StrictMode><MaxHypervisorHUD /></React.StrictMode>);
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
