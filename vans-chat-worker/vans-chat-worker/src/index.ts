export interface Env {
  AI: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }
    
    return new Response('Not found', { status: 404 });
  },
};

async function handleChat(request: Request, env: Env): Promise<Response> {
  try {
    const { message, history = [], formAnswers = {} } = await request.json();
    
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

Van's recent form:
${JSON.stringify(formAnswers, null, 2)}

Be helpful, concise. If out of scope, redirect to Joe.`;

    const response = await env.AI.run('@anthropic/claude-3-7-sonnet-latest', {
      system: systemPrompt,
      messages: [
        ...history.map((h: any) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        { role: 'user', content: message }
      ],
      max_tokens: 400,
    });

    const aiMessage = response[0]?.text || 'Sorry, I had trouble responding.';
    
    return new Response(JSON.stringify({ response: aiMessage }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
