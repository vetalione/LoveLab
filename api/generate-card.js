// Vercel Serverless Function: AI card generator
// Expects POST { categoryId, weight }
// Returns { title, desc, weight }
// IMPORTANT: set OPENAI_API_KEY in Vercel project settings.

export const config = { runtime: 'nodejs' };

const CATEGORY_HINTS = {
  trust: 'доверие, уязвимость, честность, безопасное открытое общение',
  friendship: 'дружба, тёплое партнёрство, совместный быт, поддержка в повседневном',
  passion: 'страсть, романтика, флирт, сенсорная близость и игра',
  adventure: 'новизна, исследования, новые впечатления, совместные мини-приключения',
  respect: 'уважение, признание ценности, границы, поддержка целей и усилий'
};

function buildPrompt(categoryId, weight) {
  const cat = CATEGORY_HINTS[categoryId] || 'отношения';
  return `Ты — генератор кратких карточек-действий для пары. Нужна ОДНА новая идея (не повторяйся дословно с ранее типичными простыми идеями вроде \"Прогулка без телефонов\"), строго JSON без лишнего текста. 
Категория: ${categoryId} (${cat}). Цель — улучшить именно эту область.
Интенсивность (вес) ${weight}: 1 = микро-действие на 1-3 минуты, 5 = короткая совместная активность ~15 минут, 10 = более структурированная или осмысленная ~30-45 минут, 15 = полноценный мини-ритуал/сессия 60+ минут.
Ограничения:
- title: до 28 символов, без кавычек внутри, ёмко и конкретно.
- desc: 1–2 строки (до ~140 символов) с конкретикой: формат, шаги или рамки. Без вступлений типа 'Сделайте'. Пиши в повелительном наклонении или телеграфно.
- Не упоминай вес.
Верни JSON вида {"title":"...","desc":"..."}. Никакого текста вокруг.`;
}

export default async function handler(req, res) {
  const LIMIT = 10;
  if (req.method === 'GET') {
    // Return remaining counts without consuming quota
    const day = new Date().toISOString().slice(0,10);
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/rl2=([^;]+)/);
    const cookieRaw = match ? decodeURIComponent(match[1]) : '';
    let counts = { date: day, t:0,f:0,p:0,a:0,r:0 };
    if (cookieRaw) {
      try {
        const [savedDate, rest] = cookieRaw.split(':');
        if (savedDate === day) {
          const parts = rest.split(',');
            ['t','f','p','a','r'].forEach((k,i)=>{ const v = parseInt(parts[i]||'0',10); if(!Number.isNaN(v)) counts[k]=v; });
          counts.date = savedDate;
        }
      } catch {}
    }
    const remaining = {
      trust: Math.max(0, LIMIT - counts.t),
      friendship: Math.max(0, LIMIT - counts.f),
      passion: Math.max(0, LIMIT - counts.p),
      adventure: Math.max(0, LIMIT - counts.a),
      respect: Math.max(0, LIMIT - counts.r)
    };
    return res.status(200).json({ remaining, limit: LIMIT });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST' });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
  }
  try {
    const { categoryId = 'trust', weight = 5 } = await parseBody(req);

    // ---- RATE LIMIT (cookie based, per day, per category, limit=10) ----
    const day = new Date().toISOString().slice(0,10); // YYYY-MM-DD
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/rl2=([^;]+)/);
    const cookieRaw = match ? decodeURIComponent(match[1]) : '';
    // format: date:t,f,p,a,r  (counts numbers)
    let counts = { date: day, t:0,f:0,p:0,a:0,r:0 };
    if (cookieRaw) {
      try {
        const [savedDate, rest] = cookieRaw.split(':');
        if (savedDate === day) {
          const parts = rest.split(',');
          ['t','f','p','a','r'].forEach((k,i)=>{ const v = parseInt(parts[i]||'0',10); if(!Number.isNaN(v)) counts[k]=v; });
          counts.date = savedDate;
        }
      } catch {}
    }

    const mapKey = { trust:'t', friendship:'f', passion:'p', adventure:'a', respect:'r' };
    const k = mapKey[categoryId] || 't';
    if (counts[k] >= LIMIT) {
      res.setHeader('Set-Cookie', buildCookie(counts));
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({ error: 'limit', msg: 'Daily limit reached for this category' });
    }

    // Prepare prompt
    const w = Math.min(15, Math.max(1, parseInt(weight,10)||5));
    const prompt = buildPrompt(categoryId, w);

  // Retry logic across models and attempts (do NOT consume quota unless success)
  // Primary target: gpt-5 (or override via OPENAI_MODEL). Fallbacks cascade to earlier stable families.
  const primary = process.env.OPENAI_MODEL || 'gpt-5';
  const fallbackOrder = [primary, 'gpt-5-preview', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini'];
  // Deduplicate while preserving order
  const models = [...new Set(fallbackOrder)];
    const maxAttemptsPerModel = 2;
    let aiRaw = '', lastErr = null, successJson = null;

    for (const model of models) {
      for (let attempt=1; attempt <= maxAttemptsPerModel; attempt++) {
        try {
          const r = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model,
              temperature: 0.85,
              messages: [
                { role: 'system', content: 'Ты краткий русскоязычный генератор карточек действий.' },
                { role: 'user', content: prompt }
              ]
            })
          });
          if (r.status === 200) {
            const json = await r.json();
            aiRaw = json.choices?.[0]?.message?.content || '';
            successJson = json;
            break; // success, break attempt loop
          }
          if (r.status === 429) {
            // Respect Retry-After if present else exponential/jitter
            let delay = 0;
            const ra = r.headers.get('retry-after');
            if (ra) {
              const raNum = parseFloat(ra);
              if (!Number.isNaN(raNum)) delay = raNum * 1000;
            }
            if (!delay) {
              delay = 400 * Math.pow(2, attempt-1) + Math.floor(Math.random()*120);
            }
            lastErr = new Error('OpenAI 429');
            if (attempt === maxAttemptsPerModel && model === models[models.length-1]) {
              // final failure
              res.setHeader('X-RateLimit-Remaining', String(LIMIT - counts[k]));
              return res.status(429).json({ error: 'upstream-429', msg: 'OpenAI rate limit', attempts: attempt, model, remaining: LIMIT - counts[k] });
            }
            await sleepMs(delay);
            continue; // retry same model
          }
          // Non-200, non-429
          aiRaw = await r.text();
          lastErr = new Error('OpenAI HTTP '+r.status);
          break; // break attempts for this model and move to next model
        } catch (e) {
          lastErr = e;
          if (attempt === maxAttemptsPerModel && model === models[models.length-1]) {
            break; // out of loops
          }
          await sleepMs(300 * attempt);
        }
      }
      if (successJson) break; // model succeeded
    }

    if (!successJson) {
      return res.status(502).json({ error: 'OpenAI error', detail: String(lastErr?.message||'fail'), raw: (aiRaw||'').slice(0,300) });
    }

    // Parse AI JSON output
    let card;
    try {
      const match2 = aiRaw.match(/\{[\s\S]*\}/);
      card = match2 ? JSON.parse(match2[0]) : JSON.parse(aiRaw);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI output', raw: aiRaw.slice(0,400) });
    }
    if (!card || !card.title || !card.desc) {
      return res.status(500).json({ error: 'AI output missing fields', raw: aiRaw.slice(0,400) });
    }

    // Success: now consume quota
    counts[k] += 1;
    res.setHeader('Set-Cookie', buildCookie(counts));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, LIMIT - counts[k])));
    return res.status(200).json({ title: card.title.trim(), desc: card.desc.trim(), weight: w });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function buildCookie(counts) {
  const val = `${counts.date}:${counts.t},${counts.f},${counts.p},${counts.a},${counts.r}`;
  return `rl2=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
}

  function sleepMs(ms){ return new Promise(r=>setTimeout(r,ms)); }
