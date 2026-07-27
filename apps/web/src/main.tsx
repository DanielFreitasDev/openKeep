import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('missing #root element');

createRoot(rootEl).render(
  <StrictMode>
    <div className="p-8 font-sans text-lg">OpenKeep — scaffolding (M0)</div>
  </StrictMode>,
);
