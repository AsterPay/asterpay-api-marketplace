# AsterPay API Marketplace

**Pay-per-call AI APIs with x402 micropayments**

Live demo for Circle and investors showing real agent commerce.

## APIs Available

| API | Price | Description |
|-----|-------|-------------|
| `/ai/summarize` | $0.02 | Summarize text with AI |
| `/ai/translate` | $0.03 | Translate text to any language |
| `/ai/analyze` | $0.05 | Analyze data/sentiment |
| `/web/search` | $0.02 | Web search with AI summary |

## How It Works

```
1. Agent calls API
2. Gets 402 Payment Required + payment details
3. Pays USDC on Base
4. Retries with tx hash
5. Gets response
```

## x402 Flow

```bash
# Step 1: Call API (get payment requirements)
curl -X POST https://api.asterpay.io/v1/ai/summarize \
  -H "Content-Type: application/json" \
  -d '{"text": "Long article to summarize..."}'

# Response: 402 Payment Required
# {
#   "error": "Payment Required",
#   "payment": {
#     "address": "0x...",
#     "amount": "0.02",
#     "currency": "USDC",
#     "network": "base"
#   }
# }

# Step 2: Pay (agent pays on-chain)
# ... USDC transfer on Base ...

# Step 3: Retry with payment proof
curl -X POST https://api.asterpay.io/v1/ai/summarize \
  -H "Content-Type: application/json" \
  -H "X-Payment-Tx: 0x..." \
  -d '{"text": "Long article to summarize..."}'

# Response: 200 OK
# { "summary": "..." }
```

## For Moltbook Agents

Install the AsterPay skill and call APIs directly:

```
@AsterPayAgent I need to summarize this article: [url]
```

## Tech Stack

- **Backend:** Fastify + TypeScript
- **AI:** Anthropic Claude
- **Blockchain:** Base (USDC)
- **Payment:** x402 protocol
- **Settlement:** SEPA Instant (EUR)

## Metrics Dashboard

Track:
- Total API calls
- Transaction volume (USDC)
- EUR settled
- Unique agents/users
