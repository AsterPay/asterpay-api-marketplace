import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import Anthropic from '@anthropic-ai/sdk';

// Environment
const PORT = parseInt(process.env.PORT || '3002');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const PAYMENT_ADDRESS = process.env.PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000';

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ABI = [
  {
    name: 'Transfer',
    type: 'event',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false }
    ]
  }
] as const;

// Blockchain client
const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

// AI client
let anthropic: Anthropic | null = null;
if (ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
}

// Pricing (in USDC)
const PRICES = {
  summarize: '0.02',
  translate: '0.03',
  analyze: '0.05',
  search: '0.02'
};

// Stats tracking
const stats = {
  totalCalls: 0,
  paidCalls: 0,
  totalVolume: 0, // in USDC cents
  uniqueUsers: new Set<string>()
};

// Verified payments cache (tx_hash -> amount)
const verifiedPayments = new Map<string, { amount: string; timestamp: number }>();

const app = Fastify({ logger: true });

// CORS
app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Payment-Tx']
});

// Dashboard HTML (inline)
const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AsterPay API Marketplace - Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%); }
    .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
    .glow { box-shadow: 0 0 30px rgba(139, 92, 246, 0.3); }
  </style>
</head>
<body class="min-h-screen text-white p-8">
  <div class="max-w-6xl mx-auto">
    <div class="text-center mb-12">
      <h1 class="text-4xl font-bold mb-2">AsterPay API Marketplace</h1>
      <p class="text-gray-400">x402 Micropayments Dashboard</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
      <div class="card rounded-xl p-6 border border-purple-500/30 glow">
        <p class="text-gray-400 text-sm mb-1">Total API Calls</p>
        <p id="totalCalls" class="text-3xl font-bold text-purple-400">-</p>
      </div>
      <div class="card rounded-xl p-6 border border-green-500/30">
        <p class="text-gray-400 text-sm mb-1">Paid Calls</p>
        <p id="paidCalls" class="text-3xl font-bold text-green-400">-</p>
      </div>
      <div class="card rounded-xl p-6 border border-blue-500/30">
        <p class="text-gray-400 text-sm mb-1">Volume (USDC)</p>
        <p id="volume" class="text-3xl font-bold text-blue-400">$-</p>
      </div>
      <div class="card rounded-xl p-6 border border-yellow-500/30">
        <p class="text-gray-400 text-sm mb-1">Unique Users</p>
        <p id="users" class="text-3xl font-bold text-yellow-400">-</p>
      </div>
    </div>
    <div class="card rounded-xl p-8 border border-gray-700 mb-12">
      <h2 class="text-2xl font-bold mb-6">Available APIs</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="apis"></div>
    </div>
    <div class="card rounded-xl p-8 border border-gray-700 mb-12">
      <h2 class="text-2xl font-bold mb-6">How x402 Works</h2>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
        <div class="p-4"><div class="text-4xl mb-2">1</div><p class="font-semibold">Call API</p><p class="text-gray-400 text-sm">POST to any endpoint</p></div>
        <div class="p-4"><div class="text-4xl mb-2">2</div><p class="font-semibold">Get 402</p><p class="text-gray-400 text-sm">Receive payment details</p></div>
        <div class="p-4"><div class="text-4xl mb-2">3</div><p class="font-semibold">Pay USDC</p><p class="text-gray-400 text-sm">On Base network</p></div>
        <div class="p-4"><div class="text-4xl mb-2">4</div><p class="font-semibold">Get Response</p><p class="text-gray-400 text-sm">Retry with tx hash</p></div>
      </div>
    </div>
    <div class="card rounded-xl p-8 border border-gray-700 mb-12">
      <h2 class="text-2xl font-bold mb-4">Payment Details</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div><p class="text-gray-400 text-sm">Payment Address</p><p id="paymentAddress" class="font-mono text-sm bg-black/30 p-3 rounded mt-1 break-all">-</p></div>
        <div><p class="text-gray-400 text-sm">Network</p><p class="font-semibold mt-1">Base (Chain ID: 8453)</p><p class="text-gray-400 text-sm mt-2">Currency</p><p class="font-semibold mt-1">USDC</p></div>
      </div>
    </div>
    <div class="text-center mt-12 text-gray-500 text-sm">
      <p>Powered by <a href="https://asterpay.io" class="text-purple-400 hover:underline">AsterPay</a> | x402 Protocol on Base</p>
    </div>
  </div>
  <script>
    async function fetchStats() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('totalCalls').textContent = data.totalCalls || 0;
        document.getElementById('paidCalls').textContent = data.paidCalls || 0;
        document.getElementById('volume').textContent = '$' + (data.totalVolumeUSDC || '0.00');
        document.getElementById('users').textContent = data.uniqueUsers || 0;
      } catch (e) { console.error('Stats error:', e); }
    }
    async function fetchPricing() {
      try {
        const res = await fetch('/api/pricing');
        const data = await res.json();
        document.getElementById('paymentAddress').textContent = data.paymentAddress;
        document.getElementById('apis').innerHTML = data.apis.map(api => 
          '<div class="bg-black/30 rounded-lg p-4"><div class="flex justify-between items-start mb-2"><code class="text-purple-400">' + api.endpoint + '</code><span class="bg-green-500/20 text-green-400 px-2 py-1 rounded text-sm">$' + api.price + '</span></div><p class="text-gray-400 text-sm">' + api.description + '</p></div>'
        ).join('');
      } catch (e) { console.error('Pricing error:', e); }
    }
    fetchStats(); fetchPricing(); setInterval(fetchStats, 10000);
  </script>
</body>
</html>`;

// Serve dashboard at root
app.get('/', async (request, reply) => {
  reply.type('text/html').send(dashboardHtml);
});

// Verify USDC payment on Base
async function verifyPayment(txHash: string, expectedAmount: string): Promise<boolean> {
  try {
    // Check cache first
    const cached = verifiedPayments.get(txHash.toLowerCase());
    if (cached) {
      return parseFloat(cached.amount) >= parseFloat(expectedAmount);
    }

    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`
    });

    if (receipt.status !== 'success') {
      return false;
    }

    // Find USDC transfer to our address
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
        // Decode transfer event
        const to = `0x${log.topics[2]?.slice(26)}`.toLowerCase();
        if (to === PAYMENT_ADDRESS.toLowerCase()) {
          const value = BigInt(log.data);
          const amount = formatUnits(value, 6);
          
          // Cache for future use
          verifiedPayments.set(txHash.toLowerCase(), {
            amount,
            timestamp: Date.now()
          });

          return parseFloat(amount) >= parseFloat(expectedAmount);
        }
      }
    }

    return false;
  } catch (e) {
    console.error('Payment verification error:', e);
    return false;
  }
}

// x402 Payment middleware
function requirePayment(price: string) {
  return async (request: any, reply: any) => {
    stats.totalCalls++;
    
    const paymentTx = request.headers['x-payment-tx'];
    
    if (!paymentTx) {
      // Return 402 with payment details
      return reply.status(402).send({
        error: 'Payment Required',
        payment: {
          address: PAYMENT_ADDRESS,
          amount: price,
          currency: 'USDC',
          network: 'base',
          chainId: 8453
        },
        x402: {
          version: '1.0',
          accepts: [{
            scheme: 'exact',
            network: 'base',
            maxAmountRequired: price,
            resource: request.url,
            description: `API call: ${request.url}`
          }]
        }
      });
    }

    // Verify payment
    const isValid = await verifyPayment(paymentTx, price);
    if (!isValid) {
      return reply.status(402).send({
        error: 'Invalid or insufficient payment',
        required: price,
        txHash: paymentTx
      });
    }

    // Payment verified - track stats
    stats.paidCalls++;
    stats.totalVolume += parseFloat(price) * 100; // cents
    
    // Extract payer from tx (simplified)
    stats.uniqueUsers.add(paymentTx.slice(0, 10));
  };
}

// Health check
app.get('/health', async () => {
  return { status: 'ok', service: 'asterpay-api-marketplace' };
});

// Stats endpoint
app.get('/api/stats', async () => {
  return {
    totalCalls: stats.totalCalls,
    paidCalls: stats.paidCalls,
    totalVolumeUSDC: (stats.totalVolume / 100).toFixed(2),
    uniqueUsers: stats.uniqueUsers.size,
    prices: PRICES
  };
});

// ========== PAID APIs ==========

// Summarize text
app.post('/api/ai/summarize', {
  preHandler: requirePayment(PRICES.summarize)
}, async (request, reply) => {
  const { text } = request.body as { text: string };
  
  if (!text) {
    return reply.status(400).send({ error: 'Missing text parameter' });
  }

  if (!anthropic) {
    return reply.status(503).send({ error: 'AI service unavailable' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Summarize this text concisely:\n\n${text}`
      }]
    });

    const summary = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    return {
      success: true,
      summary,
      cost: PRICES.summarize,
      currency: 'USDC'
    };
  } catch (e: any) {
    return reply.status(500).send({ error: 'AI processing failed', details: e.message });
  }
});

// Translate text
app.post('/api/ai/translate', {
  preHandler: requirePayment(PRICES.translate)
}, async (request, reply) => {
  const { text, targetLanguage } = request.body as { text: string; targetLanguage: string };
  
  if (!text || !targetLanguage) {
    return reply.status(400).send({ error: 'Missing text or targetLanguage parameter' });
  }

  if (!anthropic) {
    return reply.status(503).send({ error: 'AI service unavailable' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Translate this text to ${targetLanguage}. Only output the translation, nothing else:\n\n${text}`
      }]
    });

    const translation = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    return {
      success: true,
      translation,
      targetLanguage,
      cost: PRICES.translate,
      currency: 'USDC'
    };
  } catch (e: any) {
    return reply.status(500).send({ error: 'AI processing failed', details: e.message });
  }
});

// Analyze text (sentiment, entities, etc.)
app.post('/api/ai/analyze', {
  preHandler: requirePayment(PRICES.analyze)
}, async (request, reply) => {
  const { text, analysisType } = request.body as { text: string; analysisType?: string };
  
  if (!text) {
    return reply.status(400).send({ error: 'Missing text parameter' });
  }

  if (!anthropic) {
    return reply.status(503).send({ error: 'AI service unavailable' });
  }

  const type = analysisType || 'general';
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Analyze this text. Provide: sentiment (positive/negative/neutral), key topics, main entities, and a brief summary. Format as JSON.\n\nText:\n${text}`
      }]
    });

    const analysis = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    // Try to parse as JSON
    let parsed;
    try {
      parsed = JSON.parse(analysis);
    } catch {
      parsed = { raw: analysis };
    }

    return {
      success: true,
      analysis: parsed,
      analysisType: type,
      cost: PRICES.analyze,
      currency: 'USDC'
    };
  } catch (e: any) {
    return reply.status(500).send({ error: 'AI processing failed', details: e.message });
  }
});

// Web search (simulated - would integrate real search API)
app.post('/api/web/search', {
  preHandler: requirePayment(PRICES.search)
}, async (request, reply) => {
  const { query } = request.body as { query: string };
  
  if (!query) {
    return reply.status(400).send({ error: 'Missing query parameter' });
  }

  if (!anthropic) {
    return reply.status(503).send({ error: 'AI service unavailable' });
  }

  try {
    // For demo, use Claude's knowledge (in production, integrate real search)
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Provide information about: ${query}\n\nFormat your response as a helpful search result with key facts and relevant details.`
      }]
    });

    const result = response.content[0].type === 'text' 
      ? response.content[0].text 
      : '';

    return {
      success: true,
      query,
      result,
      cost: PRICES.search,
      currency: 'USDC',
      note: 'Demo mode - using AI knowledge base'
    };
  } catch (e: any) {
    return reply.status(500).send({ error: 'Search failed', details: e.message });
  }
});

// Pricing info
app.get('/api/pricing', async () => {
  return {
    apis: [
      {
        endpoint: '/api/ai/summarize',
        method: 'POST',
        price: PRICES.summarize,
        currency: 'USDC',
        description: 'Summarize text with AI',
        params: { text: 'string (required)' }
      },
      {
        endpoint: '/api/ai/translate',
        method: 'POST',
        price: PRICES.translate,
        currency: 'USDC',
        description: 'Translate text to any language',
        params: { text: 'string (required)', targetLanguage: 'string (required)' }
      },
      {
        endpoint: '/api/ai/analyze',
        method: 'POST',
        price: PRICES.analyze,
        currency: 'USDC',
        description: 'Analyze text (sentiment, entities, topics)',
        params: { text: 'string (required)', analysisType: 'string (optional)' }
      },
      {
        endpoint: '/api/web/search',
        method: 'POST',
        price: PRICES.search,
        currency: 'USDC',
        description: 'Web search with AI summary',
        params: { query: 'string (required)' }
      }
    ],
    paymentNetwork: 'Base (Chain ID: 8453)',
    paymentCurrency: 'USDC',
    paymentAddress: PAYMENT_ADDRESS,
    protocol: 'x402'
  };
});

// Start server
const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 AsterPay API Marketplace running on port ${PORT}`);
    console.log(`💰 Payment address: ${PAYMENT_ADDRESS}`);
    console.log(`📊 Prices: summarize=$${PRICES.summarize}, translate=$${PRICES.translate}, analyze=$${PRICES.analyze}, search=$${PRICES.search}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
