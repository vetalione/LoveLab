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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Use POST' });
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
    if (counts[k] >= 10) {
      res.setHeader('Set-Cookie', buildCookie(counts));
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({ error: 'limit', msg: 'Daily limit reached for this category' });
    }
    counts[k] += 1;
    res.setHeader('Set-Cookie', buildCookie(counts));
    res.setHeader('X-RateLimit-Remaining', String(10 - counts[k]));
    const prompt = buildPrompt(categoryId, weight);
    // Try model(s)
    const models = [process.env.OPENAI_MODEL || 'gpt-4o-mini', 'gpt-4o', 'gpt-4o-mini'];
    let json, rawRespText='';
    let lastErr;
    for (const model of models) {
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            temperature: 0.9,
            max_tokens: 220,
            messages: [
              { role: 'system', content: 'Ты краткий русскоязычный генератор карточек действий.' },
              { role: 'user', content: prompt }
            ]
          })
        });
        if (!r.ok) {
          rawRespText = await r.text();
          lastErr = new Error('OpenAI HTTP '+r.status);
          continue;
        }
        json = await r.json();
        break;
      } catch (e) { lastErr = e; }
    }
    if (!json) {
      return res.status(502).json({ error: 'OpenAI error', detail: String(lastErr?.message||'fail'), raw: rawRespText.slice(0,400) });
    }
    const aiRaw = json.choices?.[0]?.message?.content || '';
    let card;
    try {
      // Attempt to extract JSON
      const match2 = aiRaw.match(/\{[\s\S]*\}/);
      card = match2 ? JSON.parse(match2[0]) : JSON.parse(aiRaw);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI output', raw: aiRaw });
    }
    if (!card.title || !card.desc) {
      return res.status(500).json({ error: 'AI output missing fields', card });
    }
    return res.status(200).json({ title: card.title.trim(), desc: card.desc.trim(), weight });
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
