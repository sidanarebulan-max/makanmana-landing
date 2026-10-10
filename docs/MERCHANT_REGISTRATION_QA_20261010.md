# Merchant registration production verification — 10 October 2026

Production: https://www.makanmana.app/daftar-kedai.html

## Repair

The old upload-first flow could persist images before receiving any merchant text. A historical honeypot response could also be mistaken for success. The replacement flow creates a draft with its payload, confirms the server snapshot before uploads, updates that snapshot, and returns success only after verifying a saved full or partial receipt. Upload and finalize failures retain the draft. Repeated finalize requests return the existing receipt.

Initial onboarding fields are optional, including SSM and evidence. Missing or invalid information stays in a partial lead. Merchant Desk combines full registrations, partial registrations, drafts with snapshots, and legacy drafts with uploaded files. Consent that was never recorded stays unavailable; no merchant is automatically approved or published to Control Center.

## Real endpoint tests

Every case was checked against its database records before cleanup.

| Case | Result | Evidence |
| --- | --- | --- |
| A — empty | PASS | HTTP 200; incomplete partial; 0%; no invented consent or invalid fields. |
| B — name and phone | PASS | HTTP 200; saved partial with missing fields. |
| C — invalid email, phone and postcode | PASS | HTTP 200; values retained and all three invalid fields recorded. |
| D — complete without SSM/evidence | PASS | HTTP 200; partial at 95%, awaiting evidence. |
| E — snapshot then failed upload | PASS | Invalid image rejected with 422; name/contact snapshot retained and visible as draft. |
| F — uploaded files then failed finalize | PASS | Wrong-token finalize rejected with 401; snapshot and three files retained as draft. |
| G — full success and simultaneous retries | PASS | Full receipt persisted; concurrent repeats returned the same ID/reference; exactly one full record. |
| H — populated company_fax/autofill regression | PASS | Lead persisted; no fake success or silent discard. |

## UI, security and preservation

- Browser Next navigation works with empty optional fields. Local menu/name/price survive refresh.
- Mobile fixture renders the same registration source at 390px. Inputs use 16px text, sticky controls remain visible, and hours no longer overflow (375px viewport and scroll width; 345px hours width and scroll width). Hours start empty instead of fabricating default times.
- Admin UI opens full, partial, draft and legacy details. Synthetic UI fixtures contained no real private merchant data.
- The existing 95% partial appears in the unified queue. Its private media, menu image and evidence links returned HTTP 200 using signed URLs. The referenced legacy draft retains all five uploaded files and its explicit missing-text warning.
- Anonymous admin requests return 401. Draft, partial and private file metadata tables have RLS and no anonymous/authenticated read privileges. Storage buckets remain private. Server credentials are not added to frontend code.
- Possible legacy retries are marked using time/IP/file evidence; records were not merged using weak guesses.

## Cleanup and final state

Only the uniquely marked synthetic QA records and their media were removed: 1 full, 9 partial, 12 drafts and 10 storage objects. The temporary cleanup handler was removed, and the original immutable menu trigger was restored. The temporary QA session was revoked after verification.

Preserved production counts: **20 full, 1 partial, 18 recoverable legacy drafts**. No QA merchant records remain. Draft file metadata references have **0 missing storage objects**. Edge functions: **merchant-intake-v3 v12**, **merchant-admin v12**.

Historical legacy text cannot be reconstructed from the server because it never arrived. Media remain available for follow-up. The existing partial still needs its location. Photos must be reselected after a browser refresh because browsers cannot restore local File objects; saved text and completed server uploads remain recoverable.

Mobile proof: [screenshot](qa/makanmana-mobile-verification-20261010.jpg).
