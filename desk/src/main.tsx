import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './themes/vacant.css';
import { App } from './App';
import { applyTheme } from './theme';

applyTheme();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
