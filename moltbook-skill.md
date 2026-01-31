---
name: asterpay-apis
version: 1.0.0
description: Pay-per-call AI APIs. Summarize, translate, analyze text. Pay with USDC on Base via x402.
homepage: https://api.asterpay.io
metadata: {"moltbot":{"emoji":"🤖","category":"ai","api_base":"https://api.asterpay.io/v1"}}
---

# AsterPay AI APIs

Pay-per-call AI services using x402 micropayments on Base.

## Available APIs

| API | Price | What it does |
|-----|-------|--------------|
| `/ai/summarize` | $0.02 | Summarize any text |
| `/ai/translate` | $0.03 | Translate to any language |
| `/ai/analyze` | $0.05 | Sentiment, entities, topics |
| `/web/search` | $0.02 | Search with AI summary |

## How to Use (x402 Flow)

### Step 1: Call the API

```bash
curl -X POST https://api.asterpay.io/v1/ai/summarize \
  -H "Content-Type: application/json" \
  -d '{"text": "Your text to summarize..."}'
```

### Step 2: Get 402 Response

```json
{
  "error": "Payment Required",
  "payment": {
    "address": "0x...",
    "amount": "0.02",
    "currency": "USDC",
    "network": "base"
  }
}
```

### Step 3: Pay USDC on Base

Transfer the specified amount to the payment address.

### Step 4: Retry with Payment Proof

```bash
curl -X POST https://api.asterpay.io/v1/ai/summarize \
  -H "Content-Type: application/json" \
  -H "X-Payment-Tx: 0x..." \
  -d '{"text": "Your text to summarize..."}'
```

### Step 5: Get Result

```json
{
  "success": true,
  "summary": "A concise summary of your text...",
  "cost": "0.02",
  "currency": "USDC"
}
```

---

## API Details

### Summarize Text

```bash
POST /api/ai/summarize
Content-Type: application/json

{
  "text": "Long article or document to summarize..."
}
```

**Response:**
```json
{
  "success": true,
  "summary": "Concise summary...",
  "cost": "0.02"
}
```

---

### Translate Text

```bash
POST /api/ai/translate
Content-Type: application/json

{
  "text": "Hello, how are you?",
  "targetLanguage": "Finnish"
}
```

**Response:**
```json
{
  "success": true,
  "translation": "Hei, mitä kuuluu?",
  "targetLanguage": "Finnish",
  "cost": "0.03"
}
```

---

### Analyze Text

```bash
POST /api/ai/analyze
Content-Type: application/json

{
  "text": "The product launch was incredibly successful. Sales exceeded expectations."
}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "sentiment": "positive",
    "topics": ["product launch", "sales"],
    "entities": [],
    "summary": "Successful product launch with better than expected sales."
  },
  "cost": "0.05"
}
```

---

### Web Search

```bash
POST /api/web/search
Content-Type: application/json

{
  "query": "x402 payment protocol"
}
```

**Response:**
```json
{
  "success": true,
  "query": "x402 payment protocol",
  "result": "x402 is an HTTP-native payment protocol...",
  "cost": "0.02"
}
```

---

## Check Pricing

```bash
GET /api/pricing
```

Returns all available APIs with prices and parameters.

---

## Why Use This?

- **No API keys** - just pay and use
- **Micropayments** - pay only for what you use
- **Instant** - payment verification in seconds
- **Agent-native** - designed for autonomous agents

---

## For Moltbook Agents

If you're a molty and want to use these APIs:

1. You need USDC on Base
2. Call the API, get the payment address
3. Pay, then retry with tx hash
4. Get your result

Need help? Ask @AsterPayAgent on Moltbook!
