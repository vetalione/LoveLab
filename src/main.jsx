import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// Simple runtime error overlay (dev aid) – will be stripped in prod tree‑shaking if unused
function injectOverlay(){
	if (document.getElementById('__err_overlay')) return;
	const el = document.createElement('div');
	el.id='__err_overlay';
	el.style.cssText='position:fixed;inset:0;z-index:99999;background:#111;color:#f55;font:12px/1.4 monospace;padding:16px;overflow:auto;white-space:pre-wrap;';
	el.innerText='Loading...';
	document.body.appendChild(el);
	return el;
}
function showErrorOverlay(err){
	const el = injectOverlay();
	if(!el) return;
	let header='🔥 Runtime error';
	let name=''; let message=''; let stack='';
	if(err){
		name = err.name || '';
		message = err.message || (typeof err === 'string'? err : '');
		stack = err.stack || '';
	}
	const composed = [header, name && ('Name: '+name), message && ('Message: '+message), stack].filter(Boolean).join('\n\n');
	el.innerText = composed;
	try { console.error('[RUNTIME]', err); } catch {}
}
window.__SHOW_ERR__ = showErrorOverlay;

window.addEventListener('error', (e)=>{ showErrorOverlay(e.error||e.message); });
window.addEventListener('unhandledrejection', (e)=>{ showErrorOverlay(e.reason||'Unhandled rejection'); });

try {
	const rootEl = document.getElementById('root');
	if(!rootEl){
		showErrorOverlay('Root element #root not found');
	} else {
		console.log('[BOOT] Starting app – commit:', import.meta.env.VERCEL_GIT_COMMIT_SHA || 'dev');
		ReactDOM.createRoot(rootEl).render(<App />);
		setTimeout(()=>{
			// If still blank (no children), hint user
			if(!rootEl.firstChild){
				showErrorOverlay('App did not mount (empty root). Check earlier console errors.');
			}
		}, 1500);
	}
} catch (e){
	showErrorOverlay(e);
}

