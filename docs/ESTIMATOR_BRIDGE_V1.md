# External estimator bridge v1 (transport neutral)

The **Sales Consultation** app does not price projects. Prices must come back from the existing external estimating app. In v1 it uses a JSON download/import. This boundary can be replaced later by a secure HTTPS API with user-supplied endpoint, OAuth/service auth, idempotency and server-side authorization.

## Request from EZTakeoff
`src/lib/estimatingBridge.ts` exports `createEstimateHandoff(project)` with:
- `schemaVersion: 1`
- `messageType: "sns.eztakeoff.estimate-request"`
- `projectId` and integer `revision`
- `customer`: name/address/phone/email
- `project`: deck or covered deck + selected cover family/color
- `geometry`: footprint in feet, areaSqFt, deckHeightFt, stairCount
- `selections`: all approved configuration values
- `materials`: authoritative material list
- `blockers`, `assumptions`
- `photoAttachedToThisPayload: false` — **photo never attached**

## Response imported from external estimating app
```json
{
  "schemaVersion": 1,
  "projectId": "same-project-id-as-request",
  "requestRevision": 3,
  "externalEstimateId": "EST-12345",
  "quotedAt": "2026-11-17T19:00:00-06:00",
  "tiers": [
    {
      "id": "good",
      "name": "Good",
      "price": 25000,
      "currency": "USD",
      "scope": "Complete scope approved by estimator...",
      "includedOptions": ["Composite decking", "Aluminum railing"]
    },
    {
      "id": "better",
      "name": "Better",
      "price": 32000,
      "currency": "USD",
      "scope": "Enhanced scope approved by estimator...",
      "includedOptions": ["Composite decking", "Drink rail", "Cover"]
    }
  ]
}
```

Importer validates projectId, exact requestRevision, nonnegative USD amount, distinct tiers, field length constraints; rejects stale or cross-customer prices. Changes to design increment revision and clear pricing. Salesperson selects one of the returned tiers; app exports `sns.eztakeoff.accepted-scope` with selected price/scope as **draft awaiting client approval**, not an executed contract.

## API implementation to come
Ask for estimator app’s actual API shape, auth, supported methods, webhooks and price-tier model; then implement an authenticated server-to-server connector. Keep API keys off the frontend. Add audit logs and conflict prevention. Never guess endpoint names or claim automatic two-way sync until verified.
