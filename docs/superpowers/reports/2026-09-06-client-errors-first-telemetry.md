# First real `client_errors` telemetry — 2026-09-06

Recovered from the Client Error Telemetry workflow's execution history (`CPnstolvOjSGOm3z`) after the two rows (ids 6 and 9) were deleted during sub-project E's Task 8 live verification. Evidence preserved here because the hardening checklist's E section refers to it.

## The two reports

Both were produced by the real reporter through `apiJson` during two `npm run test:e2e:live` runs of `shop.live.spec.js` (CRA dev server, HeadlessChrome).

| Execution | DB row | client_time (UTC) | kind | screen | endpoint | status | stack_hash | session_id | app_version |
|---|---|---|---|---|---|---|---|---|---|
| 26528 | 6 | 2026-09-06T20:42:20.794Z | api | shop | shopping_progress_check | 0 | a35facf9 | 9f6f9bd6-dae2-4fee-b847-0389e6a51d61 | dev |
| 26584 | 9 | 2026-09-06T20:43:19.753Z | api | shop | shopping_progress_check | 0 | a35facf9 | e24ca59e-b926-4550-b9d0-25188af22dd1 | dev |

Message on both: `Network error — check your connection` (code `network`), empty stack, user agent `HeadlessChrome/153.0.8010.12`, week `For the week of September 6th to September 12th, 2026`.

## Assessment: benign live-spec teardown

`status: 0` means the browser never received an HTTP response: the in-flight `shopping_progress_check` POST was aborted when `shop.live.spec.js` reloaded the page mid-flow. Both timestamps land on the exact second of a page transition in the two runs, both share one stack hash, and the dev build plus headless user agent mark a Playwright run rather than a real user. A real backend fault would surface as a 4xx/5xx or as a `Respond 500/503` JSON from the A contract.

## Consequence

The same abort happens for a real user who reloads mid-request, and because `api` reports carry an empty stack their hash is stable across builds, so the first Slack line for that endpoint would have been a false positive. The final fix wave (commit `ec655ad`) drops `api`/`network` reports raised between `pagehide` and `pageshow`.
