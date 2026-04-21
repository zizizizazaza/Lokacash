# Risk Assessment API

LokaCash's Risk Assessment API provides real-time, AI-powered risk evaluation for financial transactions. Each request is routed through a **Sequencer → Parallel Validator Committee → Weighted Consensus** pipeline, delivering sub-second decisions with full auditability.

---

## 5.1 Evaluate Risk

```
POST /api/v1/risk/evaluate
```

Submit a transaction for risk assessment. The system runs parallel validators (amount, identity, geo, velocity) and returns a consensus decision.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subject_id` | string | ✅ | Unique user/entity identifier |
| `subject_type` | string | ✅ | `"user"` \| `"merchant"` \| `"contract"` |
| `trust_score` | number | ✅ | Historical trust score (0.0–1.0) |
| `total_transactions` | integer | — | Lifetime transaction count |
| `flagged_count` | integer | — | Number of previously flagged transactions |
| `action_type` | string | ✅ | `"payment"` \| `"withdrawal"` \| `"transfer"` \| `"swap"` |
| `description` | string | — | Human-readable transaction description |
| `amount` | number | ✅ | Transaction value |
| `currency` | string | ✅ | ISO 4217 currency code (e.g. `"USD"`, `"ETH"`) |
| `geo_location` | string | — | Location code (e.g. `"NY,US"`, `"SG"`) |
| `channel` | string | — | `"web"` \| `"mobile"` \| `"api"` |
| `recent_transaction_count` | integer | — | Transactions in last 24h |
| `recent_transaction_amount` | number | — | Total value in last 24h |

### Request Example

```bash
curl -X POST https://api.loka.cash/api/v1/risk/evaluate \
  -H "Authorization: Bearer lk_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_id": "user_12345",
    "subject_type": "user",
    "trust_score": 0.75,
    "total_transactions": 42,
    "flagged_count": 0,
    "action_type": "payment",
    "description": "Wire transfer to external account",
    "amount": 3000.00,
    "currency": "USD",
    "geo_location": "NY,US",
    "channel": "web",
    "recent_transaction_count": 2,
    "recent_transaction_amount": 500.0
  }'
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `decision_id` | string | Unique decision identifier |
| `session_id` | string | Session ID for audit trail |
| `decision` | string | `"approve"` \| `"challenge"` \| `"reject"` |
| `risk_level` | string | `"low"` \| `"medium"` \| `"high"` \| `"critical"` |
| `confidence` | number | Consensus confidence score (0.0–1.0) |
| `ttl` | integer | Decision validity in seconds |
| `rationale` | string | Human-readable explanation of the decision |
| `risk_indicators` | string[] | Triggered risk flags |
| `challenge_eligible` | boolean | Whether user can submit evidence to appeal |
| `challenge_id` | string? | Present only when `decision = "challenge"` |
| `challenge_instructions` | string? | What evidence is needed |
| `required_evidence` | string[]? | Evidence types required |
| `participating_validators` | string[] | Validators that contributed to consensus |
| `execution_time` | number | Processing time in seconds |

### Response Example — Approve

```json
{
  "decision_id": "dec-abc123def456",
  "session_id": "sess-session123",
  "decision": "approve",
  "risk_level": "low",
  "confidence": 0.91,
  "ttl": 7200,
  "rationale": "[identity] Trust score normal | [amount] Within limits",
  "risk_indicators": [],
  "challenge_eligible": false,
  "difficulty_level": "simple",
  "participating_validators": ["amount", "identity"],
  "execution_time": 0.34
}
```

### Response Example — Challenge

When the system detects elevated risk but isn't sure enough to reject, it issues a **challenge** — the user can submit additional evidence.

```json
{
  "decision_id": "dec-def789ghi012",
  "session_id": "sess-session456",
  "decision": "challenge",
  "risk_level": "high",
  "confidence": 0.61,
  "ttl": 3600,
  "rationale": "[geo] Cross-border high-value transfer | [velocity] Unusual pattern",
  "risk_indicators": ["cross_border_high_value", "potential_structuring"],
  "challenge_eligible": true,
  "challenge_id": "chal-xyz789",
  "challenge_instructions": "Please provide: proof of transaction purpose, business justification document",
  "required_evidence": ["purpose_proof", "business_justification"],
  "participating_validators": ["amount", "identity", "geo", "velocity"],
  "execution_time": 0.52
}
```

### Response Example — Reject

```json
{
  "decision_id": "dec-jkl345mno678",
  "session_id": "sess-session789",
  "decision": "reject",
  "risk_level": "critical",
  "confidence": 0.97,
  "ttl": 0,
  "rationale": "[identity] Known fraudulent actor | [velocity] 15 rapid transactions",
  "risk_indicators": ["blacklisted_entity", "rapid_fire_transactions", "sanctions_match"],
  "challenge_eligible": false,
  "participating_validators": ["amount", "identity", "geo", "velocity", "sanctions"],
  "execution_time": 0.18
}
```

---

## 5.2 Respond to Challenge

```
POST /api/v1/risk/challenge/{challenge_id}/respond
```

Submit supplementary evidence to respond to a challenge. The system injects evidence into the `trace_context` and automatically re-evaluates, returning an updated decision.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `challenge_id` | string | Challenge ID from the original evaluate response |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `evidence` | object[] | ✅ | Array of evidence items |
| `evidence[].type` | string | ✅ | Evidence type (see table below) |
| `evidence[].content` | string | ✅ | Evidence content or URL |
| `evidence[].metadata` | object | — | Additional context |

### Evidence Types

| Type | Description | Example |
|------|-------------|---------|
| `purpose_proof` | Proof of transaction purpose | Invoice, contract, purchase order |
| `business_justification` | Business rationale document | Company registration, trade license |
| `identity_verification` | Additional KYC documents | Passport scan, utility bill |
| `source_of_funds` | Proof of fund origin | Bank statement, payslip |
| `beneficiary_info` | Recipient details | Company name, relationship proof |

### Request Example

```bash
curl -X POST https://api.loka.cash/api/v1/risk/challenge/chal-xyz789/respond \
  -H "Authorization: Bearer lk_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "evidence": [
      {
        "type": "purpose_proof",
        "content": "https://storage.loka.cash/docs/invoice_2024_001.pdf",
        "metadata": { "invoice_number": "INV-2024-001", "vendor": "Acme Corp" }
      },
      {
        "type": "business_justification",
        "content": "Quarterly supplier payment per contract #CT-5521",
        "metadata": { "contract_id": "CT-5521" }
      }
    ]
  }'
```

### Response

Returns the same `RiskDecisionResponse` structure as `/evaluate`, reflecting the re-evaluated decision after evidence review.

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| `404` | `CHALLENGE_NOT_FOUND` | Challenge ID does not exist |
| `410` | `CHALLENGE_EXPIRED` | Challenge window has expired |
| `409` | `CHALLENGE_ALREADY_RESPONDED` | Evidence already submitted |
| `422` | `INSUFFICIENT_EVIDENCE` | Required evidence types missing |

---

## 5.3 Get Session History

```
GET /api/v1/risk/sessions/{session_id}
```

Retrieve the complete lifecycle of a risk assessment session, including all decisions, challenges, and re-evaluations.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | string | Session ID from the evaluate response |

### Response Example

```json
{
  "session_id": "sess-session456",
  "subject_id": "user_12345",
  "status": "completed",
  "created_at": "2025-03-18T08:30:00Z",
  "updated_at": "2025-03-18T08:35:22Z",
  "decisions": [
    {
      "decision_id": "dec-def789ghi012",
      "decision": "challenge",
      "risk_level": "high",
      "confidence": 0.61,
      "timestamp": "2025-03-18T08:30:00Z"
    },
    {
      "decision_id": "dec-pqr456stu789",
      "decision": "approve",
      "risk_level": "low",
      "confidence": 0.88,
      "timestamp": "2025-03-18T08:35:22Z"
    }
  ]
}
```

### Session Status Values

| Status | Description |
|--------|-------------|
| `active` | Initial evaluation complete, awaiting action |
| `challenged` | Challenge issued, waiting for evidence |
| `completed` | Final decision reached (approve/reject) |
| `expired` | Session TTL expired without resolution |

---

## 5.4 List Risk Sessions

```
GET /api/v1/risk/sessions
```

List risk assessment sessions with powerful filtering. Useful for compliance dashboards and audit reports.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `subject_id` | string | — | Filter by user/entity |
| `status` | string | — | Filter by status (`active` \| `challenged` \| `completed` \| `expired`) |
| `decision` | string | — | Filter by decision (`approve` \| `challenge` \| `reject`) |
| `risk_level` | string | — | Filter by risk level |
| `from` | string | — | Start date (ISO 8601) |
| `to` | string | — | End date (ISO 8601) |
| `limit` | integer | `20` | Max results (1–100) |
| `offset` | integer | `0` | Pagination offset |

### Request Example

```bash
curl "https://api.loka.cash/api/v1/risk/sessions?subject_id=user_12345&status=completed&limit=10" \
  -H "Authorization: Bearer lk_live_xxxxxxxxxxxx"
```

### Response Example

```json
{
  "total": 42,
  "limit": 10,
  "offset": 0,
  "sessions": [
    {
      "session_id": "sess-session123",
      "subject_id": "user_12345",
      "decision": "approve",
      "risk_level": "low",
      "confidence": 0.91,
      "status": "completed",
      "created_at": "2025-03-18T08:30:00Z"
    },
    {
      "session_id": "sess-session456",
      "subject_id": "user_12345",
      "decision": "approve",
      "risk_level": "low",
      "confidence": 0.88,
      "status": "completed",
      "created_at": "2025-03-17T14:15:00Z"
    }
  ]
}
```

---

## Architecture Overview

```
Client Request
    ↓
┌─────────────┐
│  Sequencer   │  Route + classify
└──────┬──────┘
       ↓
┌──────┴──────────────────────┐
│  Parallel Validator Committee│
│  ┌────────┐ ┌────────┐      │
│  │ Amount │ │Identity│      │
│  └────────┘ └────────┘      │
│  ┌────────┐ ┌────────┐      │
│  │  Geo   │ │Velocity│      │
│  └────────┘ └────────┘      │
└──────┬──────────────────────┘
       ↓
┌─────────────┐
│  Weighted    │  Aggregate scores
│  Consensus   │  → approve / challenge / reject
└─────────────┘
```

Each validator runs independently and returns a risk score. The consensus engine aggregates all scores using configurable weights to produce the final decision.