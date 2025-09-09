import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Firestore signaling (lightweight) — optional: will be used for new simplified flow
import { db, ensureAnonAuth } from './firebase';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, getDoc, deleteDoc, collection, getDocs, where, Timestamp, query } from 'firebase/firestore';

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
function CategoryIcon({ id, color, size = 22, stroke = 1.8 }) {
  const common = { width: size, height: size, strokeWidth: stroke, stroke: 'currentColor', fill: 'none', vectorEffect: 'non-scaling-stroke' };
  const col = { color };
  switch (id) {
    case 'trust': // shield-heart
      // New: minimal handshake (symbolизирует доверие / соглашение)
      return (
        <div className="flex items-center justify-center" style={col} aria-hidden>
          <svg {...common} viewBox="0 0 24 24">
            <path d="M3 12l3.2-3.2a2.4 2.4 0 013.4 0L13 12.2a1.8 1.8 0 002.5 0L20 8" strokeLinecap="round" />
            <path d="M7.5 12.5l2.2 2.2a2.2 2.2 0 003.1 0L14 13.7" strokeLinecap="round" />
            <path d="M10.2 9.8l3 3" strokeLinecap="round" />
          </svg>
        </div>
      );
      // Alt ideas:
      // 1) Overlapping circles (венн) + small heart: two commitments
      // 2) Open padlock (НЕ используем, т.к. убирали лока ранее)
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
      // New: stylized pillar (устойчивость, поддержка, уважение)
      return (
        <div className="flex items-center justify-center" style={col} aria-hidden>
          <svg {...common} viewBox="0 0 24 24">
            <path d="M5 6h14M7 6l1.1-2h7.8L17 6" strokeLinecap="round" />
            <path d="M6 10h12" />
            <path d="M9 10v6M12 10v6M15 10v6" />
            <path d="M5 18h14M6 22h12" />
          </svg>
        </div>
      );
      // Alt ideas:
      // 1) Laurel wreath (признание)
      // 2) Two hands forming support arc
    default:
      return null;
  }
}

const defaultScale = { trust: 50, friendship: 50, passion: 50, adventure: 50, respect: 50 };

// Contrast helper: decide text color (black/white) for given hex
function readableTextColor(hex){
  if(!hex) return '#111';
  const m = hex.replace('#','');
  const r = parseInt(m.substring(0,2),16);
  const g = parseInt(m.substring(2,4),16);
  const b = parseInt(m.substring(4,6),16);
  // relative luminance
  const L = (0.2126*r + 0.7152*g + 0.0722*b)/255;
  return L > 0.62 ? '#111' : '#fff';
}
// Gradient similar to tube styling
function categoryGradient(color){
  try { return `linear-gradient(135deg, ${lighten(color,35)} 0%, ${lighten(color,12)} 35%, ${color} 70%, ${darken(color,10)} 100%)`; } catch { return color; }
}

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

// Editable tubes for direct manipulation of player values + category selection
function EditableTubes({ model, partner, avg, onChange, disabled, onSelectCategory, selectedCategory }) {
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
  if(onSelectCategory) onSelectCategory(catId);
  try { if(window && window.dispatchEvent) window.dispatchEvent(new CustomEvent('lab-scroll-category',{ detail: catId })); } catch {}
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
  if(onSelectCategory) onSelectCategory(catId);
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
              className={"relative h-40 w-16 rounded-[22px] border-2 transition-colors outline-none " + (disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer focus:ring-2 focus:ring-offset-1 ' + (selectedCategory===c.id? 'ring-neutral-800 border-neutral-800' : 'focus:ring-neutral-400'))}
              style={{ borderColor: c.color + '80' }}
              onPointerDown={(e)=>!disabled && startDrag(e,c.id)}
              onTouchStart={(e)=>!disabled && startDrag(e,c.id)}
              onKeyDown={(e)=>!disabled && handleKey(e,c.id)}
              onClick={()=> { if(disabled) return; if(onSelectCategory) onSelectCategory(c.id); try { if(window && window.dispatchEvent) window.dispatchEvent(new CustomEvent('lab-scroll-category',{ detail: c.id })); } catch {} }}
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
            <div className="h-8 flex items-center justify-center" aria-hidden>
              <CategoryIcon id={c.id} color={c.color} size={30} stroke={2.2} />
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

function SliderRow({ model, onChange, onSelectCategory, disabled, selectedCategory }) {
  const [testCat, setTestCat] = useState(null); // category id currently in test
  const [testIndex, setTestIndex] = useState(0);
  const [testAnswers, setTestAnswers] = useState([]); // numbers 1-10
  const mobileRef = useRef(null);
  const cardRefs = useRef({});
  const suppressScrollSelectRef = useRef(false);
  // (debounce removed) immediate category selection on swipe
  // Scroll end detection refs
  const bestIdRef = useRef(null);
  const scrollEndRafRef = useRef(null);
  const scrollCheckingRef = useRef(false);
  const lastScrollPosRef = useRef(0);

  const testQuestions = useMemo(()=>{
    if(!testCat) return [];
    // Simple placeholder statements; could be externalized/localized later
    const base = {
      trust: [
        'Я могу открыто говорить о своих страхах',
        'Мы честны даже в мелочах',
        'Я чувствую принятие без осуждения',
        'Мы обсуждаем трудные темы спокойно',
        'Я могу признать ошибку не боясь реакции',
        'Партнёр делится внутренними переживаниями',
        'Я ощущаю эмоциональную безопасность',
        'Мы доверяем обещаниям друг друга',
        'Я не боюсь быть уязвимым',
        'Чувство доверия растёт с течением времени'
      ],
      friendship: [
        'Мы проводим время в совместных делах', 'Мы поддерживаем хобби друг друга', 'Лёгкость и юмор присутствуют часто', 'Мне комфортно просто «ничего не делать» вместе', 'Мы знаем бытовые предпочтения друг друга', 'Мы помним важные мелочи друг о нём/ней', 'Мы обсуждаем планы на неделю', 'Мы делимся новостями дня', 'Мы решаем мелкие задачи как команда', 'Я чувствую партнёрство каждый день'
      ],
      passion: [
        'Есть флирт в повседневности', 'Мы устраиваем мини‑свидания', 'Я удовлетворён(а) романтической составляющей', 'Есть физическая нежность без ожиданий', 'Мы обсуждаем желания открыто', 'Эксперименты приветствуются', 'Есть ощущение взаимного влечения', 'Мы уделяем время интимной близости', 'Я чувствую себя желанным(ой)', 'Страсть оживает регулярно'
      ],
      adventure: [
        'Мы пробуем новые активности', 'Мы выходим из рутины сознательно', 'Есть совместные мини‑путешествия', 'Мы строим планы впечатлений', 'Мы делаем «необычные» вещи спонтанно', 'Есть чувство совместного исследования', 'Я чувствую свежесть в отношениях', 'Мы делимся мечтами о будущих приключениях', 'Иногда рискуем безопасно', 'Есть что вспомнить за последний месяц'
      ],
      respect: [
        'Мои границы признаются', 'Я уважаю границы партнёра', 'Мы поддерживаем цели друг друга', 'Есть признание усилий', 'Мы говорим без унижения', 'Конфликты без перехода на личности', 'Решения принимаем учитывая обоих', 'Есть взаимная благодарность', 'Я чувствую опору в сложностях', 'Мы ценим различия'
      ]
    };
    return base[testCat] || [];
  }, [testCat]);

  const currentQuestion = testQuestions[testIndex];

  function startTest(catId){
    setTestCat(catId); setTestIndex(0); setTestAnswers([]);
  }
  function answer(value){
    const next = [...testAnswers];
    next[testIndex] = value; // just store, no auto‑advance
    setTestAnswers(next);
  }
  function nextQuestion(){
    // ensure answered
    if(testAnswers[testIndex] == null) return; // ignore click until answer selected
    if(testIndex < testQuestions.length - 1){
      setTestIndex(i=>i+1);
    } else {
      // finalize
      const filled = testAnswers.filter(v=>typeof v === 'number');
      if(!filled.length){ setTestCat(null); return; }
      const avg = filled.reduce((a,b)=>a+b,0)/filled.length; // 1..10
      const percent = Math.round(((avg-1)/9)*100);
      onChange({ ...model, [testCat]: percent });
      if(onSelectCategory) onSelectCategory(testCat);
      setTestCat(null);
    }
  }

  // Sync scroll position with selectedCategory (when changed from outside) on mobile
  useEffect(() => {
    const cont = mobileRef.current;
    if(!cont) return;
    const media = window.matchMedia('(max-width: 639px)'); // < sm
    if(!media.matches) return; // only mobile
    const el = cardRefs.current[selectedCategory];
    if(el) {
      suppressScrollSelectRef.current = true;
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      // release after animation
      setTimeout(()=>{ suppressScrollSelectRef.current = false; }, 400);
    }
  }, [selectedCategory]);

  // On scroll determine the centered card and update selection
  const handleScroll = useCallback(() => {
    const cont = mobileRef.current;
    if(!cont) return;
  const media = window.matchMedia('(max-width: 639px)');
  if(!media.matches) return; // only act on mobile
    const center = cont.scrollLeft + cont.clientWidth/2;
    let bestId = null; let bestDist = Infinity;
    for(const c of CATEGORIES){
      const el = cardRefs.current[c.id];
      if(!el) continue;
      const rect = el.getBoundingClientRect();
      const contRect = cont.getBoundingClientRect();
      const elCenter = rect.left - contRect.left + rect.width/2 + cont.scrollLeft;
      const dist = Math.abs(elCenter - center);
      if(dist < bestDist){ bestDist = dist; bestId = c.id; }
    }
    if(suppressScrollSelectRef.current) return; // ignore during programmatic scroll
    bestIdRef.current = bestId;
    // start watching for scroll end (no position change for a frame)
    if(!scrollCheckingRef.current){
      scrollCheckingRef.current = true;
      lastScrollPosRef.current = cont.scrollLeft;
      const check = () => {
        const pos = cont.scrollLeft;
        if(pos === lastScrollPosRef.current){
          // stable -> finalize selection with a tiny deliberate delay (20ms) to avoid rapid flicker
            const id = bestIdRef.current;
            if(id && id !== selectedCategory && onSelectCategory){
              setTimeout(()=>{
                // ensure still the same best id and not suppressed
                if(bestIdRef.current === id && !suppressScrollSelectRef.current && id !== selectedCategory){
                  onSelectCategory(id);
                }
              },20);
            }
            scrollCheckingRef.current = false;
            scrollEndRafRef.current = null;
            return;
        }
        lastScrollPosRef.current = pos;
        scrollEndRafRef.current = requestAnimationFrame(check);
      };
      scrollEndRafRef.current = requestAnimationFrame(check);
    }
  }, [onSelectCategory, selectedCategory]);

  useEffect(() => {
    const cont = mobileRef.current;
    if(!cont) return;
  const media = window.matchMedia('(max-width: 639px)');
  if(!media.matches) return; // skip attaching on desktop
    cont.addEventListener('scroll', handleScroll, { passive: true });
    const handler = (e)=>{
      const id = e.detail;
      const el = cardRefs.current[id];
      if(el){
        suppressScrollSelectRef.current = true;
        el.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
        setTimeout(()=>{ suppressScrollSelectRef.current = false; }, 400);
      }
    };
    window.addEventListener('lab-scroll-category', handler);
    let rAF;
    const onResize = () => { cancelAnimationFrame(rAF); rAF = requestAnimationFrame(handleScroll); };
    window.addEventListener('resize', onResize);
    // initial
    handleScroll();
  return () => { cont.removeEventListener('scroll', handleScroll); window.removeEventListener('resize', onResize); window.removeEventListener('lab-scroll-category', handler); cancelAnimationFrame(rAF); if(scrollEndRafRef.current) cancelAnimationFrame(scrollEndRafRef.current); };
  }, [handleScroll]);

  const renderCard = (c, mobile=false) => {
    const val = model[c.id];
    return (
      <div
        key={c.id}
        ref={(el)=>{ if(mobile) cardRefs.current[c.id]=el; }}
        className={`p-4 rounded-2xl border shadow-sm relative overflow-hidden z-0 before:content-[''] before:absolute before:inset-0 before:rounded-2xl before:bg-white/55 before:backdrop-blur-sm before:pointer-events-none before:z-0 ${mobile? 'flex-shrink-0 w-[88vw] snap-center':'w-full'} ${selectedCategory===c.id? 'ring-1 ring-neutral-800':''}`}
        style={{ WebkitMaskImage: 'linear-gradient(#000,#000)' }}
      >
        <div className="relative z-10">
          <div className="text-sm font-semibold mb-1">{c.label}</div>
          <div className="text-xs text-neutral-500 mb-2">{c.tip}</div>
  <input name="quick-filter"
          type="range"
          min={0}
          max={100}
          value={val}
          disabled={disabled}
          onChange={(e) => { if(disabled) return; onChange({ ...model, [c.id]: Number(e.target.value) }); if(onSelectCategory) onSelectCategory(c.id); }}
          className={`w-full touch-none ${disabled? 'opacity-40 cursor-not-allowed' : ''}`}
          style={{ '--c': c.color, '--p': `${val}%`, accentColor: c.color }}
        />
        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-neutral-500">0</div>
          <div className="text-xs font-medium">{val}%</div>
          <div className="text-xs text-neutral-500">100</div>
        </div>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={()=>!disabled && startTest(c.id)}
            disabled={disabled}
            className="text-[11px] px-3 py-1.5 rounded-full border bg-white/90 hover:bg-white active:scale-[0.97] font-semibold shadow-sm relative disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              borderColor: c.color,
              boxShadow: `0 0 0 1px ${c.color} inset, 0 1px 2px rgba(0,0,0,0.15)`
            }}
          >
            Пройти тест
          </button>
        </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile carousel */}
      <div className="sm:hidden -mx-3 px-3">
        <div
          ref={mobileRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-none"
          style={{ WebkitOverflowScrolling:'touch' }}
        >
          {CATEGORIES.map(c=>renderCard(c,true))}
        </div>
      </div>
      {/* Desktop grid */}
      <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {CATEGORIES.map(c=>renderCard(c,false))}
      </div>
      {testCat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl relative">
            <div className="absolute top-2 right-2">
              <button onClick={()=>setTestCat(null)} className="w-7 h-7 flex items-center justify-center rounded-full border text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100">×</button>
            </div>
            {(() => { const cat = CATEGORIES.find(c=>c.id===testCat); if(!cat) return null; return (
              <div className="mb-3 flex items-center gap-2">
                <div className="w-5 h-5 rounded-full shadow" style={{ background: categoryGradient(cat.color) }} />
                <div className="text-xs font-semibold tracking-wide uppercase" style={{ color: darken(cat.color,25) }}>{cat.label}</div>
              </div>
            ); })()}
            <div className="text-[11px] font-medium mb-2 text-neutral-500">Оцените согласие от 1 до 10</div>
            <div className="text-sm font-semibold mb-5 min-h-[52px] leading-snug">{currentQuestion}</div>
            {(() => { const cat = CATEGORIES.find(c=>c.id===testCat); const col = cat?.color; const val = testAnswers[testIndex] ?? 5; return (
              <div className="mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-neutral-400">1</span>
                  <input name="quiz-range" type="range" min={1} max={10} value={val} onChange={(e)=>answer(Number(e.target.value))} className="flex-1 h-2" style={{ accentColor: col, background: `linear-gradient(90deg, ${lighten(col,35)} 0%, ${col} 100%)`, borderRadius: '9999px' }} />
                  <span className="text-[10px] text-neutral-400">10</span>
                </div>
                <div className="mt-2 text-center text-[11px] font-medium" style={{ color: darken(col||'#888',20) }}>Текущее значение: {val}</div>
              </div>
            ); })()}
            <div className="flex items-center justify-between text-[11px] text-neutral-500">
              <div>Вопрос {testIndex+1} / {testQuestions.length}</div>
              <button type="button" onClick={nextQuestion} disabled={testAnswers[testIndex] == null} className="px-4 py-2 rounded-2xl text-xs font-semibold shadow-sm active:scale-[0.97] disabled:opacity-40" style={{ background: categoryGradient(CATEGORIES.find(c=>c.id===testCat)?.color || '#ccc'), color: readableTextColor(CATEGORIES.find(c=>c.id===testCat)?.color || '#ccc'), boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                {testIndex < testQuestions.length-1 ? 'Далее' : 'Завершить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Suggestions({ items, onSend, onDelete, activeCategoryId, onAddManual, onGenerateAI, remainingAI }) {
  // items: [{id?, title, desc, weight?, source, packId?, categoryId?}]
  const list = items || [];
  const [stage, setStage] = useState('idle'); // idle | weight | mode | manual
  const [wChoice, setWChoice] = useState(10);
  const [mtitle, setMtitle] = useState('');
  const [mdesc, setMdesc] = useState('');
  function reset(){ setStage('idle'); setMtitle(''); setMdesc(''); }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Desktop create card */}
      <div className="hidden lg:flex rounded-2xl border border-dashed p-4 bg-white/60 backdrop-blur-sm shadow-sm flex-col justify-between min-h-[180px]">
        {stage==='idle' && (
          <button type="button" onClick={()=>setStage('weight')} className="flex-1 flex flex-col items-center justify-center gap-3 text-neutral-500 hover:text-neutral-800">
            <div className="relative">
              <div className="absolute -inset-1 rounded-3xl bg-[conic-gradient(at_50%_50%,#ff5f6d,#ffc371,#ffe66d,#8aff6d,#6dffe6,#6d8dff,#d86dff,#ff6dde,#ff5f6d)] animate-[spin_8s_linear_infinite] opacity-70 blur-[1px]"></div>
              {/* removed pulse layer */}
              <div className="relative w-14 h-14 rounded-2xl border-2 border-neutral-300 flex items-center justify-center text-3xl font-light bg-white/90">+</div>
            </div>
            <div className="text-sm font-medium">✨ Сгенерировать идею от ИИ</div>
          </button>
        )}
        {stage==='weight' && (
          <div className="flex-1 flex flex-col">
            <div className="text-xs font-semibold mb-2 text-neutral-500">Выберите вес</div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[1,5,10,15].map(w => (
                <button key={w} onClick={()=>{setWChoice(w); setStage('mode');}} className={`py-2 rounded-xl text-sm font-semibold border ${wChoice===w? 'bg-neutral-900 text-white':'bg-white hover:bg-neutral-100'}`}>+{w}</button>
              ))}
            </div>
            <button type="button" onClick={()=>reset()} className="mt-auto text-[11px] text-neutral-500 hover:text-neutral-700 self-start">Назад</button>
          </div>
        )}
        {stage==='mode' && (
          <div className="flex-1 flex flex-col">
            <div className="text-xs font-semibold mb-1 text-neutral-500">Вес: <span className="font-bold">+{wChoice}</span></div>
            <div className="text-[11px] text-neutral-500 mb-3">Осталось генераций: {remainingAI ?? '—'}</div>
            <div className="flex flex-col gap-2 mb-3">
              <div className="relative">
                <div className="absolute -inset-[2px] rounded-3xl bg-[conic-gradient(at_50%_50%,#ff5f6d,#ffc371,#ffe66d,#8aff6d,#6dffe6,#6d8dff,#d86dff,#ff6dde,#ff5f6d)] animate-[spin_8s_linear_infinite] opacity-70 blur-[1px]"></div>
                {/* removed pulse layer */}
                <button type="button" onClick={()=>{ onGenerateAI?.(wChoice); reset(); }} className="relative w-full px-4 py-3 rounded-2xl text-sm font-semibold bg-neutral-900 text-white active:scale-[0.98]">AI генерация</button>
              </div>
              <button type="button" onClick={()=>setStage('manual')} className="px-4 py-3 rounded-2xl text-sm font-semibold border bg-white hover:bg-neutral-100">Вручную</button>
            </div>
            <button type="button" onClick={()=>setStage('weight')} className="mt-auto text-[11px] text-neutral-500 hover:text-neutral-700 self-start">Назад</button>
          </div>
        )}
        {stage==='manual' && (
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-neutral-500"><span>Вес</span><span className="font-semibold">+{wChoice}</span></div>
            <input name="manual-title" value={mtitle} onChange={e=>setMtitle(e.target.value)} placeholder="Заголовок" className="border rounded-xl px-2 py-1.5 text-xs" />
            <textarea name="manual-desc" value={mdesc} onChange={e=>setMdesc(e.target.value)} placeholder="Описание" className="border rounded-xl px-2 py-1.5 text-[11px] resize-none h-20" />
            <div className="mt-auto flex gap-2 pt-1">
              <button disabled={!mtitle.trim()} onClick={()=>{ if(!mtitle.trim()) return; onAddManual?.(wChoice, mtitle.trim(), mdesc.trim()); reset(); }} className="flex-1 px-3 py-2 rounded-2xl text-xs font-semibold bg-neutral-900 text-white disabled:opacity-40">Добавить</button>
              <button type="button" onClick={()=>setStage('mode')} className="px-3 py-2 rounded-2xl text-xs font-semibold border bg-white">Назад</button>
            </div>
          </div>
        )}
      </div>
      {list.map((p, i) => (
  <div key={p.id || i} className="group rounded-2xl border p-3 pr-9 bg-white/80 shadow-sm flex flex-col justify-between relative">
          {(p.source === 'generated' || p.source === 'custom' || p.source === 'manual') && (
            <button
              type="button"
              onClick={() => onDelete?.(p)}
              className="absolute top-1.5 right-1.5 text-neutral-500 hover:text-red-600 text-base font-bold leading-none w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300"
              title="Удалить карточку"
              aria-label="Удалить карточку"
            >
              ×
            </button>
          )}
          <div>
            <div className="text-sm font-semibold mb-1 flex items-center gap-2">
              <span>{p.title}</span>
              {p.weight ? (() => { const catId = p.categoryId || activeCategoryId; const cat = CATEGORIES.find(c=>c.id===catId); if(!cat) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-white">+{p.weight}</span>; const txt = readableTextColor(cat.color); return (<span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: cat.color, color: txt, boxShadow:'0 0 0 1px rgba(0,0,0,0.15)' }}>+{p.weight}</span>); })() : null}
            </div>
            <div className="text-xs text-neutral-600 whitespace-pre-line">{p.desc}</div>
          </div>
          <button
            onClick={() => onSend(p)}
            className="mt-3 inline-flex items-center justify-center text-sm font-semibold rounded-2xl px-4 py-3 bg-neutral-900 text-white active:scale-[0.99] disabled:opacity-40"
          >
            Предложить партнёру
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
      if (st === 'failed') {
        attemptReconnect('ice-failed');
      } else if (st === 'connected') {
        if (dcRef.current?.readyState === 'open') setStatus('connected');
        if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      } else if (st === 'checking') {
        setStatus('connecting');
      } else if (st === 'disconnected') {
        // wait for heartbeat before declaring reconnect (avoid flapping)
        /* passive wait */
      } else {
        setStatus(st);
      }
    };
    pc.onconnectionstatechange = () => {
      const cs = pc.connectionState;
      if (cs === 'connected') {
        if (dcRef.current?.readyState === 'open') setStatus('connected');
      } else if (cs === 'failed') {
        attemptReconnect('pc-failed');
      }
    };
    pc.ondatachannel = (ev) => {
      dcRef.current = ev.channel;
      dcRef.current.onmessage = (e) => handleChannelMessage(e.data);
      dcRef.current.onopen = () => { heartbeatRef.current.last = Date.now(); setStatus('connected'); try { console.debug('[P2P] datachannel open (guest)'); } catch {}; };
      dcRef.current.onclose = () => { try { console.debug('[P2P] datachannel close (guest)'); } catch {}; attemptReconnect('dc-close'); };
    };
    setError("");
    return pc;
  }

  function attemptReconnect(reason) {
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
    dc.onopen = () => { heartbeatRef.current.last = Date.now(); setStatus('connected'); try { console.debug('[P2P] datachannel open (host)'); } catch {}; };
    dc.onclose = () => { try { console.debug('[P2P] datachannel close (host)'); } catch {}; attemptReconnect('dc-close'); };
      setStatus("connecting");
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForICE(pc);
  const sdpStr = JSON.stringify(pc.localDescription);
  setOfferText(sdpStr);
  return sdpStr; // IMPORTANT: return offer so callers don't race React state
    } catch (e) {
      setError(String(e?.message || e));
      setStatus("error");
  throw e;
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
  const sdpStr = JSON.stringify(pc.localDescription);
  setAnswerText(sdpStr);
      setStatus("connecting");
      setError("");
  return sdpStr;
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
        if (Date.now() - heartbeatRef.current.last > 35000) {
          attemptReconnect('heartbeat-timeout');
        }
      }, 8000);
      return () => clearInterval(int);
    }, []);

  return { status, offerText, answerText, setOfferText, setAnswerText, startHost, acceptAnswer, startJoiner, send, disconnect, error };
}

function waitForICE(pc, timeoutMs = 2500) { // early timeout speeds perceived generation
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const finish = () => { pc.removeEventListener("icegatheringstatechange", onState); resolve(); };
    const timer = setTimeout(finish, timeoutMs);
    const onState = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        finish();
      }
    };
    pc.addEventListener("icegatheringstatechange", onState);
  });
}

// ===== Firestore simplified session (2 words + suffix) =====
const WORDS_A = ["синий","алый","янтарный","серебряный","лунный","нежный","огненный","мятный","лазурный","шёлковый","бирюзовый","янтарный","фиолетовый","солнечный","ледяной","медовый"];
const WORDS_B = ["лев","лось","дракон","дельфин","павлин","ёж","кот","волк","орёл","феникс","тигр","кит","фламинго","ягуар","лисица","сова"];
function randomWord(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function randomSuffix(){ return Math.random().toString(36).slice(2,5); }
async function generateCode(maxTries=5){
  for (let i=0;i<maxTries;i++) {
    const code = `${randomWord(WORDS_A)}-${randomWord(WORDS_B)}-${randomSuffix()}`;
    const ref = doc(db,'p2pSessions', code);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { code, ref };
  }
  throw new Error('Не удалось сгенерировать код');
}

export function useFirestoreSession(){
  const [phase,setPhase]=useState('idle'); // idle|creating|waiting|answering|connected|error
  const [code,setCode]=useState('');
  const [remoteAnswer,setRemoteAnswer]=useState('');
  const [docData,setDocData]=useState(null); // full snapshot data
  const unsubRef = useRef(null);
  const docRefRef = useRef(null); // holds created/answered doc ref
  const isHostRef = useRef(false);
  const cleanupListener=()=>{ if(unsubRef.current){ unsubRef.current(); unsubRef.current=null; } };
  useEffect(()=>cleanupListener,[]);

  // Best-effort TTL cleanup (remove sessions older than 20m)
  async function cleanupOldSessions(){
    try {
      await ensureAnonAuth();
      const ttlMs = 20*60*1000;
      const oldest = new Date(Date.now()-ttlMs);
      const col = collection(db,'p2pSessions');
      let snaps;
      try {
        const qRef = query(col, where('createdAt','<', Timestamp.fromDate(oldest)));
        snaps = await getDocs(qRef);
      } catch {
        // fallback fetch all and filter client side if index not ready
        snaps = await getDocs(col);
      }
      const now = Date.now();
      const batch = [];
      snaps.forEach(s=>{
        const d=s.data();
        const createdAt = d?.createdAt?.toMillis ? d.createdAt.toMillis() : 0;
        if(createdAt && now-createdAt>ttlMs){ batch.push(s.ref); }
      });
      for (const r of batch.slice(0,25)) { try { await deleteDoc(r); } catch {} }
    } catch {}
  }

  async function create(offerSDP){
    try {
      await ensureAnonAuth();
      await cleanupOldSessions();
      isHostRef.current = true;
      setPhase('creating');
      const {code,ref}=await generateCode();
      docRefRef.current = ref;
  if(!offerSDP || offerSDP.length < 50) throw new Error('Пустой offer — повторите ещё раз');
  await setDoc(ref,{ offer:offerSDP, createdAt:serverTimestamp(), status:'waiting', offerStamp: Date.now() });
      setCode(code); setPhase('waiting');
      unsubRef.current = onSnapshot(ref,(snap)=>{
        const d=snap.data();
        setDocData(d||null);
        if (d?.answer && phase!=='connected') {
          setRemoteAnswer(d.answer); setPhase('connected');
          // (отключено) раньше мы удаляли документ сразу после подключения, что вызывало "Сессия не найдена" при повторных обращениях
          // оставляем документ до TTL очистки
        }
      });
      try { localStorage.setItem('labSessCode', code); localStorage.setItem('labSessRole','host'); } catch {}
      return code;
    } catch(e){ setPhase('error'); throw e; }
  }
  async function answer(code){
    try {
      await ensureAnonAuth();
      isHostRef.current = false;
      setCode(code); setPhase('answering');
      const ref = doc(db,'p2pSessions', code);
      docRefRef.current = ref;
      const snap = await getDoc(ref);
      if(!snap.exists()) throw new Error('Сессия не найдена');
      const data=snap.data();
      if(!data.offer) throw new Error('Нет offer');
      unsubRef.current = onSnapshot(ref,(s)=>{ const d=s.data(); setDocData(d||null); if(d?.answer){ setRemoteAnswer(d.answer); setPhase('connected'); } });
      try { localStorage.setItem('labSessCode', code); localStorage.setItem('labSessRole','guest'); } catch {}
      return data.offer; // возвращаем offer для установки remote
    } catch(e){ setPhase('error'); throw e; }
  }
  async function submitAnswer(code, answerSDP){
  if(!answerSDP || answerSDP.length < 50) throw new Error('Пустой/короткий answer');
  const ref = doc(db,'p2pSessions', code); await updateDoc(ref,{ answer:answerSDP, status:'answered' });
  // (отключено удаление) пусть документ живёт до TTL
  }
  // Re-offer (host resume after reload without new code)
  async function reoffer(existingCode, newOfferSDP){
    if(!existingCode || !newOfferSDP) throw new Error('reoffer: нет кода или offer');
    await ensureAnonAuth();
    const ref = doc(db,'p2pSessions', existingCode);
    const snap = await getDoc(ref);
    if(!snap.exists()) throw new Error('Сессия не найдена');
    docRefRef.current = ref; isHostRef.current = true;
    setCode(existingCode);
    setPhase('waiting');
    // overwrite offer & reset answer for renegotiation
    await updateDoc(ref,{ offer: newOfferSDP, answer: null, status:'waiting', offerStamp: Date.now() });
    // snapshot listener (replace old)
    cleanupListener();
    unsubRef.current = onSnapshot(ref,(s)=>{ const d=s.data(); setDocData(d||null); if(d?.answer && phase!=='connected'){ setRemoteAnswer(d.answer); setPhase('connected'); } });
    try { localStorage.setItem('labSessCode', existingCode); localStorage.setItem('labSessRole','host'); } catch {}
  }
  // Passive state push (mirror last known A/B for offline snapshot viewing)
  async function pushMirror(partial){
    try { if(!docRefRef.current) return; await updateDoc(docRefRef.current, { ...partial, lastMirrorAt: serverTimestamp() }); } catch {}
  }
  function dispose(){ cleanupListener(); setPhase('idle'); setCode(''); setRemoteAnswer(''); isHostRef.current=false; docRefRef.current=null; }
  async function cancel(){
    try {
      if(isHostRef.current && docRefRef.current){
        await deleteDoc(docRefRef.current).catch(()=>{});
      }
    } catch {}
    dispose();
    try { localStorage.removeItem('labSessCode'); localStorage.removeItem('labSessRole'); } catch {}
  }
  return { phase, code, remoteAnswer, create, answer, submitAnswer, dispose, cancel, cleanupOldSessions, reoffer, pushMirror, docData };
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
  // Fixed single-user perspective (Игрок A) — переключение экрана/роли удалено
  const player = 'A';
  const myRole = 'A';
  // Which set of tubes we are currently viewing/editing: 'mine' | 'partner'
  const [tubeView, setTubeView] = useState('mine'); // 'avg' added to options
  const [A, setA] = useState({ ...defaultScale });
  const [B, setB] = useState({ ...defaultScale });
  // Removed legacy lock feature (was {locked} state controlling editability)

  // inboxes
  const [inboxA, setInboxA] = useState([]);
  const [inboxB, setInboxB] = useState([]);

  // generator settings
  const [categoryForHints, setCategoryForHints] = useState("trust");
  const [impact, setImpact] = useState(10); // +1/+5/+10/+15
  const [manual, setManual] = useState([]); // manually created suggestions
  // Mobile creation wizard state (desktop handled inside Suggestions component)
  const [mobileStage, setMobileStage] = useState('idle'); // idle | weight | mode | manual
  const [mobileWeight, setMobileWeight] = useState(10);
  const [mobileTitle, setMobileTitle] = useState('');
  const [mobileDesc, setMobileDesc] = useState('');
  const [showMobileWizard, setShowMobileWizard] = useState(false);
  function resetMobile(){ setMobileStage('idle'); setMobileTitle(''); setMobileDesc(''); setShowMobileWizard(false); }
  // stats
  const [history, setHistory] = useState([]); // {id, week, categoryId, delta, from}

  // (history state moved above – keep comment anchor)

  // packs removed

  // generated suggestions (per category)
  const [gen, setGen] = useState([]); // [{id,title,desc,weight,categoryId}]
  const [remainingAI, setRemainingAI] = useState(null); // {trust: n,...}

  // Nicknames (двухсловные идентификаторы для отображения имени партнёра вместо статуса)
  const [myNick, setMyNick] = useState('');
  const [partnerNick, setPartnerNick] = useState('');
  const sentNickRef = useRef(false);
  // Generate or load persistent nickname
  useEffect(()=>{
    try {
      let existing = localStorage.getItem('labNick');
      if(!existing){
        // reuse WORDS_A / WORDS_B
        const color = WORDS_A[Math.floor(Math.random()*WORDS_A.length)];
        const animal = WORDS_B[Math.floor(Math.random()*WORDS_B.length)];
        existing = `${color} ${animal}`;
        localStorage.setItem('labNick', existing);
      }
      setMyNick(existing);
    } catch { /* ignore */ }
  },[]);

  // toasts
  const [toasts, setToasts] = useState([]);
  const [showConnectHint, setShowConnectHint] = useState(false); // highlight instructions inside sync modal when user attempts partner action offline
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
  // Derived tubes based on tubeView toggle
  const avgObject = useMemo(() => {
    const o = {}; for(const c of CATEGORIES) o[c.id] = Math.round((A[c.id] + B[c.id]) / 2); return o;
  }, [A,B]);
  const tubesModel = tubeView === 'mine' ? me : (tubeView === 'partner' ? partner : avgObject); // partner & avg read-only
  const setTubesModel = tubeView === 'mine' ? setMe : (()=>{});
  const tubesPartner = tubeView === 'mine' ? partner : me; // for displaying partner overlay when viewing own tubes, and vice versa
  const myInbox = player === "A" ? inboxA : inboxB;
  const setMyInbox = player === "A" ? setInboxA : setInboxB;
  const partnerInbox = player === "A" ? inboxB : inboxA;
  const setPartnerInbox = player === "A" ? setInboxB : setInboxA;

  const canEdit = true; // lock feature removed – always editable

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
  try { console.debug('[P2P][in] state', { fromNick: partnerNick || 'remote', keys: Object.keys(msg.payload||{}), sample: msg.payload?.B }); } catch {}
        // Новая семантика: не перезаписываем свои A значениями партнёра.
        applyingRemoteRef.current = true;
        const s = msg.payload || {};
        // Подхватываем ник, если он пришёл внутри state (redundant channel для надёжности)
        if (s.nick && !partnerNick && typeof s.nick === 'string') {
          try { console.debug('[P2P][in] state.nick', s.nick); } catch {}
          setPartnerNick(s.nick);
        }
        if (s.B && typeof s.B === 'object') setB(s.B);
        if (Array.isArray(s.inboxA)) setInboxA(s.inboxA);
        if (Array.isArray(s.inboxB)) setInboxB(s.inboxB);
        setHistory(s.history || []);
        setGen(s.gen || []);
        setTimeout(() => (applyingRemoteRef.current = false), 50);
      } else if (msg.type === "card") {
  try { console.debug('[P2P][in] card', msg.payload?.title); } catch {}
        const item = msg.payload;
        if (item.to === "A") setInboxA((l) => [item, ...l]);
        else setInboxB((l) => [item, ...l]);
        notify("Получена карточка", { msg: item.title });
      } else if (msg.type === "accept") {
  try { console.debug('[P2P][in] accept', msg.payload?.id); } catch {}
        const { id, categoryId, weight } = msg.payload;
        setA((s) => applyImpact(s, categoryId, weight));
        setB((s) => applyImpact(s, categoryId, weight));
        setInboxA((l) => l.filter((x) => x.id !== id));
        setInboxB((l) => l.filter((x) => x.id !== id));
        setHistory((h) => [...h, { id: uid(), week: getWeek(), categoryId, delta: weight, from: msg.from }]);
        notify("Партнёр принял карточку", { type: "success" });
      } else if (msg.type === "decline") {
  try { console.debug('[P2P][in] decline', msg.payload?.id); } catch {}
        const { id } = msg.payload;
        setInboxA((l) => l.filter((x) => x.id !== id));
        setInboxB((l) => l.filter((x) => x.id !== id));
        notify("Карточка отклонена", { type: "warn" });
      } else if (msg.type === 'nick') {
  try { console.debug('[P2P][in] nick', msg.payload); } catch {}
        if (typeof msg.payload === 'string' && !partnerNick) setPartnerNick(msg.payload);
      }
    } catch {}
  });
  // canViewPartner moved below fireSess declaration to avoid TDZ ReferenceError

  // ====== Debounced P2P state sync (skip if unchanged) ======
  const lastSentRef = useRef("");
  useEffect(() => {
    if (applyingRemoteRef.current) return;
  const payload = { B: A, inboxA, inboxB, history, gen, nick: myNick || undefined }; // добавили nick для надёжной доставки
    const json = JSON.stringify(payload);
    if (json === lastSentRef.current) return; // unchanged
    const t = setTimeout(() => {
      lastSentRef.current = json;
  try { console.debug('[P2P][out] state', { mineChanged: true, sample: payload.B }); } catch {}
      sync.send({ type: "state", payload });
    }, 150); // debounce
    return () => clearTimeout(t);
  }, [A, B, inboxA, inboxB, history, gen, myNick]);

  // Send nickname once connected
  useEffect(()=>{
    if(sync.status === 'connected' && myNick && !sentNickRef.current){
      sentNickRef.current = true;
      try { console.debug('[P2P][out] nick', myNick); } catch {}
      sync.send({ type:'nick', payload: myNick });
      // If partner already sent theirs earlier in race, keep it; else wait for handler
      // отправим сразу актуальное состояние после установления канала
      try {
  const initPayload = { B: A, inboxA, inboxB, history, gen, nick: myNick || undefined };
        try { console.debug('[P2P][out] init-state', { sample: initPayload.B }); } catch {}
        sync.send({ type:'state', payload: initPayload });
      } catch {}
    }
    if(sync.status !== 'connected'){
      sentNickRef.current = false; // allow resend after reconnection
    }
  },[sync.status, myNick]);

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
  // if (obj.locked) ignored – lock removed
        if (obj.inboxA) setInboxA(obj.inboxA);
        if (obj.inboxB) setInboxB(obj.inboxB);
        if (Array.isArray(obj.history)) setHistory(obj.history);
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
  const state = { A, B, inboxA, inboxB, history, gen, __v: STORAGE_VERSION }; // locked removed
    const json = JSON.stringify(state);
    if (json === lastSavedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = json;
      try { localStorage.setItem(STORAGE_KEY, json); } catch {}
    }, 250);
    return () => clearTimeout(saveTimerRef.current);
  }, [A, B, inboxA, inboxB, history, gen]);

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
      notify("Нужно подключить партнера!", { type: "warn", msg: "Откройте окно синхронизации для инструкций." });
      setShowSync(true); setShowConnectHint(true);
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

  // Packs feature removed
  // All packs logic fully removed; no custom packs.

  // Random suggestion → add to "cards & hints" list (not auto‑send)
  // Prevent immediate duplicates per category
  const lastGeneratedRef = useRef({});
  const addRandomSuggestion = useCallback(async (overrideWeight) => {
    let card; let usedAI = false;
    try {
      const resp = await fetch('/api/generate-card?ts=' + Date.now(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: categoryForHints, weight: overrideWeight ?? impact })
      });
      if (resp.status === 429) {
        const data = await resp.json().catch(()=>({}));
        // Локальный дневной лимит: просто сообщаем и выходим
        if (data?.error === 'limit') {
          notify('Лимит на сегодня', { type: 'warn', msg: data?.msg || '10 в день' });
          try { const r = await fetch('/api/generate-card'); if(r.ok){ const j = await r.json(); setRemainingAI(j.remaining); } } catch {}
          return;
        }
        // Upstream OpenAI 429 — не тратим локальную квоту, делаем локальный fallback
        if (data?.error === 'upstream-429' || data?.error === 'OpenAI rate limit') {
          let tries = 0; let local;
          do {
            local = generateCard(categoryForHints, (overrideWeight ?? impact) + (tries>1?1:0));
            tries++;
          } while (lastGeneratedRef.current[categoryForHints] === local.title && tries < 4);
          const fallbackCard = local;
          lastGeneratedRef.current[categoryForHints] = fallbackCard.title;
          setGen((g) => [{ id: uid(), ...fallbackCard, categoryId: categoryForHints }, ...g]);
          notify('AI перегружен — локальная идея', { type: 'warn', msg: data?.msg || 'повторите позже' });
          notify('Сгенерирована карточка', { type: 'success', msg: fallbackCard.title });
          return;
        }
        // Непонятный 429 — обрабатываем как upstream и делаем fallback через catch
        throw new Error('OpenAI 429');
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
        local = generateCard(categoryForHints, (overrideWeight ?? impact) + (tries>1?1:0));
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
    const generated = gen.filter((x) => x.categoryId === categoryForHints).map(g => ({ ...g, source: 'generated' }));
    const manualCards = manual.filter(m => m.categoryId === categoryForHints).map(m => ({ ...m, source: 'manual' }));
    // Order: manual, generated, built-in. Deduplicate by title+desc.
    const ordered = [...manualCards, ...generated, ...builtIn];
    const seen = new Set();
    return ordered.filter(c => {
      const key = (c.title + '\n' + (c.desc||'')).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [categoryForHints, gen, manual]);

  const handleDeleteSuggestion = useCallback((item) => {
    if (item.source === 'generated') {
      setGen(g => g.filter(x => x.id !== item.id));
      notify('Удалена AI карточка', { type: 'warn', msg: item.title });
    } else if (item.source === 'manual') {
      setManual(m => m.filter(x => x.id !== item.id));
      notify('Удалена созданная карточка', { type: 'warn', msg: item.title });
    }
  }, [setGen, setManual]);

  // ====== Derived Statistics (overall + per category) ======
  // history entries: { id, week, categoryId, delta, from }
  const { overallStats, categoryStats } = useMemo(() => {
    const emptyPair = () => ({ A:{ sent:0, accepted:0, totalWeight:0 }, B:{ sent:0, accepted:0, totalWeight:0 } });
    const overall = emptyPair();
    const perCat = Object.fromEntries(CATEGORIES.map(c => [c.id, emptyPair()]));
    // Pending (inboxes) contribute to 'sent' only
    function addPending(arr){
      arr.forEach(c => {
        if(!c || !c.from) return;
        const bucketOverall = overall[c.from];
        bucketOverall.sent++;
        if (c.categoryId && perCat[c.categoryId]) {
          perCat[c.categoryId][c.from].sent++;
        }
      });
    }
    addPending(inboxA); addPending(inboxB);
    // Accepted history contributes to sent + accepted + weight
    history.forEach(h => {
      const from = h.from; if(!from) return;
      overall[from].sent++; overall[from].accepted++; overall[from].totalWeight += h.delta || 0;
      if (h.categoryId && perCat[h.categoryId]) {
        perCat[h.categoryId][from].sent++; perCat[h.categoryId][from].accepted++; perCat[h.categoryId][from].totalWeight += h.delta || 0;
      }
    });
    return { overallStats: overall, categoryStats: perCat };
  }, [inboxA, inboxB, history]);

  // Current filter: '_all' for overall, else category id
  const [statsFilter, setStatsFilter] = useState('_all');
  const currentStats = statsFilter === '_all' ? overallStats : categoryStats[statsFilter] || overallStats;

  function StatBar({ label, a, b }){
    const total = (a+b)||1;
    const pa = Math.round((a/total)*100);
    const pb = 100-pa;
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-neutral-500"><span>{label}</span><span>{a} vs {b}</span></div>
        <div className="h-4 w-full rounded-full bg-neutral-200 overflow-hidden flex text-[10px] font-semibold">
          <div className="h-full bg-neutral-900 text-white flex items-center justify-center" style={{ width: pa+'%' }}>{pa>12? 'A '+pa+'%': ''}</div>
          <div className="h-full bg-neutral-500/60 text-white flex items-center justify-center" style={{ width: pb+'%' }}>{pb>12? 'B '+pb+'%': ''}</div>
        </div>
      </div>
    );
  }

  // ====== UI ======
  const [showSync, setShowSync] = useState(false);
  // Firestore simplified signaling session hook
  const fireSess = useFirestoreSession();
  const resumeTriedRef = useRef(false);
  // Возможность просматривать партнёра даже если канал упал, но Firestore показал подключение (snapshot сохранён)
  const canViewPartner = (sync.status === 'connected') || (fireSess?.phase === 'connected');
  const [fsError,setFsError]=useState('');
  const [regenerating,setRegenerating]=useState(false);
  const [inviteUrl,setInviteUrl]=useState('');

  // Helpers for new flow
  async function hostCreateLink(){
    try {
      setFsError('');
      // create WebRTC offer first (reuse existing startHost logic partially without UI textareas)
  const offer = await sync.startHost(); // get fresh SDP directly
  const code = await fireSess.create(offer);
      const url = `${window.location.origin}?c=${encodeURIComponent(code)}`;
      let copied=false;
      try { await navigator.clipboard.writeText(url); copied=true; } catch {}
      if (navigator.share) {
  try { await navigator.share({ title:'LoveLab', text:'Давай наладим химию в наших отношениях в LoveLab при помощи ИИ', url }); } catch {}
      }
      notify('Ссылка создана', { type:'success', msg: copied? 'Скопирована в буфер' : code });
      setInviteUrl(url);
    } catch(e){ setFsError(String(e?.message||e)); }
  }
  async function hostRegenerateLink(){
    try {
      setRegenerating(true); setFsError('');
      await fireSess.cancel?.();
      const offer = await sync.startHost();
      const code = await fireSess.create(offer);
      const url = `${window.location.origin}?c=${encodeURIComponent(code)}`;
      setInviteUrl(url);
      try { await navigator.clipboard.writeText(url); notify('Новая ссылка',{ type:'success', msg:'Скопирована'}); } catch { notify('Новая ссылка',{ type:'success', msg: code }); }
    } catch(e){ setFsError(String(e?.message||e)); }
    finally { setRegenerating(false); }
  }
  async function guestJoinByCode(inputCode){
    try {
      setFsError('');
      const offer = await fireSess.answer(inputCode.trim());
      // we now have offer; build pc & create answer
  const answerSDP = await sync.startJoiner(offer);
  await fireSess.submitAnswer(inputCode.trim(), answerSDP);
    } catch(e){ setFsError(String(e?.message||e)); }
  }
  // When remote answer appears for host, set it into acceptAnswer
  useEffect(()=>{ if(fireSess.remoteAnswer && sync.status!=='connected'){ sync.acceptAnswer(fireSess.remoteAnswer); } },[fireSess.remoteAnswer]);
  // Auto detect code in URL on load
  useEffect(()=>{
    const p=new URLSearchParams(window.location.search); const c=p.get('c');
    if(c && fireSess.phase==='idle') { setShowSync(true); guestJoinByCode(c); }
  },[fireSess.phase]);

  // Run TTL cleanup once on mount (best-effort)
  useEffect(()=>{ fireSess.cleanupOldSessions?.(); },[]);

  // ===== Session auto-resume (host or guest) =====
  useEffect(() => {
    if (resumeTriedRef.current) return;
    if (fireSess.phase !== 'idle') return; // only attempt once while idle
    try {
      const savedCode = localStorage.getItem('labSessCode');
      const savedRole = localStorage.getItem('labSessRole');
      if (!savedCode || !savedRole) return;
      resumeTriedRef.current = true;
      if (savedRole === 'host') {
        // Recreate offer & reoffer
        (async () => {
          try {
            const newOffer = await sync.startHost();
            await fireSess.reoffer(savedCode, newOffer);
            notify('Соединение восстанавливается', { type: 'warn', msg: 'Новый offer отправлен' });
          } catch (e) {
            notify('Не удалось восстановить', { type: 'error', msg: String(e.message||e) });
          }
        })();
      } else if (savedRole === 'guest') {
        (async () => {
          try {
            const offer = await fireSess.answer(savedCode);
            const ans = await sync.startJoiner(offer);
            await fireSess.submitAnswer(savedCode, ans);
            notify('Переподключение гостя', { type: 'warn', msg: 'Ответ отправлен' });
          } catch (e) {
            notify('Не удалось переподключиться', { type: 'error', msg: String(e.message||e) });
          }
        })();
      }
    } catch {}
  }, [fireSess.phase]);

  // ===== Mirror my state to Firestore for offline recovery =====
  useEffect(() => {
    // Only mirror if we have an active session code (waiting or connected)
    if (!fireSess.code) return;
    const role = (()=>{ try { return localStorage.getItem('labSessRole'); } catch { return null; } })();
    // host mirrors as stateA, guest as stateB
    const payload = { A }; // local perspective always A for now
    const toPush = role === 'host' ? { stateA: A, nickA: myNick || undefined } : { stateB: A, nickB: myNick || undefined };
  // (Removed erroneous useRef here; was causing invalid hook call in production bundle)
    const t = setTimeout(()=>{ fireSess.pushMirror?.(toPush); }, 800); // debounce sync
    return () => clearTimeout(t);
  }, [A, fireSess.code, myNick]);

  // ===== Seed partner snapshot from mirrored Firestore data if available (before WebRTC) =====
  useEffect(() => {
    if (sync.status === 'connected') return; // real-time channel supersedes mirror
    if (!fireSess.docData) return;
    try {
      const role = localStorage.getItem('labSessRole');
      if (role === 'host') {
        if (fireSess.docData.stateB && Object.keys(fireSess.docData.stateB).length === 5) {
          setB(prev => prev === fireSess.docData.stateB ? prev : fireSess.docData.stateB);
          if (!partnerNick && fireSess.docData.nickB) setPartnerNick(fireSess.docData.nickB);
        }
      } else if (role === 'guest') {
        if (fireSess.docData.stateA && Object.keys(fireSess.docData.stateA).length === 5) {
          setB(prev => prev === fireSess.docData.stateA ? prev : fireSess.docData.stateA); // partner into B
          if (!partnerNick && fireSess.docData.nickA) setPartnerNick(fireSess.docData.nickA);
        }
      }
    } catch {}
  }, [fireSess.docData, sync.status]);

  return (
    <div className="min-h-screen w-full bg-neutral-50 text-neutral-900 pb-24 lg:pb-10">
      <Toasts toasts={toasts} onClose={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      <div className="mx-auto p-3 sm:p-6 md:p-8 max-w-6xl">
        {/* Header */}
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">🧪✨ LoveLab</h1>
            <p className="text-neutral-500 text-xs sm:text-sm">Восстановите химию ваших отношений!</p>
          </div>
          <div className="hidden lg:flex items-center gap-3 flex-wrap">
            <button onClick={() => setShowSync(true)} className="px-4 py-2 rounded-2xl text-sm font-semibold bg-neutral-900 text-white">
              Пригласить партнера
            </button>
            <span className={`text-xs px-2 py-1 rounded-full border ${sync.status === "connected" ? "bg-green-50 border-green-200 text-green-700" : "bg-white"}`} title={sync.status === 'connected' ? (partnerNick || 'ожидание ника партнёра…') : 'Статус соединения'}>
              {sync.status === 'connected' ? (partnerNick || '...') : sync.status}
            </span>
          </div>
        </header>

  {/* Stats Block moved below inbox */}

  {/* Average section removed (was id="avg") since interactive tubes below replace it */}

        {/* My setup */}
        <section className="mb-8" id="base">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-base sm:text-lg font-semibold">Текущий баланс:</h2>
              <div className="flex bg-white/80 rounded-2xl p-1 border">
                <button
                  type="button"
                  onClick={() => setTubeView('mine')}
                  className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition ${tubeView==='mine' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200/60'}`}
                >Мои колбы</button>
                <button
                  type="button"
                  onClick={() => { if(!canViewPartner){ setShowSync(true); setShowConnectHint(true); notify("Нужно подключить партнера!", { type:'warn', msg:'Следуйте инструкции в открывшемся окне.' }); return; } setTubeView('partner'); }}
                  className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition ${tubeView==='partner' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200/60'} ${!canViewPartner ? 'opacity-60' : ''}`}
                >Колбы партнёра</button>
                <button
                  type="button"
                  onClick={() => { if(!canViewPartner){ setShowSync(true); setShowConnectHint(true); notify("Нужно подключить партнера!", { type:'warn', msg:'Следуйте инструкции в открывшемся окне.' }); return; } setTubeView('avg'); }}
                  className={`px-3 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition ${tubeView==='avg' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200/60'} ${!canViewPartner ? 'opacity-60' : ''}`}
                >Общий баланс</button>
              </div>
            </div>
            {/* (Lock feature removed) */}
          </div>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-neutral-500">Задай значения по колбам/бегункам как чувствуешь, либо пройди тесты!</div>
            </div>
            <EditableTubes
              model={tubesModel}
              partner={tubesPartner}
              avg={avg}
              onChange={(v)=> { if(tubeView!=='mine') return; setTubesModel(v); }}
              disabled={tubeView==='partner'}
              onSelectCategory={(id)=> setCategoryForHints(id)}
              selectedCategory={categoryForHints}
            />
          </div>
          <SliderRow
            model={tubesModel}
            onChange={(v) => { if(tubeView!=='mine') return; setTubesModel(v); }}
            onSelectCategory={(id)=> setCategoryForHints(id)}
            disabled={tubeView!=='mine'}
            selectedCategory={categoryForHints}
          />
        </section>


        {/* Suggestions + weight */}
        <section className="mb-8" id="cards">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">Ваши задания для: {(() => { const cat = CATEGORIES.find(c=>c.id===categoryForHints); if(!cat) return null; const txt = readableTextColor(cat.color); return (<span className="text-sm px-3 py-1.5 rounded-full font-medium shadow-sm" style={{ background: categoryGradient(cat.color), color: txt, boxShadow: '0 1px 2px rgba(0,0,0,0.2), inset 0 0 0 1px rgba(255,255,255,0.25)' }}>{cat.label}</span>); })()}</h2>
            {/* Mobile creation wizard removed per request; no controls here now */}
          </div>
          {/* Mobile wizard occupies inline area above list when active (no separate panel) */}
          <Suggestions
            items={suggestionsForUI}
            onSend={handleSendSuggestion}
            onDelete={handleDeleteSuggestion}
            activeCategoryId={categoryForHints}
            onAddManual={(weight,title,desc)=>{
              const card = { id: uid(), title, desc, weight, categoryId: categoryForHints, source:'manual' };
              setManual(m=>[card,...m]);
              notify('Добавлена карточка', { type:'success', msg: card.title });
            }}
            onGenerateAI={(weight)=>{ addRandomSuggestion(weight); }}
            remainingAI={remainingAI ? remainingAI[categoryForHints] : undefined}
          />
        </section>

        {/* Contribution Stats (moved below cards) */}
        <section className="mb-10" id="contrib-stats">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h2 className="text-base sm:text-lg font-semibold">Ваша статистика</h2>
            <div className="flex gap-1 bg-white/80 rounded-2xl p-1 border">
              <button onClick={()=>setStatsFilter('_all')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${statsFilter==='_all'?'bg-neutral-900 text-white':'text-neutral-700 hover:bg-neutral-200/60'}`}>Общее</button>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={()=>setStatsFilter(c.id)} className={`px-2 py-1.5 rounded-xl text-xs font-semibold transition flex items-center justify-center ${statsFilter===c.id?'bg-neutral-900 text-white':'text-neutral-700 hover:bg-neutral-200/60'}`} title={c.label} aria-label={c.label}>
                  <CategoryIcon id={c.id} color={statsFilter===c.id? '#fff' : c.color} />
                </button>
              ))}
            </div>
            <div className="text-xs text-neutral-500">A = вы, B = партнёр</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-4 rounded-2xl border bg-white/70 backdrop-blur shadow-sm flex flex-col justify-between">
              <StatBar label="Отправлено идей" a={currentStats.A.sent} b={currentStats.B.sent} />
            </div>
            <div className="p-4 rounded-2xl border bg-white/70 backdrop-blur shadow-sm flex flex-col justify-between">
              <StatBar label="Принято идей" a={currentStats.A.accepted} b={currentStats.B.accepted} />
            </div>
            <div className="p-4 rounded-2xl border bg-white/70 backdrop-blur shadow-sm flex flex-col justify-between">
              <StatBar label="Суммарный вес" a={currentStats.A.totalWeight} b={currentStats.B.totalWeight} />
            </div>
          </div>
        </section>

        {/* Inbox */}
        <section className="mb-8" id="inbox">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-semibold">Входящие предложения</h2>
            <div className="text-xs text-neutral-500 hidden sm:block">Примите предложенные идеи — чтобы пополнить колбу у обоих (по весу карточки)</div>
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
                    {item.weight ? (() => { const cat = CATEGORIES.find(c=>c.id===item.categoryId); if(!cat) return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-900 text-white">+{item.weight}</span>; const txt = readableTextColor(cat.color); return (<span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: cat.color, color: txt, boxShadow:'0 0 0 1px rgba(0,0,0,0.15)' }}>+{item.weight}</span>); })() : null}
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

  {/* Old weekly stats removed in favor of new contribution stats above */}

        {/* Packs Editor */}
  {/* Packs editor removed */}

  {/* Footer hints removed per request */}
      </div>

    {/* Mobile bottom action bar (status left / AI center / category icon right) */}
    <div className="fixed inset-x-0 bottom-0 lg:hidden border-t bg-white/95 backdrop-blur p-2 sm:p-3 grid items-center gap-2 grid-cols-[auto_1fr_auto]">
        {/* Connection status button */}
        <button
          type="button"
          onClick={() => { setShowSync(true); if (sync.status !== 'connected') setShowConnectHint(true); }}
      className="justify-self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border bg-white text-[10px] font-semibold active:scale-[0.97] whitespace-nowrap"
          aria-label={sync.status === 'connected' ? 'Подключено' : 'Не подключено'}
        >
          <span className={`w-2 h-2 rounded-full shadow-inner ${sync.status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-neutral-300'}`}></span>
          <span>{sync.status === 'connected' ? 'ON' : 'OFF'}</span>
        </button>
        {/* Center AI button */}
        <button
          type="button"
          onClick={() => { setShowMobileWizard(true); setMobileStage('weight'); }}
          className="relative justify-self-center px-5 py-2.5 max-[380px]:px-3 rounded-3xl text-[12px] font-semibold bg-neutral-900 text-white flex items-center gap-1 shadow-lg active:scale-[0.95] whitespace-nowrap leading-tight overflow-hidden"
          aria-label="Создать задание"
        >
          {/* Standardized spinning conic outline (desktop style) */}
          <span className="absolute -inset-1 rounded-3xl bg-[conic-gradient(at_50%_50%,#ff5f6d,#ffc371,#ffe66d,#8aff6d,#6dffe6,#6d8dff,#d86dff,#ff6dde,#ff5f6d)] animate-[spin_8s_linear_infinite] opacity-70 blur-[1px]"></span>
          {/* Base background */}
          <span className="absolute inset-0 rounded-3xl bg-neutral-900"></span>
          {/* Soft internal highlight */}
          <span className="absolute inset-0 rounded-3xl bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.18),transparent_65%)]"></span>
          <span className="relative flex items-center gap-1">
            <span className="animate-bounce">✨</span>
            <span>Создать задание</span>
          </span>
        </button>
        {/* Current category icon (right) */}
        <div className="justify-self-end flex items-center">
          {(() => {
            const cat = CATEGORIES.find(c => c.id === categoryForHints);
            if (!cat) return null;
            return (
        <div className="w-12 h-12 max-[380px]:w-11 max-[380px]:h-11 rounded-2xl border bg-white/80 shadow-sm flex items-center justify-center">
                <CategoryIcon id={cat.id} color={cat.color} size={30} stroke={2.4} />
              </div>
            );
          })()}
        </div>
      </div>

      {showMobileWizard && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-5 shadow-xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Создание задания</div>
              <button type="button" onClick={resetMobile} className="px-3 py-1.5 rounded-2xl text-xs font-semibold border">Закрыть</button>
            </div>
            {mobileStage==='weight' && (
              <div>
                <div className="text-xs font-semibold mb-2 text-neutral-500">Выберите вес</div>
                <div className="grid grid-cols-4 gap-2">
                  {[1,5,10,15].map(w => (
                    <button key={w} onClick={()=>{ setMobileWeight(w); setMobileStage('mode'); }} className={`py-2 rounded-xl text-sm font-semibold border ${mobileWeight===w? 'bg-neutral-900 text-white':'bg-white hover:bg-neutral-100'}`}>+{w}</button>
                  ))}
                </div>
              </div>
            )}
            {mobileStage==='mode' && (
              <div className="flex flex-col gap-3">
                <div className="text-xs font-semibold text-neutral-500">Вес: <span className="font-bold">+{mobileWeight}</span></div>
                <div className="text-[11px] text-neutral-500">Осталось генераций: {remainingAI? remainingAI[categoryForHints] : '—'}</div>
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <span className="absolute -inset-[2px] rounded-3xl bg-[conic-gradient(at_50%_50%,#ff5f6d,#ffc371,#ffe66d,#8aff6d,#6dffe6,#6d8dff,#d86dff,#ff6dde,#ff5f6d)] opacity-50 animate-[pulse_3s_ease-in-out_infinite] blur-[2px]"></span>
                    <button type="button" onClick={()=>{ addRandomSuggestion(mobileWeight); resetMobile(); }} disabled={remainingAI && remainingAI[categoryForHints]===0} className="relative w-full px-4 py-3 rounded-2xl text-sm font-semibold bg-neutral-900 text-white disabled:opacity-40">AI генерация</button>
                  </div>
                  <button type="button" onClick={()=>setMobileStage('manual')} className="px-4 py-3 rounded-2xl text-sm font-semibold border bg-white hover:bg-neutral-100">Вручную</button>
                </div>
              </div>
            )}
            {mobileStage==='manual' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs text-neutral-500"><span>Вес</span><span className="font-semibold">+{mobileWeight}</span></div>
                <input name="mobile-title" value={mobileTitle} onChange={e=>setMobileTitle(e.target.value)} placeholder="Заголовок" className="border rounded-xl px-3 py-2 text-sm" />
                <textarea name="mobile-desc" value={mobileDesc} onChange={e=>setMobileDesc(e.target.value)} placeholder="Описание" className="border rounded-xl px-3 py-2 text-xs resize-none h-24" />
                <div className="flex gap-2">
                  <button disabled={!mobileTitle.trim()} onClick={()=>{ if(!mobileTitle.trim()) return; const card = { id: uid(), title: mobileTitle.trim(), desc: mobileDesc.trim(), weight: mobileWeight, categoryId: categoryForHints, source:'manual' }; setManual(m=>[card,...m]); notify('Добавлена карточка',{ type:'success', msg: card.title }); resetMobile(); }} className="flex-1 px-4 py-2 rounded-2xl text-sm font-semibold bg-neutral-900 text-white disabled:opacity-40">Добавить</button>
                  <button type="button" onClick={()=>setMobileStage('mode')} className="px-4 py-2 rounded-2xl text-sm font-semibold border bg-white">Назад</button>
                </div>
              </div>
            )}
            {mobileStage!=='weight' && mobileStage!=='idle' && (
              <button type="button" onClick={()=>setMobileStage('weight')} className="text-[11px] text-neutral-500 self-start">← Назад к выбору веса</button>
            )}
          </div>
        </div>
      )}

      {/* Sync modal (Firestore simplified) */}
      {showSync && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="w-full max-w-sm sm:max-w-md bg-white rounded-2xl p-4 sm:p-5 shadow-xl max-h-[90vh] overflow-y-auto overscroll-contain relative">
            <div className="sticky top-0 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-4 sm:pt-5 pb-3 bg-white rounded-t-2xl flex items-center justify-between z-10 border-b">
              <div className="text-base sm:text-lg font-semibold">Пригласить партнера</div>
              <button onClick={() => setShowSync(false)} className="text-xs sm:text-sm px-3 py-2 rounded-2xl border">Закрыть</button>
            </div>
            {/* (Удалено по запросу: описание автоматической синхронизации) */}
            {fireSess.phase==='idle' && (
              <div className="space-y-3">
                <button onClick={hostCreateLink} className="w-full px-4 py-3 rounded-2xl text-sm font-semibold bg-neutral-900 text-white">Создать ссылку</button>
                <JoinByCodeForm onJoin={guestJoinByCode} loading={fireSess.phase==='answering'} />
              </div>
            )}
            {fireSess.phase==='creating' && <div className="text-sm">Создаём…</div>}
            {fireSess.phase==='waiting' && (
              <div className="space-y-3">
                <CodeBadge code={fireSess.code} />
                <div className="flex gap-2 flex-wrap">
                  {navigator.share && (
                    <button onClick={()=>{ try { navigator.share({ title:'LoveLab', text:'Давай наладим химию в наших отношениях в LoveLab при помощи ИИ', url: `${window.location.origin}?c=${fireSess.code}` }); } catch{} }} className="px-3 py-1.5 rounded-2xl text-[11px] font-semibold bg-neutral-900 text-white">Поделиться</button>
                  )}
                  <button disabled={regenerating} onClick={hostRegenerateLink} className="px-3 py-1.5 rounded-2xl text-[11px] font-semibold border bg-white disabled:opacity-40">{regenerating? '...' : 'Обновить ссылку'}</button>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500"><span className="animate-spin h-3 w-3 border-2 border-neutral-300 border-t-neutral-900 rounded-full"/>Ожидание ответа…</div>
                <div>
                  <button
                    type="button"
                    onClick={()=>{ fireSess.cancel(); try { sync.disconnect(); } catch {}; }}
                    className="text-[11px] px-3 py-1.5 rounded-2xl font-semibold border bg-white hover:bg-neutral-100"
                  >Назад</button>
                </div>
              </div>
            )}
            {fireSess.phase==='error' && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">Ошибка: {fsError || 'Не удалось создать сессию'}</div>
                <button disabled={regenerating} onClick={hostRegenerateLink} className="w-full px-4 py-3 rounded-2xl text-sm font-semibold bg-neutral-900 text-white disabled:opacity-40">{regenerating? 'Повтор...' : 'Попробовать снова'}</button>
              </div>
            )}
            {fireSess.phase==='answering' && (
              <div className="text-xs text-neutral-500">Формируем ответ…</div>
            )}
            {fireSess.phase==='connected' && (
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs">Подключено ✅</div>
                <button onClick={()=>{ fireSess.dispose(); }} className="px-3 py-2 text-xs rounded-2xl border font-semibold">Новая сессия</button>
              </div>
            )}
            {(fsError || sync.error) && <div className="mt-3 text-xs text-red-600">{fsError || sync.error}</div>}
            {/* (Удалено по запросу: примечание о ручном режиме) */}
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

// ====== Small UI helpers for Firestore sync ======
function CodeBadge({ code }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-neutral-100 border text-xs font-mono select-all">
      <span>{code}</span>
      <button onClick={()=>{ try { navigator.clipboard.writeText(`${window.location.origin}?c=${code}`); } catch{} }} className="text-[10px] px-2 py-1 rounded-full border bg-white">Copy</button>
    </div>
  );
}
function JoinByCodeForm({ onJoin, loading }) {
  const [v,setV]=useState('');
  return (
    <form onSubmit={(e)=>{ e.preventDefault(); if(!v.trim()) return; onJoin(v); }} className="flex gap-2">
  <input name="join-code" value={v} onChange={e=>setV(e.target.value)} placeholder="код партнёра" className="flex-1 border rounded-2xl px-3 py-2 text-xs" />
      <button disabled={!v.trim()||loading} className="px-4 py-2 rounded-2xl text-xs font-semibold bg-white border disabled:opacity-40">Войти</button>
    </form>
  );
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
