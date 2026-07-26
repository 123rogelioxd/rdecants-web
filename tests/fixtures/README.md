# Test fixtures

## `rsupplyos-catalog.json`

A **real, sanitized snapshot** of `GET https://api.rdecants.com/api/web/catalog`,
captured **2026-07-26**. 73 products, 355 variants.

It exists so the recommendation engine, the metadata normalizer and the catalog
auditor are all tested against the metadata R Supply OS actually sends —
shapes, aliases, empty arrays, missing `scores`, mixed-language enum values and
all — instead of against hand-written fixtures that quietly agree with the code.

**Sanitising applied** (the endpoint is public and carries no personal data):

- absolute `/storage/…` image URLs reduced to their stable relative path
- `image_url` dropped (a duplicate of `image`)
- nothing else changed — every `fragrance.*` field, score and variant is verbatim

**CI never touches the network.** `tests/apiContract.test.js` verifies the
snapshot still matches the contract the frontend consumes; the optional live
contract check against the real API only runs when `RDECANTS_LIVE_API=1` is set,
so a backend outage can never turn the suite red.

To refresh the snapshot:

```bash
RDECANTS_LIVE_API=1 node --test tests/apiContract.test.js
```

…read the reported drift, then re-capture deliberately. Do **not** refresh it to
make a failing test pass: a diff here means either R Supply OS changed its
contract (update the normalizer) or the metadata regressed (fix it upstream).
