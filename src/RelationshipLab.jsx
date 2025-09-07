import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ====== Utilities ======
function getWeek(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNo).padStart(2, "0")}`;
}
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now() + Math.random()).toString(36));

// tiny helper for UX
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ====== Data model ======
const CATEGORIES = [
  { id: "trust", label: "Доверие и искренность", color: "#F59E0B", tip: "Открытость, уязвимость, честные разговоры" },
  { id: "friendship", label: "Дружеская близость и партнёрство", color: "#60A5FA", tip: "Совместные дела, бытовая поддержка, общие хобби" },
  { id: "passion", label: "Страсть и романтика", color: "#F87171", tip: "Флирт, свидания, интимная близость" },
  { id: "adventure", label: "Совместные переживания и приключения", color: "#86EFAC", tip: "Новые впечатления, путешествия, выход из рутины" },
  { id: "respect", label: "Взаимное уважение и поддержка", color: "#C084FC", tip: "Границы, признание целей, опора в сложностях" },
];

// Minimalistic inline icons (stroke currentColor / filled) to save bundle & avoid deps
function CategoryIcon({ id, color }) {
  const common = { width: 22, height: 22, strokeWidth: 1.6, stroke: 'currentColor', fill: 'none', vectorEffect: 'non-scaling-stroke' };
  const col = { color };
  switch (id) {
    case 'trust': // shield-heart
      return (
        <div className="flex items-center justify-center" style={col} aria-hidden>
          <svg {...common} viewBox="0 0 24 24">
            <path d="M12 3l7 3v5.2c0 4.1-2.9 7.9-7 9-4.1-1.1-7-4.9-7-9V6l7-3z" />
            <path d="M9.7 11.3a2.1 2.1 0 013-3 2.1 2.1 0 013 3L12.7 14a1 1 0 01-1.4 0l-1.6-1.6z" strokeLinejoin="round" />
          </svg>
        </div>
      );
    case 'friendship': // two users
      return (
        <div className="flex items-center justify-center" style={col} aria-hidden>
          <svg {...common} viewBox="0 0 24 24">
            <circle cx="8" cy="9" r="3" />
            <circle cx="16" cy="9" r="3" />
            <path d="M4.5 18a3.5 3.5 0 013.5-3.5h.5A3.5 3.5 0 0112 18" />
            <path d="M12 18a3.5 3.5 0 013.5-3.5h.5A3.5 3.5 0 0119.5 18" />
          </svg>
        </div>
      );
    case 'passion': // heart / flame hybrid
      return (
        <div className="flex items-center justify-center" style={col} aria-hidden>
          <svg {...common} viewBox="0 0 24 24">
            <path d="M12.7 5.2a3.2 3.2 0 015.2 2.5c0 3.5-4 6.1-6.4 8.3-2.4-2.2-6.4-4.8-6.4-8.3A3.2 3.2 0 0110.3 5.2 3 3 0 0112 7a3 3 0 01.7-1.8z" />
          </svg>
        </div>
      );
    case 'adventure': // compass
      return (
        <div className="flex items-center justify-center" style={col} aria-hidden>
          <svg {...common} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          </svg>
        </div>
      );
    case 'respect': // hands/support
      return (
        <div className="flex items-center justify-center" style={col} aria-hidden>
          <svg {...common} viewBox="0 0 24 24">
            <path d="M8 13l3 3 5-5" />
            <path d="M5 8l4-4h6l4 4v6l-4 4H9l-4-4V8z" />
          </svg>
        </div>
      );
    default:
      return null;
  }
}

const defaultScale = { trust: 50, friendship: 50, passion: 50, adventure: 50, respect: 50 };

// Built-in suggestion bank (shortened)
const BANK = {
  trust: [
    { title: "Час уязвимости", desc: "По очереди делимся 3 страхами и 3 желаниями." },
    { title: "Ритуал правды", desc: "5 минут правды без советов." },
    { title: "Карта границ", desc: "Что ок/не ок/обсудить — на одной схеме." },
  ],
  friendship: [
    { title: "Проект на час", desc: "Собрать что-то вместе." },
    { title: "Прогулка без телефонов", desc: "30 минут только разговор." },
  ],
  passion: [
    { title: "Свидание-ролевая", desc: "Встречаемся как будто впервые." },
    { title: "Сенсорный вечер", desc: "Свечи, музыка, массаж 10+10." },
  ],
  adventure: [
    { title: "Микропутешествие", desc: "Новый район/рынок/тропа." },
    { title: "Фото-квест", desc: "10 кадров-исследований." },
  ],
  respect: [
    { title: "Интервью мечты", desc: "Цели на 1–3 года и шаги поддержки." },
    { title: "Банк комплиментов", desc: "Одна заметка — пополняем ежедневно." },
  ],
};

// ====== Visual helpers ======
function Tube({ value, color, label }) {
  // value: 0-100
  const fillHeight = `${value}%`;
  const glassGradient = 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0.05) 70%, rgba(255,255,255,0.12) 100%)';
  const fillGradient = `linear-gradient(180deg, ${lighten(color,35)} 0%, ${lighten(color,10)} 35%, ${color} 85%, ${darken(color,12)} 100%)`;
  return (
    <div className="flex flex-col items-center gap-2">
  <div className="relative h-40 w-14 rounded-[20px] border-2 border-neutral-300/70 bg-gradient-to-b from-neutral-200/50 to-neutral-100/20 backdrop-blur-sm shadow-sm overflow-hidden">
        {/* Inner glass effect */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: glassGradient }} />
        {/* Fill */}
        <div
          className="absolute bottom-0 left-0 right-0 transition-[height] duration-500 ease-out rounded-b-[16px]"
          style={{ height: fillHeight, background: fillGradient, boxShadow: 'inset 0 2px 4px -2px rgba(255,255,255,0.8), inset 0 -3px 6px -2px rgba(0,0,0,0.25)' }}
        />
        {/* Vertical highlight */}
        <div className="absolute inset-y-0 left-0 w-[38%] pointer-events-none mix-blend-screen" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.15) 60%, transparent 100%)' }} />
        {/* Bottom elliptical shine */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[85%] h-6 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.05) 70%, transparent 75%)' }} />
      </div>
      <div className="text-xs text-neutral-600 text-center leading-tight px-1">{label}</div>
  <div className="text-xs sm:text-sm font-bold tracking-tight text-neutral-700">{value}%</div>
    </div>
  );
}

// Editable tubes for direct manipulation of player values
function EditableTubes({ model, partner, avg, onChange, disabled }) {
  const handleSet = useCallback((catId, clientY, rect) => {
    const rel = 1 - (clientY - rect.top) / rect.height;
    const percent = Math.max(0, Math.min(1, rel));
    const v = Math.round(percent * 100);
    onChange({ ...model, [catId]: v });
  }, [model, onChange]);
  const [hovered, setHovered] = useState(null);

  const startDrag = (e, catId) => {
    if (disabled) return;
    e.preventDefault();
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const move = (ev) => {
      const y = (ev.touches ? ev.touches[0].clientY : ev.clientY);
      handleSet(catId, y, rect);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
    // initial
    move(e);
  };

  const handleKey = (e, catId) => {
    if (disabled) return;
    const delta = (e.key === 'ArrowUp') ? 1 : (e.key === 'ArrowDown') ? -1 : 0;
    if (delta !== 0) {
      e.preventDefault();
      const next = Math.max(0, Math.min(100, (model[catId] ?? 0) + delta));
      onChange({ ...model, [catId]: next });
    }
  };

  return (
  <div className="flex gap-4 md:gap-6 lg:gap-8 justify-between">
      {CATEGORIES.map(c => {
        const v = model[c.id];
        return (
          <div
            key={c.id}
      className="flex flex-col items-center gap-1 select-none w-16 relative"
            aria-label={c.label}
            onMouseEnter={() => setHovered(c.id)}
            onMouseLeave={() => setHovered(h => h === c.id ? null : h)}
            onFocus={() => setHovered(c.id)}
            onBlur={() => setHovered(h => h === c.id ? null : h)}
          >
            {/* Tooltip */}
            {hovered === c.id && (
              <div className="absolute -top-28 left-1/2 -translate-x-1/2 z-20 pointer-events-none" style={{ width: '168px' }}>
                <div className="px-3 py-2 rounded-xl bg-white/95 backdrop-blur border shadow text-[10px] leading-tight space-y-1">
                  <div className="text-[10px] font-semibold text-neutral-700 truncate">{c.label}</div>
                  <div className="flex justify-between"><span className="text-neutral-500">Я</span><span className="font-medium">{v}%</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Партнёр</span><span className="font-medium">{partner?.[c.id]}%</span></div>
                  <div className="flex justify-between"><span className="text-neutral-500">Среднее</span><span className="font-medium">{avg?.[c.id]}%</span></div>
                </div>
              </div>
            )}
            <button
              type="button"
              className={"relative h-40 w-16 rounded-[22px] border-2 transition-colors outline-none " + (disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer focus:ring-2 focus:ring-offset-1 focus:ring-neutral-400')}
              style={{ borderColor: c.color + '80' }}
              onPointerDown={(e)=>startDrag(e,c.id)}
              onTouchStart={(e)=>startDrag(e,c.id)}
              onKeyDown={(e)=>handleKey(e,c.id)}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={v}
              aria-valuetext={`${v}%`}
              tabIndex={disabled ? -1 : 0}
            >
              <div className="absolute inset-0 rounded-[22px] overflow-hidden">
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0.05) 70%, rgba(255,255,255,0.12) 100%)' }} />
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-b-[20px] transition-[height] duration-300"
                  style={{ height: v + '%', background: `linear-gradient(180deg, ${lighten(c.color,35)} 0%, ${lighten(c.color,10)} 35%, ${c.color} 85%, ${darken(c.color,12)} 100%)`, boxShadow: 'inset 0 2px 4px -2px rgba(255,255,255,0.8), inset 0 -3px 6px -2px rgba(0,0,0,0.25)' }}
                >
                  {v>0 && v<100 && (
                    <>
                      <div className="absolute -top-px left-0 right-0 h-px bg-black/25 mix-blend-multiply opacity-40" />
                      <div className="absolute top-0 left-0 right-0 h-2 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0) 100%)' }} />
                    </>
                  )}
                </div>
                <div className="absolute inset-y-0 left-0 w-[38%] pointer-events-none mix-blend-screen" style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.15) 60%, transparent 100%)' }} />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[85%] h-6 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.05) 70%, transparent 75%)' }} />
              </div>
            </button>
            <div className="text-xs sm:text-sm font-bold text-neutral-800 leading-none">{v}%</div>
            <div className="h-6 flex items-center justify-center" aria-hidden>
              <CategoryIcon id={c.id} color={c.color} />
              <span className="sr-only">{c.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// simple color helpers (no deps) — operate on hex colors like #RRGGBB
function lighten(hex, pct) { return shift(hex, pct); }
function darken(hex, pct) { return shift(hex, -pct); }
function shift(hex, pct) {
  if(!/^#?[0-9a-fA-F]{6}$/.test(hex||'')) return hex;
  const h = hex.replace('#','');
  const nums = [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  const f = (c)=> Math.max(0, Math.min(255, Math.round(c + (pct/100)*255)));
  const out = nums.map(f).map(n=>n.toString(16).padStart(2,'0')).join('');
  return '#'+out;
}

function SliderRow({ model, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {CATEGORIES.map((c) => {
        const val = model[c.id];
        return (
          <div key={c.id} className="p-4 rounded-2xl border bg-white/70 backdrop-blur shadow-sm">
            <div className="text-sm font-semibold mb-1">{c.label}</div>
            <div className="text-xs text-neutral-500 mb-2">{c.tip}</div>
            <input
              type="range"
              min={0}
              max={100}
              value={val}
              onChange={(e) => onChange({ ...model, [c.id]: Number(e.target.value) })}
              className="w-full touch-none"
              style={{ '--c': c.color, '--p': `${val}%`, accentColor: c.color }}
            />
            <div className="flex items-center justify-between mt-2">
              <div className="text-xs text-neutral-500">0</div>
              <div className="text-xs font-medium">{val}%</div>
              <div className="text-xs text-neutral-500">100</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Suggestions({ items, onSend, onDelete }) {
  // items: [{id?, title, desc, weight?, source, packId?, categoryId?}]
  const list = items || [];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {list.map((p, i) => (
        <div key={p.id || i} className="group rounded-2xl border p-3 bg-white/80 shadow-sm flex flex-col justify-between relative">
          {(p.source === 'generated' || p.source === 'custom') && (
            <button
              type="button"
              onClick={() => onDelete?.(p)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-400 hover:text-red-600 text-xs"
              title="Удалить карточку"
            >
              ×
            </button>
          )}
          <div>
            <div className="text-sm font-semibold mb-1 flex items-center gap-2">
              <span>{p.title}</span>
              {p.weight ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-white">+{p.weight}</span> : null}
            </div>
            <div className="text-xs text-neutral-600 whitespace-pre-line">{p.desc}</div>
          </div>
          <button
            onClick={() => onSend(p)}
            className="mt-3 inline-flex items-center justify-center text-sm font-semibold rounded-2xl px-4 py-3 bg-neutral-900 text-white active:scale-[0.99] disabled:opacity-40"
          >
            Отправить партнёру
          </button>
        </div>
      ))}
    </div>
  );
}

// ====== WebRTC helper (manual copy-paste signaling) ======
function useManualP2P(onMessage) {
  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const [status, setStatus] = useState("disconnected");
  const [offerText, setOfferText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [error, setError] = useState("");
  const reconnectTimerRef = useRef(null);
  const heartbeatRef = useRef({ last: Date.now() });

  function resetPC() {
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null; dcRef.current = null;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
  }

  function ensurePC() {
    if (pcRef.current && pcRef.current.connectionState !== "closed") return pcRef.current;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === 'failed' || st === 'disconnected') {
        attemptReconnect();
      } else if (st === 'connected') {
        setStatus('connected');
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      } else {
        setStatus(st);
      }
    };
    pc.ondatachannel = (ev) => {
      dcRef.current = ev.channel;
      dcRef.current.onmessage = (e) => onMessage?.(e.data);
      setStatus("connected");
    };
    setError("");
    return pc;
  }

  function attemptReconnect() {
    if (!pcRef.current) return;
    if (reconnectTimerRef.current) return; // already trying
    setStatus('reconnecting');
    try { pcRef.current.restartIce?.(); } catch {}
    reconnectTimerRef.current = setTimeout(() => {
      if (pcRef.current && pcRef.current.iceConnectionState !== 'connected') {
        setStatus('disconnected');
      }
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    }, 7000);
  }

  async function startHost() {
    try {
      resetPC();
      const pc = ensurePC();
      const dc = pc.createDataChannel("lab");
      dcRef.current = dc;
    dc.onmessage = (e) => handleChannelMessage(e.data);
      setStatus("connecting");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForICE(pc);
      setOfferText(JSON.stringify(pc.localDescription));
    } catch (e) {
      setError(String(e?.message || e));
      setStatus("error");
    }
  }

  async function acceptAnswer(text) {
    try {
      if (!pcRef.current) throw new Error("Сначала создайте OFFER");
      const pc = pcRef.current;
      if (!text?.trim()) throw new Error("ANSWER пустой");
      const desc = new RTCSessionDescription(JSON.parse(text));
      if (desc.type !== "answer") throw new Error("Ожидается SDP с type=answer");

      // Guards against double-apply causing InvalidStateError
      if (pc.signalingState === "stable" && pc.currentRemoteDescription) {
        // already set — just mark connected
        setStatus("connected");
        return;
      }
      if (pc.signalingState !== "have-local-offer") {
        throw new Error(`Неверный порядок: текущее состояние ${pc.signalingState}. Сначала сгенерируйте OFFER.`);
      }
      await pc.setRemoteDescription(desc);
      setStatus("connected");
      setAnswerText("");
      setError("");
    } catch (e) {
      setError(String(e?.message || e));
      setStatus("error");
      console.warn("acceptAnswer error", e);
    }
  }

  async function startJoiner(offerString) {
    try {
      resetPC();
      const pc = ensurePC();
      if (!offerString?.trim()) throw new Error("OFFER пустой");
      const offer = new RTCSessionDescription(JSON.parse(offerString));
      if (offer.type !== "offer") throw new Error("Ожидается SDP с type=offer");
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForICE(pc);
      setAnswerText(JSON.stringify(pc.localDescription));
      setStatus("connecting");
      setError("");
    } catch (e) {
      setError(String(e?.message || e));
      setStatus("error");
      console.warn("startJoiner error", e);
    }
  }

  function send(obj) {
    try {
      if (!dcRef.current || dcRef.current.readyState !== "open") return;
        dcRef.current.send(JSON.stringify(obj));
    } catch (e) {
      setError(String(e?.message || e));
    }
  }
  function disconnect() {
    resetPC();
    setStatus("disconnected");
    setOfferText("");
    setAnswerText("");
    setError("");
  }

    function handleChannelMessage(raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.__sys === 'ping') {
          // respond
          try { dcRef.current?.send(JSON.stringify({ __sys: 'pong' })); } catch {}
          return;
        }
        if (parsed && parsed.__sys === 'pong') {
          heartbeatRef.current.last = Date.now();
          return;
        }
      } catch {
        // non JSON payload – treat as user message
      }
      heartbeatRef.current.last = Date.now();
      onMessage?.(raw);
    }

    // Heartbeat / stale detection
    useEffect(() => {
      const int = setInterval(() => {
        const dc = dcRef.current;
        if (!dc || dc.readyState !== 'open') return;
        // send ping
        try { dc.send(JSON.stringify({ __sys: 'ping' })); } catch {}
        if (Date.now() - heartbeatRef.current.last > 20000) {
          attemptReconnect();
        }
      }, 8000);
      return () => clearInterval(int);
    }, []);

  return { status, offerText, answerText, setOfferText, setAnswerText, startHost, acceptAnswer, startJoiner, send, disconnect, error };
}

function waitForICE(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
  });
}

// ====== Random card generator ======
function generateCard(categoryId, weight) {
  const base = {
    trust: [
      { w: 1, t: "Мини‑чекап доверия", d: "Ответьте по очереди на 3 лёгких вопроса: что порадовало сегодня, чему благодарен, что хотелось бы улучшить?" },
      { w: 5, t: "Маленькая уязвимость", d: "Поделитесь одной недавней ошибкой и чем вы из неё вынесли. Партнёр — только слушает и поддерживает." },
      { w: 10, t: "Глубокий разговор", d: "30‑мин сессия без телефонов: один говорит, другой перефразирует и задаёт уточняющие вопросы." },
      { w: 15, t: "Вечер искренности", d: "60‑мин ритуал: карта границ, 3 триггера и 3 способа поддержки. Завершите объятиями 3 минуты." },
    ],
    friendship: [
      { w: 1, t: "Мелкая бытовая помощь", d: "Сделайте за партнёра одну маленькую рутину сегодня." },
      { w: 5, t: "Совместная готовка", d: "Приготовьте простой ужин, разделив роли шеф/помощник." },
      { w: 10, t: "Мини‑проект на вечер", d: "Соберите что‑то вместе (полка, фотоколлаж, плейлист на месяц)." },
      { w: 15, t: "План на неделю", d: "Спринт на 7 дней: одна общая цель, роли и чек‑ин через день." },
    ],
    passion: [
      { w: 1, t: "Флирт‑сообщение", d: "Обменяйтесь 3 игривыми сообщениями в течение дня." },
      { w: 5, t: "Мини‑свидание", d: "20 минут романтики: свеча, музыка, запрет на гаджеты." },
      { w: 10, t: "Сенсорный ритуал", d: "Массаж 10+10 минут с согласованными зонами комфорта." },
      { w: 15, t: "Большое свидание", d: "Полноценный вечер: наряды, маршрут из 2 точек и завершающий ритуал благодарности." },
    ],
    adventure: [
      { w: 1, t: "Новый вкус", d: "Попробуйте по одному новому продукту/напитку и обсудите впечатления." },
      { w: 5, t: "Микро‑раскрытие города", d: "Исследуйте новый район 30–45 минут и сделайте 5 фото‑находок." },
      { w: 10, t: "Маршрут на выход", d: "Мини‑поход/велозаезд на 1,5 часа, без соцсетей." },
      { w: 15, t: "День приключения", d: "Полдня новых впечатлений: 3 точки и общий «артефакт дня»." },
    ],
    respect: [
      { w: 1, t: "Микро‑признание", d: "Назовите одну вещь, в которой вы видите силу партнёра." },
      { w: 5, t: "Поддержка цели", d: "Помогите партнёру сделать первый шаг к его задаче этой недели." },
      { w: 10, t: "Сессия про границы", d: "Обсудите 3 «красные» и 3 «зелёные» зоны, как их уважать в быту." },
      { w: 15, t: "Церемония уважения", d: "Часовой ритуал: признания, письмо благодарности, план поддержки на месяц." },
    ],
  };
  const pool = base[categoryId] || [];
  // Выбираем ближайший по весу сценарий
  const pick = pool.reduce(
    (best, cur) => (Math.abs(cur.w - weight) < Math.abs(best.w - weight) ? cur : best),
    pool[0] || { w: weight, t: "Идея", d: "Вместе проведите время, усиливающее эту область." }
  );
  return { title: pick.t, desc: pick.d, weight };
}

// ====== Toasts ======
function Toasts({ toasts, onClose }) {
  return (
    <div className="fixed top-3 right-3 z-[60] space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-3 py-2 rounded-xl text-sm shadow border bg-white ${
            t.type === "error"
              ? "border-red-200 text-red-700"
              : t.type === "warn"
              ? "border-amber-200 text-amber-700"
              : "border-green-200 text-green-700"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium">{t.title}</span>
            <button className="text-xs opacity-60 hover:opacity-100" onClick={() => onClose(t.id)}>
              ×
            </button>
          </div>
          {t.msg && <div className="text-xs opacity-80">{t.msg}</div>}
        </div>
      ))}
    </div>
  );
}

// ====== Main App ======
export default function RelationshipLab() {
  // players & balances
  const [player, setPlayer] = useState("A");
  const [myRole, setMyRole] = useState("A");
  const [A, setA] = useState({ ...defaultScale });
  const [B, setB] = useState({ ...defaultScale });
  const [locked, setLocked] = useState({ A: false, B: false });

  // inboxes
  const [inboxA, setInboxA] = useState([]);
  const [inboxB, setInboxB] = useState([]);

  // generator settings
  const [categoryForHints, setCategoryForHints] = useState("trust");
  const [impact, setImpact] = useState(10); // +1/+5/+10/+15

    // stats
    const [history, setHistory] = useState([]); // {id, week, categoryId, delta, from}

  // custom packs
  const [packs, setPacks] = useState([]); // {id, name, categoryId, active, cards:[{id,title,desc,weight}]}
  const [packForm, setPackForm] = useState({ name: "", categoryId: "trust" });
  const [cardForm, setCardForm] = useState({ title: "", desc: "", weight: 5 });
  const [selectedPackId, setSelectedPackId] = useState(null);

  // generated suggestions (per category)
  const [gen, setGen] = useState([]); // [{id,title,desc,weight,categoryId}]
  const [remainingAI, setRemainingAI] = useState(null); // {trust: n,...}

  // toasts
  const [toasts, setToasts] = useState([]);
  function notify(title, opts = {}) {
    const id = uid();
    setToasts((t) => [...t, { id, title, ...opts }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  const avg = useMemo(() => {
    const o = {};
    for (const c of CATEGORIES) o[c.id] = Math.round((A[c.id] + B[c.id]) / 2);
    return o;
  }, [A, B]);

  const me = player === "A" ? A : B;
  const setMe = player === "A" ? setA : setB;
  const partner = player === "A" ? B : A;
  const myInbox = player === "A" ? inboxA : inboxB;
  const setMyInbox = player === "A" ? setInboxA : setInboxB;
  const partnerInbox = player === "A" ? inboxB : inboxA;
  const setPartnerInbox = player === "A" ? setInboxB : setInboxA;

  const canEdit = !locked[player];

  const clamp = useCallback(function clamp(v) {
    return Math.max(0, Math.min(100, v));
  }, []);
  const applyImpact = useCallback(function applyImpact(state, catId, delta) {
    return { ...state, [catId]: clamp((state[catId] ?? 0) + delta) };
  }, [clamp]);

  // ====== ONLINE SYNC ======
  const applyingRemoteRef = useRef(false);
  const sync = useManualP2P((raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "state") {
        applyingRemoteRef.current = true;
        const s = msg.payload;
        // batch update – minimal re-renders
        setA(s.A);
        setB(s.B);
        setInboxA(s.inboxA);
        setInboxB(s.inboxB);
        setLocked(s.locked);
        setHistory(s.history || []);
        setPacks(s.packs || []);
        setGen(s.gen || []);
        setTimeout(() => (applyingRemoteRef.current = false), 50);
      } else if (msg.type === "card") {
        const item = msg.payload;
        if (item.to === "A") setInboxA((l) => [item, ...l]);
        else setInboxB((l) => [item, ...l]);
        notify("Получена карточка", { msg: item.title });
      } else if (msg.type === "accept") {
        const { id, categoryId, weight } = msg.payload;
        setA((s) => applyImpact(s, categoryId, weight));
        setB((s) => applyImpact(s, categoryId, weight));
        setInboxA((l) => l.filter((x) => x.id !== id));
        setInboxB((l) => l.filter((x) => x.id !== id));
        setHistory((h) => [...h, { id: uid(), week: getWeek(), categoryId, delta: weight, from: msg.from }]);
        notify("Партнёр принял карточку", { type: "success" });
      } else if (msg.type === "decline") {
        const { id } = msg.payload;
        setInboxA((l) => l.filter((x) => x.id !== id));
        setInboxB((l) => l.filter((x) => x.id !== id));
        notify("Карточка отклонена", { type: "warn" });
      } else if (msg.type === "packs") {
        setPacks(msg.payload);
      }
    } catch {}
  });

  // ====== Debounced P2P state sync (skip if unchanged) ======
  const lastSentRef = useRef("");
  useEffect(() => {
    if (applyingRemoteRef.current) return;
    const payload = { A, B, inboxA, inboxB, locked, history, packs, gen };
    const json = JSON.stringify(payload);
    if (json === lastSentRef.current) return; // unchanged
    const t = setTimeout(() => {
      lastSentRef.current = json;
      sync.send({ type: "state", payload });
    }, 150); // debounce
    return () => clearTimeout(t);
  }, [A, B, inboxA, inboxB, locked, history, packs, gen]);

  // ====== Persist to localStorage ======
  // ====== Local persistence with version & debounce ======
  const STORAGE_KEY = 'labState';
  const STORAGE_VERSION = 2;
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const ver = parsed.__v || 1;
      // migration: drop rituals if present, ignore unknown
      const load = (obj) => {
        if (obj.A) setA(obj.A);
        if (obj.B) setB(obj.B);
        if (obj.locked) setLocked(obj.locked);
        if (obj.inboxA) setInboxA(obj.inboxA);
        if (obj.inboxB) setInboxB(obj.inboxB);
        if (Array.isArray(obj.history)) setHistory(obj.history);
        if (Array.isArray(obj.packs)) setPacks(obj.packs);
        if (Array.isArray(obj.gen)) setGen(obj.gen);
      };
      if (ver === 1) {
        // strip rituals and rewrite
        const { rituals: _drop, ...rest } = parsed;
        load(rest);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rest, __v: STORAGE_VERSION }));
      } else {
        load(parsed);
      }
    } catch {}
  }, []);
  useEffect(() => {
    const state = { A, B, locked, inboxA, inboxB, history, packs, gen, __v: STORAGE_VERSION };
    const json = JSON.stringify(state);
    if (json === lastSavedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = json;
      try { localStorage.setItem(STORAGE_KEY, json); } catch {}
    }, 250);
    return () => clearTimeout(saveTimerRef.current);
  }, [A, B, locked, inboxA, inboxB, history, packs, gen]);

  // ====== Actions ======
  const [sendingPulse, setSendingPulse] = useState(false);

  const sendCardToPartner = useCallback(async function sendCardToPartner(card, categoryId) {
    const id = uid();
    const payload = { ...card, id, categoryId, from: myRole, to: myRole === "A" ? "B" : "A" };
    setPartnerInbox([payload, ...partnerInbox]);
    setSendingPulse(true);
    await sleep(120);
    setSendingPulse(false);
    if (sync.status !== "connected") {
      notify("Партнёр офлайн", { type: "warn", msg: "Карточка сохранена локально." });
    } else {
      notify("Карточка отправлена", { type: "success" });
    }
    sync.send({ type: "card", payload });
  }, [myRole, partnerInbox, setPartnerInbox, sync]);

  const handleSendSuggestion = useCallback((card) => {
    const withWeight = { ...card, weight: card.weight ?? impact };
    sendCardToPartner(withWeight, categoryForHints);
  }, [impact, categoryForHints, sendCardToPartner]); // sendCardToPartner stable by its deps

  const acceptCard = useCallback((item) => {
    const { categoryId } = item;
    const w = item.weight ?? impact;
    setA((s) => applyImpact(s, categoryId, w));
    setB((s) => applyImpact(s, categoryId, w));
    setMyInbox((lst) => lst.filter((x) => x.id !== item.id));
    setHistory((h) => [...h, { id: uid(), week: getWeek(), categoryId, delta: w, from: myRole }]);
    sync.send({ type: "accept", payload: { id: item.id, categoryId, weight: w, from: myRole } });
  }, [impact, myRole, applyImpact, setMyInbox]);

  const declineCard = useCallback((item) => {
    setMyInbox((lst) => lst.filter((x) => x.id !== item.id));
    sync.send({ type: "decline", payload: { id: item.id } });
  }, [setMyInbox]);

  // Packs CRUD
  const createPack = useCallback(function createPack() {
    if (!packForm.name.trim()) return;
    const p = { id: uid(), name: packForm.name.trim(), categoryId: packForm.categoryId, active: true, cards: [] };
    const next = [p, ...packs];
    setPacks(next);
    setSelectedPackId(p.id);
    setPackForm({ name: "", categoryId: packForm.categoryId });
    sync.send({ type: "packs", payload: next });
  }, [packForm, packs]);
  const addCardToPack = useCallback(function addCardToPack() {
    if (!selectedPackId) return;
    if (!cardForm.title.trim()) return;
    const next = packs.map((p) =>
      p.id === selectedPackId
        ? {
            ...p,
            cards: [
              { id: uid(), title: cardForm.title.trim(), desc: cardForm.desc.trim(), weight: Number(cardForm.weight) || 1 },
              ...p.cards,
            ],
          }
        : p
    );
    setPacks(next);
    setCardForm({ title: "", desc: "", weight: 5 });
    sync.send({ type: "packs", payload: next });
  }, [selectedPackId, cardForm, packs]);
  const togglePackActive = useCallback(function togglePackActive(id) {
    const next = packs.map((p) => (p.id === id ? { ...p, active: !p.active } : p));
    setPacks(next);
    sync.send({ type: "packs", payload: next });
  }, [packs]);
  const sendFromPack = useCallback((card, categoryId) => { sendCardToPartner(card, categoryId); }, [sendCardToPartner]);

  // Derived: active custom cards for current category
  const activeCustomCards = useMemo(
    () =>
      packs
        .filter((p) => p.active && p.categoryId === categoryForHints)
        .flatMap((p) => p.cards.map((c) => ({ ...c, packId: p.id }))),
    [packs, categoryForHints]
  );

  // Random suggestion → add to "cards & hints" list (not auto‑send)
  // Prevent immediate duplicates per category
  const lastGeneratedRef = useRef({});
  const addRandomSuggestion = useCallback(async () => {
    let card; let usedAI = false;
    try {
      const resp = await fetch('/api/generate-card?ts=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: categoryForHints, weight: impact })
      });
      if (resp.status === 429) {
        const data = await resp.json().catch(()=>({}));
        notify('Лимит на сегодня', { type: 'warn', msg: data?.msg || '10 в день' });
  // refresh remaining counts
  try { const r = await fetch('/api/generate-card'); if(r.ok){ const j = await r.json(); setRemainingAI(j.remaining); } } catch {}
        return; // не пробуем локально — сигнал юзеру что лимит
      }
      if (resp.ok) {
        const data = await resp.json();
        card = { title: data.title, desc: data.desc, weight: data.weight };
        usedAI = true;
  // refresh remaining counts after successful consume
  try { const r = await fetch('/api/generate-card'); if(r.ok){ const j = await r.json(); setRemainingAI(j.remaining); } } catch {}
      } else {
        let errMsg = 'AI ' + resp.status;
        try {
          const ej = await resp.json();
          if (ej?.error) errMsg = ej.error + (ej.detail ? ': ' + ej.detail : '');
        } catch {}
        throw new Error(errMsg);
      }
    } catch (e) {
      // fallback local
      let tries = 0; let local;
      do {
        local = generateCard(categoryForHints, impact + (tries>1?1:0));
        tries++;
      } while (lastGeneratedRef.current[categoryForHints] === local.title && tries < 4);
      card = local;
      notify('AI недоступен — локальная идея', { type: 'warn', msg: String(e.message||'') });
    }
    if (!card) return;
    lastGeneratedRef.current[categoryForHints] = card.title;
    setGen((g) => [{ id: uid(), ...card, categoryId: categoryForHints }, ...g]);
    notify(usedAI ? 'AI карточка' : 'Сгенерирована карточка', { type: 'success', msg: card.title });
  }, [categoryForHints, impact]);

  // Fetch remaining limits once on mount
  useEffect(() => {
    (async () => {
      try { const r = await fetch('/api/generate-card'); if(r.ok){ const j = await r.json(); setRemainingAI(j.remaining); } } catch {}
    })();
  }, []);

  // Compose visible suggestions list
  const suggestionsForUI = useMemo(() => {
    const builtIn = (BANK[categoryForHints] || []).map(b => ({ ...b, source: 'builtin' }));
    const customs = activeCustomCards.map((c) => ({ id: c.id, packId: c.packId, title: c.title, desc: c.desc, weight: c.weight, source: 'custom', categoryId: categoryForHints }));
    const generated = gen.filter((x) => x.categoryId === categoryForHints).map(g => ({ ...g, source: 'generated' }));
    // Order: custom (user), then generated, then built-in. Deduplicate by title+desc.
    const all = [...customs, ...generated, ...builtIn];
    const seen = new Set();
    return all.filter(c => {
      const key = (c.title + '|' + c.desc).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [categoryForHints, activeCustomCards, gen]);

  const handleDeleteSuggestion = useCallback((item) => {
    if (item.source === 'generated') {
      setGen(g => g.filter(x => x.id !== item.id));
      notify('Удалена сгенерированная карточка', { type: 'warn', msg: item.title });
    } else if (item.source === 'custom') {
      setPacks(packs => packs.map(p => p.id === item.packId ? { ...p, cards: p.cards.filter(c => c.id !== item.id) } : p));
      notify('Удалена пользовательская карточка', { type: 'warn', msg: item.title });
    }
  }, []);

  // ====== UI ======
  const [showSync, setShowSync] = useState(false);

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900 pb-24 lg:pb-10">
      <Toasts toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      <div className="mx-auto p-3 sm:p-6 md:p-8 max-w-6xl">
        {/* Header */}
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Лаборатория отношений</h1>
            <p className="text-neutral-500 text-xs sm:text-sm">P2P‑синк • вес карточек • статистика • редактор паков</p>
          </div>
          <div className="hidden lg:flex items-center gap-2 flex-wrap">
            <div className="px-2 py-1 text-xs rounded-full bg-white border">Экран:</div>
            <div className="flex gap-2">
              <button
                className={`px-4 py-2 rounded-2xl text-sm font-semibold border ${player === "A" ? "bg-neutral-900 text-white" : "bg-white"}`}
                onClick={() => setPlayer("A")}
              >
                Игрок A
              </button>
              <button
                className={`px-4 py-2 rounded-2xl text-sm font-semibold border ${player === "B" ? "bg-neutral-900 text-white" : "bg-white"}`}
                onClick={() => setPlayer("B")}
              >
                Игрок B
              </button>
            </div>
            <div className="w-px h-6 bg-neutral-200 mx-1" />
            <div className="px-2 py-1 text-xs rounded-full bg-white border">Моя роль:</div>
            <div className="flex gap-2">
              <button
                className={`px-4 py-2 rounded-2xl text-sm font-semibold border ${myRole === "A" ? "bg-neutral-900 text-white" : "bg-white"}`}
                onClick={() => setMyRole("A")}
              >
                A
              </button>
              <button
                className={`px-4 py-2 rounded-2xl text-sm font-semibold border ${myRole === "B" ? "bg-neutral-900 text-white" : "bg-white"}`}
                onClick={() => setMyRole("B")}
              >
                B
              </button>
            </div>
            <button onClick={() => setShowSync(true)} className="ml-2 px-4 py-2 rounded-2xl text-sm font-semibold bg-neutral-900 text-white">
              Онлайн‑синхронизация
            </button>
            <span className={`text-xs px-2 py-1 rounded-full border ${sync.status === "connected" ? "bg-green-50 border-green-200 text-green-700" : "bg-white"}`}>
              {sync.status}
            </span>
          </div>
        </header>

  {/* Average section removed (was id="avg") since interactive tubes below replace it */}

        {/* My setup */}
        <section className="mb-8" id="base">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-semibold">Базовая оценка — {player}</h2>
            <button
              className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-semibold border ${locked[player] ? "bg-neutral-900 text-white" : "bg-white"}`}
              onClick={() => setLocked((l) => ({ ...l, [player]: !l[player] }))}
            >
              {locked[player] ? "Разблокировать" : "Заблокировать"}
            </button>
          </div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-neutral-500">Клик или потяни по колбе чтобы задать значение</div>
              {!canEdit && <div className="text-xs text-red-500">Заблокировано</div>}
            </div>
            <EditableTubes model={me} partner={partner} avg={avg} onChange={(v)=> canEdit && setMe(v)} disabled={!canEdit} />
          </div>
          <SliderRow model={me} onChange={(v) => canEdit && setMe(v)} />
        </section>

        {/* Suggestions + weight */}
        <section className="mb-8" id="cards">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-semibold">Карточки‑подсказки</h2>
            <div className="hidden lg:flex gap-2 items-center">
              <select className="border rounded-2xl px-3 py-2 bg-white text-sm" value={categoryForHints} onChange={(e) => setCategoryForHints(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select className="border rounded-2xl px-3 py-2 bg-white text-sm" value={impact} onChange={(e) => setImpact(Number(e.target.value))}>
                {[1, 5, 10, 15].map((w) => (
                  <option key={w} value={w}>
                    +{w}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  onClick={addRandomSuggestion}
                  disabled={remainingAI && remainingAI[categoryForHints] === 0}
                  className={`px-4 py-2 rounded-2xl text-sm font-semibold border ${sendingPulse ? "ring-2 ring-green-400" : ""} ${remainingAI && remainingAI[categoryForHints]===0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {remainingAI ? `Случайно (${remainingAI[categoryForHints]})` : 'Случайно'}
                </button>
                {remainingAI && (
                  <span className="text-[10px] px-2 py-1 rounded-full border bg-white" title="Осталось генераций на сегодня по категории">
                    {remainingAI[categoryForHints]} / 10
                  </span>
                )}
              </div>
            </div>
          </div>
          <Suggestions items={suggestionsForUI} onSend={handleSendSuggestion} onDelete={handleDeleteSuggestion} />
        </section>

        {/* Inbox */}
        <section className="mb-8" id="inbox">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-semibold">Входящие предложения</h2>
            <div className="text-xs text-neutral-500 hidden sm:block">Примите — чтобы пополнить «пробирку» у обоих (по весу карточки)</div>
          </div>
          {myInbox.length === 0 ? (
            <div className="text-sm text-neutral-500 border rounded-2xl p-4 sm:p-6 bg-white text-center">Пока пусто.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {myInbox.map((item) => (
                <div key={item.id} className="rounded-2xl border p-4 bg-white/90 shadow-sm flex flex-col">
                  <div className="text-xs text-neutral-500 mb-1">От: Игрок {item.from}</div>
                  <div className="text-sm font-semibold mb-1 flex items-center gap-2">
                    {item.title}{" "}
                    {item.weight ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-white">+{item.weight}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-neutral-600 mb-3">{item.desc}</div>
                  <div className="mt-auto flex gap-2">
                    <button onClick={() => acceptCard(item)} className="px-4 py-2 rounded-2xl text-sm font-semibold bg-neutral-900 text-white active:scale-[0.99]">
                      Принять
                    </button>
                    <button onClick={() => declineCard(item)} className="px-4 py-2 rounded-2xl text-sm font-semibold border bg-white active:scale-[0.99]">
                      Отклонить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

  {/* Rituals removed */}

        {/* Stats */}
        <section className="mb-12" id="stats">
          <h2 className="text-base sm:text-lg font-semibold mb-3">Статистика по неделям</h2>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left bg-neutral-100">
                  <th className="p-2 border">Неделя</th>
                  {CATEGORIES.map((c) => (
                    <th key={c.id} className="p-2 border">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {getSortedWeeks(history).map(({ week, items }) => (
                  <tr key={week}>
                    <td className="p-2 border font-medium">{week}</td>
                    {CATEGORIES.map((c) => (
                      <td key={c.id} className="p-2 border align-top">{sumDelta(items, c.id)}</td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-neutral-50 font-medium">
                  <td className="p-2 border">Итого</td>
                  {CATEGORIES.map((c) => (
                    <td key={c.id} className="p-2 border">{sumDelta(history, c.id)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Packs Editor */}
        <section className="mb-20" id="packs">
          <h2 className="text-base sm:text-lg font-semibold mb-3">Редактор карточек и паков</h2>
          <div className="p-4 border rounded-2xl bg-white mb-4">
            <div className="text-sm font-semibold mb-2">Создать пак</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="flex-1 border rounded-2xl px-4 py-3 text-sm"
                placeholder="Название пака"
                value={packForm.name}
                onChange={(e) => setPackForm({ ...packForm, name: e.target.value })}
              />
              <select
                className="border rounded-2xl px-4 py-3 text-sm"
                value={packForm.categoryId}
                onChange={(e) => setPackForm({ ...packForm, categoryId: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button onClick={createPack} className="px-4 py-3 rounded-2xl text-sm font-semibold bg-neutral-900 text-white active:scale-[0.99]">
                Создать
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {packs.map((p) => (
              <div key={p.id} className="p-4 border rounded-2xl bg-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-sm">
                    {p.name}{" "}
                    <span className="text-neutral-400">· {CATEGORIES.find((c) => c.id === p.categoryId)?.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs flex items-center gap-1">
                      <input type="checkbox" className="w-5 h-5" checked={p.active} onChange={() => togglePackActive(p.id)} /> активен
                    </label>
                    <button
                      onClick={() => setSelectedPackId(p.id)}
                      className={`px-3 py-2 rounded-2xl text-xs border ${selectedPackId === p.id ? "bg-neutral-900 text-white" : "bg-white"}`}
                    >
                      Редактировать
                    </button>
                  </div>
                </div>
                <ul className="space-y-2 text-sm">
                  {p.cards.length === 0 && <li className="text-neutral-400">Пока нет карточек</li>}
                  {p.cards.map((c) => (
                    <li key={c.id} className="border rounded-2xl p-3 flex items-start justify-between">
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {c.title}{" "}
                          {c.weight ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-white">+{c.weight}</span>
                          ) : null}
                        </div>
                        {c.desc && <div className="text-xs text-neutral-600">{c.desc}</div>}
                      </div>
                      <button
                        onClick={() => sendFromPack({ title: c.title, desc: c.desc, weight: c.weight }, p.categoryId)}
                        className="ml-3 px-3 py-2 rounded-2xl text-xs font-semibold bg-neutral-900 text-white active:scale-[0.99]"
                      >
                        Отправить
                      </button>
                    </li>
                  ))}
                </ul>
                {selectedPackId === p.id && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <input
                      className="flex-1 border rounded-2xl px-4 py-3 text-sm"
                      placeholder="Заголовок карточки"
                      value={cardForm.title}
                      onChange={(e) => setCardForm({ ...cardForm, title: e.target.value })}
                    />
                    <input
                      className="flex-1 border rounded-2xl px-4 py-3 text-sm"
                      placeholder="Описание (необязательно)"
                      value={cardForm.desc}
                      onChange={(e) => setCardForm({ ...cardForm, desc: e.target.value })}
                    />
                    <select
                      className="border rounded-2xl px-4 py-3 text-sm"
                      value={cardForm.weight}
                      onChange={(e) => setCardForm({ ...cardForm, weight: Number(e.target.value) })}
                    >
                      {[1, 5, 10, 15].map((w) => (
                        <option key={w} value={w}>
                          Вес +{w}
                        </option>
                      ))}
                    </select>
                    <button onClick={addCardToPack} className="px-4 py-3 rounded-2xl text-sm font-semibold bg-neutral-900 text-white active:scale-[0.99]">
                      Добавить
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <footer className="hidden lg:block text-xs text-neutral-500 space-y-2 pb-10">
          <p>⚖️ Балансируйте «пробирки»: если одна растёт слишком быстро, отправляйте карточки в соседние области.</p>
          <p>🌐 Онлайн‑синхронизация: модальное окно «Онлайн‑синхронизация», обмен OFFER/ANSWER, затем игра с двух устройств.</p>
        </footer>
      </div>

      {/* Mobile bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 lg:hidden border-t bg-white/95 backdrop-blur p-3 flex items-center gap-2 overflow-x-auto">
        {/* Категория и вес */}
        <select className="min-w-[9rem] flex-1 border rounded-2xl px-3 py-2 text-sm" value={categoryForHints} onChange={(e) => setCategoryForHints(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option value={c.id} key={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="w-20 border rounded-2xl px-3 py-2 text-sm" value={impact} onChange={(e) => setImpact(Number(e.target.value))}>
          {[1, 5, 10, 15].map((w) => (
            <option key={w} value={w}>
              +{w}
            </option>
          ))}
        </select>
        <button
          onClick={addRandomSuggestion}
          disabled={remainingAI && remainingAI[categoryForHints]===0}
          className={`px-3 py-2 rounded-2xl text-xs font-semibold bg-neutral-900 text-white active:scale-[0.99] ${sendingPulse ? "ring-2 ring-green-400" : ""} ${remainingAI && remainingAI[categoryForHints]===0 ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {remainingAI ? `Случайно (${remainingAI[categoryForHints]})` : 'Случайно'}
        </button>

        {/* Мобильные переключатели: экран и роль */}
        <select className="w-24 border rounded-2xl px-2 py-2 text-xs" value={player} onChange={(e) => setPlayer(e.target.value)}>
          <option value="A">Экран A</option>
          <option value="B">Экран B</option>
        </select>
        <select className="w-20 border rounded-2xl px-2 py-2 text-xs" value={myRole} onChange={(e) => setMyRole(e.target.value)}>
          <option value="A">Роль A</option>
          <option value="B">Роль B</option>
        </select>

        {/* Синхронизация и статус */}
        <button onClick={() => setShowSync(true)} className="px-3 py-2 rounded-2xl text-xs font-semibold border whitespace-nowrap">
          Синк
        </button>
        <span className={`text-[10px] px-2 py-1 rounded-full border whitespace-nowrap ${sync.status === "connected" ? "bg-green-50 border-green-200 text-green-700" : "bg-white"}`}>
          {sync.status}
        </span>
      </div>

      {/* Sync modal */}
      {showSync && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-white rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Онлайн‑синхронизация</div>
              <button onClick={() => setShowSync(false)} className="text-sm px-3 py-2 rounded-2xl border">
                Закрыть
              </button>
            </div>
            <div className="text-xs text-neutral-600 mb-4">
              P2P через WebRTC (ручная сигнализация). 1) Хост генерирует OFFER и делится им. 2) Гость генерирует ANSWER и отправляет хосту. 3) Хост подтверждает ANSWER.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-2xl p-4">
                <div className="font-medium mb-2">1) Создать соединение (хост)</div>
                <button type="button" onClick={sync.startHost} className="mb-2 px-4 py-2 rounded-2xl text-xs font-semibold bg-neutral-900 text-white">
                  Сгенерировать OFFER
                </button>
                <textarea className="w-full h-28 border rounded-2xl p-2 text-xs" value={sync.offerText} readOnly placeholder="Скопируйте OFFER партнёру" onFocus={(e)=>e.target.select()} />
                <div className="mt-2 text-xs text-neutral-600">Вставьте ANSWER от партнёра:</div>
                <textarea
                  className="w-full h-28 border rounded-2xl p-2 text-xs"
                  placeholder="Вставьте ANSWER"
                  value={sync.answerText}
                  onChange={(e) => sync.setAnswerText(e.target.value)}
                />
                <button type="button" onClick={() => sync.acceptAnswer(sync.answerText)} className="mt-2 px-4 py-2 rounded-2xl text-xs font-semibold border">
                  Подтвердить ANSWER
                </button>
              </div>
              <div className="border rounded-2xl p-4">
                <div className="font-medium mb-2">2) Присоединиться (гость)</div>
                <textarea
                  className="w-full h-28 border rounded-2xl p-2 text-xs"
                  placeholder="Вставьте OFFER от хоста"
                  value={sync.offerText}
                  onChange={(e) => sync.setOfferText(e.target.value)}
                />
                <button type="button" onClick={() => sync.startJoiner(sync.offerText)} className="mt-2 px-4 py-2 rounded-2xl text-xs font-semibold bg-neutral-900 text-white">
                  Сгенерировать ANSWER
                </button>
                <textarea className="w-full h-28 border rounded-2xl p-2 text-xs mt-2" value={sync.answerText} readOnly placeholder="Скопируйте ANSWER и отправьте хосту" onFocus={(e)=>e.target.select()} />
              </div>
            </div>
            <div className="mt-3 text-xs">
              Состояние: <span className="font-medium">{sync.status}</span>
            </div>
            {sync.error && (
              <div className="mt-2 text-xs text-red-600">
                Ошибка: {sync.error}
              </div>
            )}
            <div className="mt-2">
              <button type="button" onClick={sync.disconnect} className="px-3 py-2 rounded-2xl text-xs font-semibold border">
                Сбросить соединение
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== helpers (stats) ======
function groupByWeek(history) {
  const map = {};
  for (const h of history) (map[h.week] ||= []).push(h);
  return map;
}
function getSortedWeeks(history) {
  const grouped = groupByWeek(history);
  return Object.entries(grouped)
    .map(([week, items]) => ({ week, items }))
    .filter(({ items }) => CATEGORIES.some((c) => sumDelta(items, c.id) !== 0))
    .sort((a, b) => (a.week < b.week ? 1 : -1)); // desc
}
function sumDelta(items, categoryId) {
  return items.filter((i) => i.categoryId === categoryId).reduce((acc, x) => acc + (x.delta || 0), 0);
}

// ====== Dev self‑tests (non‑blocking, console only) ======
(function runSelfTests() {
  if (typeof window !== "undefined" && window.__REL_LAB_TESTS__) return;
  if (typeof window !== "undefined") window.__REL_LAB_TESTS__ = true;
  try {
    // generateCard picks nearest weight
    const g1 = generateCard("trust", 1);
    console.assert(g1.weight === 1 && typeof g1.title === "string", "generateCard nearest (1)");
    const g2 = generateCard("respect", 12);
    console.assert([10, 15].includes(g2.weight), "generateCard nearest (12→10/15)");

    // stats helpers
    const wk = getWeek(new Date("2025-01-06")); // ISO week start
    console.assert(/\d{4}-\d{2}/.test(wk), "getWeek format");
    const h = [
      { week: "2025-01", categoryId: "trust", delta: 5 },
      { week: "2025-01", categoryId: "trust", delta: 10 },
      { week: "2025-01", categoryId: "passion", delta: 1 },
    ];
    console.assert(sumDelta(h, "trust") === 15, "sumDelta trust");
    console.assert(sumDelta(h, "passion") === 1, "sumDelta passion");
    console.log("RelationshipLab self-tests passed ✅");
  } catch (e) {
    console.warn("RelationshipLab self-tests failed", e);
  }
})();
