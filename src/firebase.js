// Firebase initialization (placeholder values loaded from Vite env)
// Provide the real values in .env.local:
// VITE_FB_API_KEY=...
// VITE_FB_AUTH_DOMAIN=...
// VITE_FB_PROJECT_ID=...
// VITE_FB_APP_ID=...
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

let app;
if (!getApps().length) app = initializeApp(config); else app = getApps()[0];

export const db = getFirestore(app);
export const auth = getAuth(app);

export async function ensureAnonAuth(){
  try { if (!auth.currentUser) await signInAnonymously(auth); } catch (e) { console.warn('Anon auth failed', e); }
}
