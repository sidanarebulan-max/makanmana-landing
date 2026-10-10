# Merchant draft recovery — 11 October 2026

The supplied recording shows the old upload-first form, including a save operation still uploading media at the end of the recording. The supplied admin screenshot identifies a historical media-only draft. Updating the submission code did not retroactively supply that draft's missing text.

The specifically identified draft was recovered from clearly visible user-supplied video fields into a partial intake. Its original five media objects were retained and its menu was restored. The evidence document was deferred in the original form. Recovery provenance is stored privately in the payload; the observed checkbox choices are retained with an unknown original consent timestamp, and the admin detail explicitly identifies video recovery. No private form fields or recovery payloads are committed to this public repository. No merchant is approved or published by this repair.

Further submission changes:

- Create requests require their initial payload and reject old upload-first clients with a visible update message.
- A client-generated random token makes draft creation retryable without duplicate rows, protected by a unique token-hash index.
- Every file failure is collected separately; the remaining uploads and final save continue, so a recoverable partial receipt is returned instead of leaving a completed save attempt as an unnamed draft.
- File failures remain visible in the receipt and admin detail; success still requires a verified persisted registration receipt.
- Network calls have time limits. Save retries check the existing server receipt before repeating finalization.
- The registration HTML is served with Cache-Control: no-store.

## Verification

- PASS: the recovered partial appears in the authenticated live unified queue with its original five signed media links returning HTTP 200.
- PASS: the actual frontend submit handler, payload builder, image handling and network helpers were executed against the live endpoint with a synthetic form DOM. An invalid first PNG returned 422; the other four images uploaded; finalization returned a verified 90% partial receipt. Database records retained the complete form values, four images and the explicit upload failure.
- PASS: the same frontend code with five valid images returned a verified 95% partial receipt, missing only deferred document evidence. Database records retained five files.
- PASS: two simultaneous create requests using one random client token returned the same draft ID and produced one row.
- PASS: an old payload-less create request returned HTTP 426 with a clear update instruction and created no draft.
- Browser interaction reached every populated form section and the final save screen on production. The browser file chooser timed out and reset that browser session, so a complete browser upload-and-save run was not verified. File handling and save completion were verified through the actual frontend handler against live APIs as described above.
- JavaScript syntax checks and isolated TypeScript checks passed; edge bundling succeeded.

Only synthetic QA records/media were cleaned: two partials, three drafts and nine storage objects. Temporary QA access and cleanup handlers were removed. Final preserved counts are 20 full registrations, 3 partial registrations and 17 media-only recoverable legacy drafts; the recovered draft now belongs to a partial registration. One additional genuine partial arrived during this work and was preserved. No missing storage references remain.

The remaining media-only legacy leads have no independently supplied text evidence. Their fields were not invented or merged. The recovered merchant still needs its deferred evidence document. Function sources match live deployments: intake v13, admin v15.
