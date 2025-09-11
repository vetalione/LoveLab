# LoveLab – Dev Notes

_Last update: 2025-09-11_

## Overview
Experimental relationship improvement app with P2P realtime sync, AI task (card) generation, and gamified progress (tubes & history). Current focus: preparing in‑app purchase / upgrade flow for extended AI generations (100 pack / lifetime).

## Core Features (Implemented)
- WebRTC data channel (manual signaling via Firestore) with:
  - Offer/answer storage & auto re-offer on reload (session resume)
  - Heartbeat + reconnect logic
  - Nickname redundancy (sent in state + dedicated message)
  - Mirrored Firestore snapshots (stateA/stateB, nickA/nickB) for offline continuity
- Role abstraction: local editable state always kept in `A`; partner snapshot in `B` (prevents overwrite race conditions)
- Cards (suggestions) system:
  - Local generation (AI + manual + built-in bank)
  - Sending via P2P (no duplication, optimistic partner inbox update)
  - Accept / decline → impacts both A/B values & recorded in history
  - Nicknames displayed in inbox & toasts, stored in history (fromNick)
- State Sync:
  - Debounced, excludes private `gen` ideas
  - Idempotent inbound card insert (duplicate guard)
- Statistics:
  - Perspective mapping: user always "A"; partner always "B" for counts
  - Sent / Accepted / Total Weight per overall and category
- Invitation flow:
  - Single message format: "Давай наладим химию... <link>" for share & clipboard (mobile + desktop)
  - Copy button (code only) + share with Web Share API fallback
- Mobile UI Enhancements:
  - Enlarged rainbow animated button “Создать задание”
  - Responsive modals & bottom action bar
- AI Generation:
  - Endpoint `/api/generate-card` (serverless)
  - Daily per-category cookie limit (10) with remaining counts endpoint (GET)
  - GPT model cascade: `gpt-5` → `gpt-5-preview` → `gpt-4.1` → `gpt-4o` → `gpt-4o-mini`
  - Local fallback generator (weight snapping) when upstream fails / rate-limiting
- Local persistence:
  - Debounced save to `localStorage` (A, B, inboxes, history, gen)
  - Session info: `labSessCode`, `labSessRole`, nickname `labNick`

## Architecture Snapshot
- Frontend: Vite + React + Tailwind.
- Realtime: WebRTC (pure data channel) + Firestore doc for signaling & state mirroring.
- Storage (transient): Firestore only for signaling/mirror (no permanent multi-user DB yet).
- AI: OpenAI Chat Completions API via serverless function.

## Current Limits & Quotas
| Item | Mechanism | Value |
|------|-----------|-------|
| AI per category/day | Cookie `rl2` counts | 10 |
| Card generation weight range | Prompt + clamp | 1–15 |
| Reconnect debounce | Mirror push | 800ms |

## Data Shapes (Key)
- Card: `{ id, title, desc, weight, categoryId, from, to }`
- Inbox arrays: `inboxA`, `inboxB` (pending acceptance)
- History entry: `{ id, week, categoryId, delta, from, fromNick? }`
- Mirrored Firestore: `{ stateA, stateB, nickA, nickB, offer, answer }`

## Pending / TODO (High Priority)
1. Payments + Upgrade System
   - Add auth (at least stable user ID) to map purchases.
   - Track `aiRemaining`, `aiTier`, `lifetime` in Firestore `users/{uid}`.
   - Webhook consumption & idempotency.
2. Replace cookie-based limit once auth exists (migrate counts to server). 
3. Upsell Modal when limit reached (pack vs lifetime).
4. UI surfacing remaining count near generation trigger (mobile + desktop).
5. Robust error surfacing for AI fallback (include model actually used in response meta optionally).
6. Security hardening (validate categoryId & weight server-side stricter, user quota tamper-proofing).

## Payments Integration Plan
| Step | Action | Notes |
|------|--------|-------|
| 1 | Decide interim auth | Email magic link or anonymous + generated stable ID stored in Firestore. |
| 2 | Add `users` collection | `{ aiRemaining:10, aiTier:'free', lifetime:false, createdAt }` |
| 3 | Add purchase products | `pack100`, `lifetime` (price IDs). |
| 4 | Implement `/api/create-checkout` | Returns hosted checkout URL (provider dependent). |
| 5 | Implement `/api/webhook` | Verify signature → adjust user doc (transaction). |
| 6 | Frontend upsell modal | Show when remaining=0. |
| 7 | Migrate limit logic | Read limit server-side, reflect in UI. |
| 8 | QA flows | Double purchase idempotency, partial payment, cancellation. |

### Provider Notes
- Preferred: Lemon Squeezy (MoR, simple one-time products). Awaiting approval.
- Fallbacks: Paddle / PayPal / Xendit (regional) / Stripe (if KYC feasible) / temporary manual unlock.

## Suggested Firestore User Doc (future)
```jsonc
users/{uid} {
  aiRemaining: 10,
  aiTier: "free" | "onepack" | "lifetime",
  lifetime: false,
  updatedAt: <ts>,
  createdAt: <ts>
}
```
Purchase record:
```jsonc
purchases/{sessionId} {
  uid, productId, amount, createdAt, processed: true
}
```
Webhook idempotency:
```jsonc
webhookEvents/{eventId} { receivedAt }
```

## Local Dev Quick Start
1. `npm install`
2. Create `.env.local`: `OPENAI_API_KEY=...`
3. `npm run dev` → open browser.
4. Generate a few cards; test sending between two tabs (host + guest).
5. Clear local state: DevTools → Application → Local Storage (keys starting with `lab`) + cookie `rl2`.

## Recent Key Commits (chronological latest → earlier)
- 9a5f031 fix share message ordering (desktop)
- 0e0984a gpt-5 cascade
- 685c1e5 unified share logic
- 0cb5cd3 copy button code-only
- b3395bb full invite message copy
- 6773b50 mobile create task button styling
- 421b971 sender nickname in inbox
- b66bc0a stats perspective mapping
- ea9b884 decouple local A vs remote B
- df8d2fe nicknames in toasts & history

## Known Edge Cases / Future Hardening
- If both peers reload simultaneously before Firestore mirror catches up → brief partner tube staleness (acceptable now).
- Cookie limit is per-browser only; multi-device bypass until account system added.
- No server authoritative validation of accept/decline (trust P2P). Could add signature / session host check later.

## Next Session Suggested Focus
1. Choose interim auth & add minimal user doc.
2. Implement purchase flow skeleton (even before provider approval: fake endpoint to simulate success for UI wiring).
3. Add upsell modal + remaining counter UI.

---
_End of notes – safe to extend._
