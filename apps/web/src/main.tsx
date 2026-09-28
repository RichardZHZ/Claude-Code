import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App.tsx';

// 跟随系统的浅色或深色模式。
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.classList.toggle('dark', darkQuery.matches);
applyTheme();
darkQuery.addEventListener('change', applyTheme);

const root = document.getElementById('root');
if (!root) throw new Error('找不到 #root 节点');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
