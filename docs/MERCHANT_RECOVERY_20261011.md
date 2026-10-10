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

Browser and live-endpoint verification results are recorded after deployment.
