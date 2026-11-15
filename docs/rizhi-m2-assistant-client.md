# M2 account assistant client

## Implemented

- Typed client for the Core `rizhi.assistant.v1` contract: conversation list,
  detail/history pagination, rename/archive/delete, send/poll turn, references.
- Assistant routes use account token authentication. They never inherit the
  development user header or the page's selected child header.
- Strict assistant GET routes receive only supported query parameters; the
  shared client's timestamp cache parameter is not added to these routes.
- All responses require the supported contract version. No mock assistant
  responses or automatic report generation are introduced.
- The caller owns the request ID. Retrying an uncertain POST must reuse the
  identical request ID and body; changing either is a new request.
- AbortSignal reaches Axios. Cancelling a request does not cancel an accepted
  server turn; the UI must recover it through polling/history.

## Evidence (2026-10-11)

- Added seven transport tests, including account/page isolation, request
  identity, management methods, reference pagination, cancellation and version.
- Red phase: all five initial tests failed against unimplemented operations.
- `npm test -- --run`: 32 files, 348 tests passed. Existing suite emits warning
  and intentional error-path logs; this is not a warning-free run.
- `npm run lint`, `npm run build`, `git diff --check`: passed. Vite reports an
  old Browserslist dataset; no unrelated dependency refresh was performed.

## Conversation Host and State

- `AssistantHost` is outside the pathname-keyed router transition. Closing the
  panel or navigating between authenticated pages does not create a new chat.
- `VITE_ASSISTANT_ENABLED=true` is required; the default build hides the host.
  Login/admin routes never display it. This is separate from the Core opt-in gate.
- Plain text/formula blocks use existing MathText; clarification choices and
  mistake references remain separate blocks. References only link same-origin
  question routes whose question/submission identity matches the server record.
- Active/archived conversation lists, rename/archive/delete confirmation, older
  message pagination, canonical send/poll, and errors are implemented.
- Tab-scoped recovery stores only the selected conversation and unresolved
  request/turn metadata, not a second copy of full message history. Uncertain
  POST retries reuse the exact input; accepted turns resume by ID and load
  canonical user/assistant messages. An auth identity change aborts old work,
  clears the old recovery record and fences late responses.
- Historical messages now expose their own `turn_id` in Core. Reference paging
  uses that original turn rather than the conversation's most recent scope.
- Existing product logo is a temporary identity asset, not the approved
  independent character design. No grading or question-tutor logic is changed.

### Host Verification

- 13 hook tests and five host tests cover canonical send/recovery, identical
  uncertain retries, historical scope pagination, archive restrictions, login
  exclusion, account-change fences and definitive rejection escape paths.
- Independent review identified stuck rejected requests, delayed conversation
  loads overwriting accepted replies, and same-question/different-submission
  navigation reusing old evidence. Each was reproduced by a failing test and
  fixed. A scoped QuestionDetailRoute remounts only the destination question
  page on submission identity changes; assistant state stays outside it.
- Second independent review found no unresolved issue in the rechecked diff.
- Latest full frontend run: 35 files / 367 tests passed; build passed. Existing
  test logs/Browserslist warning remain as recorded above.
- Core assistant/API/App race tests passed with TestLegacyParityContract
  explicitly excluded: the full attempt fails because archived Python source
  is missing. Core vet passed. The historical-message TurnID regression passes.

## Existing Report References

- `report_references` messages render existing reports, separate from generating
  a new report. Counts, generation times and covered learning dates are shown
  separately; unknown coverage is not guessed.
- Pagination uses the message's original `turn_id` through
  `/assistant/turns/{turn_id}/reports`, with account-token/version checks,
  cancellation, bounded concurrent loading and retry of the same cursor.
- Fixed same-origin report links match Go PathEscape, including legacy
  punctuation. Unsafe path segments remain unavailable. Known IDs deduplicate;
  distinct unavailable legacy entries with empty IDs remain visible.
- Component regressions cover paging, dates, abort/retry, identity and safe
  links. Review found escaping and empty-identity collapse defects; failing
  tests reproduced both before their fixes.
- No report generation, coupon deduction or production gate change is made.
- ReportDetail decodes the original pathname segment once and encodes the API
  request identity, preserving legacy query/hash/literal-percent IDs. Seven
  real-router/transport regressions failed before the fix and now pass.
- Final integration regression: 37 files / 407 tests, full lint and build pass.
  Existing warning/error-path test logs and Browserslist warning remain.

## Explicit Failed Reply Retry

- `conversation.latest_turn` restores failure state when history is reopened or
  the page refreshes. Failed GET returns the canonical original user message.
- `重新尝试回复` sends identical canonical text in the same conversation with a
  new request ID and `retry_of_turn_id`; it never invents a message identity.
  Network `重试连接` reuses the unresolved request/turn, not another model call.
- The source failure remains visible. Loading, double clicks, account changes,
  logout and archived conversations fence retries. No automatic model retry
  or generated-artifact authorization is introduced.
- Core schema17 preserves original relative-date anchors through retry chains
  and subsequent model history while retaining actual audit timestamps.
- Independent review reproduced concurrent archive/rename and deletion leaving
  stale selected content. Mutation locking and unconditional deletion cleanup
  now have deferred-response regressions, including lock release on failure.
- Full frontend regression: 37 files / 428 tests, lint and build passed.
  Core assistant/storage/API/App race, vet and build passed, explicitly skipping
  the missing archived Python `TestLegacyParityContract`. Build logs a sandbox
  module-cache write warning despite exit zero. Live Ark/Ego acceptance is not
  implied by these automated results.

## Remaining Acceptance

The host implementation is not yet the completed/accepted assistant product.
Remaining: live Core and Ark integration;
statistics presentation and generated-artifact tools;
desktop/mobile acceptance in Ego Lite only; distinct approved character
assets. A local frontend server on `127.0.0.1:4184` has been started with the
frontend gate enabled, but its configured Core proxy (`8000`) is not listening;
this is not a usable real-model acceptance environment yet. The user's
handed-off browser TaskSpace must not be reclaimed without permission.

No production feature gate is enabled by this change. No upgrade PR is merged
or deployed. Existing grading and question tutor flows remain separate.
