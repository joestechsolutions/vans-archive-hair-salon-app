export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    if (url.pathname === '/submit-form' && request.method === 'POST') {
      return handleFormSubmit(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

const SEARCH_KEYWORDS = [
  'address', 'location', 'where is', 'phone', 'contact', 'hours',
  'price', 'cost', 'how much', 'product', 'supplier', 'brand',
  'saloncentric', 'cosmoprof', 'glossgenius', 'vish', 'salonscale',
  'competitor', 'yelp', 'review', 'google', 'website',
  'open', 'closed', 'appointment', 'booking',
  'san jose', 'california', 'downtown',
  'what is', 'who is', 'tell me about', 'find',
];

function needsSearch(query) {
  const lower = query.toLowerCase();
  return SEARCH_KEYWORDS.some(kw => lower.includes(kw));
}

async function performTavilySearch(query, env) {
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5,
      }),
    });

    if (!resp.ok) {
      console.error('Tavily search failed:', resp.status);
      return null;
    }

    return await resp.json();
  } catch (err) {
    console.error('Tavily error:', err.message);
    return null;
  }
}

function formatSearchResults(raw) {
  const parts = [];
  if (raw.answer) parts.push(`Summary: ${raw.answer}`);
  if (raw.results && raw.results.length > 0) {
    parts.push('\nWeb search results:');
    for (const r of raw.results) {
      parts.push(`\n- ${r.title}`);
      parts.push(`  ${r.url}`);
      if (r.content) {
        const snippet = r.content.length > 300 ? r.content.slice(0, 300) + '...' : r.content;
        parts.push(`  ${snippet}`);
      }
    }
  }
  return parts.join('\n') || 'No results found.';
}

async function handleChat(request, env) {
  try {
    const { message, formAnswers = {} } = await request.json();

    const lowerMsg = message.toLowerCase();

    let searchContext = '';
    if (needsSearch(lowerMsg)) {
      const results = await performTavilySearch(message, env);
      if (results) {
        searchContext = '\n\nWEB SEARCH RESULTS (use these to answer):\n' + formatSearchResults(results);
      }
    }

    const systemPrompt = `You are Joe's AI assistant helping Van with her hair stylist app planning.

ABOUT VAN:
- Van is a hairstylist in San Jose, CA
- She currently uses Gloss app (yearly subscription)
- Wants an app that works behind the chair with gloved hands
- Minimal typing, aesthetically pleasing
- Target: independent stylists (booth renters)

APP MODULES:
1. Formulas - track hair color mixes (ml/gr/oz)
2. Inventory - barcode scanning, stock tracking
3. Client Info - names, numbers, photos
4. Profitability - cost per service, margins

PREMORTEM KEY RISKS:
• Built for one stylist only → validate with multiple people first
• Profitability misleading if booth rent/licensing not included
• Barcode scanning unreliable (no universal hair product DB)
• Consumables tracking impossible during service (gloved hands)
• Photo storage costs explode & create legal liability
• One person's workflow ≠ all stylists
• Native apps require continuous maintenance
• Competition (GlossGenius, Vish, SalonScale) already established
• Friend scope creep makes boundaries hard
• Offline-first essential (salon WiFi dead zones)

Van's form answers:
${JSON.stringify(formAnswers, null, 2)}
${searchContext}

Be concise. Answer directly based on what you know and the web search results provided above. Keep under 200 words.`;

    const response = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 500,
    });

    const aiMessage = response.response || response.choices?.[0]?.message?.content || 'Sorry, I had trouble responding.';

    return new Response(JSON.stringify({ response: aiMessage }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders() });
  }
}

async function handleFormSubmit(request, env) {
  try {
    const formData = await request.formData();

    const textFields = ['priority', 'phone_use', 'vibe', 'colors', 'timeline', 'pain_point', 'dream_feature'];
    const answers = {};
    for (const field of textFields) {
      const val = formData.get(field);
      if (val) answers[field] = val;
    }

    const mods = { formulas: 'Formulas', inventory: 'Inventory', clients: 'Client Notes', profitability: 'Money' };
    const vibs = { warm: 'Warm & Cozy', clean: 'Clean & Simple', bold: 'Bold & Fun', dark: 'Sleek & Dark' };
    const phone = { minimal: 'Almost none', some: 'A few quick taps', batch: 'After services' };
    const time = { asap: 'ASAP (Yesterday!)', months: 'Couple months', exploring: 'Just exploring' };

    let body = "Van's App Answers\n";
    body += '━━━━━━━━━━━━━━━━━━━━\n\n';
    if (answers.priority) body += '• Fix ONE thing: ' + (mods[answers.priority] || answers.priority) + '\n';
    if (answers.phone_use) body += '• Phone during service: ' + (phone[answers.phone_use] || answers.phone_use) + '\n';
    if (answers.vibe) body += '• App vibe: ' + (vibs[answers.vibe] || answers.vibe) + '\n';
    if (answers.colors) body += '• Colors: ' + answers.colors + '\n';
    if (answers.timeline) body += '• Timeline: ' + (time[answers.timeline] || answers.timeline) + '\n';
    if (answers.pain_point) body += '\nBiggest frustration:\n' + answers.pain_point + '\n';
    if (answers.dream_feature) body += '\nDream feature:\n' + answers.dream_feature + '\n';

    const links = [];
    let linkIdx = 1;
    while (formData.has('link' + linkIdx)) {
      const link = formData.get('link' + linkIdx);
      if (link && link.trim()) links.push(link.trim());
      linkIdx++;
    }
    if (links.length) body += '\nLinks:\n' + links.join('\n') + '\n';

    const attachments = [];
    const fileFields = ['photos', 'docs'];
    for (const field of fileFields) {
      const files = formData.getAll(field);
      for (const file of files) {
        if (file && file.size > 0) {
          try {
            const buffer = await file.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            attachments.push({
              content: btoa(binary),
              filename: file.name,
              type: file.type || 'application/octet-stream',
            });
          } catch (err) {
            console.error('Failed to process file', file.name, err);
          }
        }
      }
    }

    const resendPayload = {
      from: 'Joe\'s Tech Solutions <onboarding@resend.dev>',
      to: ['joe@joestechsolutions.com'],
      subject: "Van's App Answers",
      text: body,
    };
    if (attachments.length) resendPayload.attachments = attachments;

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    });

    if (!resendResponse.ok) {
      const err = await resendResponse.text();
      throw new Error('Resend failed: ' + err);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}