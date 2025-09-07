// Vercel Serverless Function: AI card generator
// Expects POST { categoryId, weight }
// Returns { title, desc, weight }
// IMPORTANT: set OPENAI_API_KEY in Vercel project settings.

export const config = { runtime: 'nodejs18.x' };

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
    const prompt = buildPrompt(categoryId, weight);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.9,
        max_tokens: 220,
        messages: [
          { role: 'system', content: 'Ты краткий русскоязычный генератор карточек действий.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(502).json({ error: 'OpenAI error', detail: text.slice(0,500) });
    }
    const json = await response.json();
    const raw = json.choices?.[0]?.message?.content || '';
    let card;
    try {
      // Attempt to extract JSON
      const match = raw.match(/\{[\s\S]*\}/);
      card = match ? JSON.parse(match[0]) : JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI output', raw });
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
