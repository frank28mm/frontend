# Report Confirmation Client

## Contract

Only canonical assistant messages may supply a report confirmation. Validate its
conversation, source turn, frozen child/subject/dates, version and cost. Opening
history queries its status; it never executes a proposal automatically.

An explicit execution persists the account, confirmation and source identifiers
plus the fixed version body before POST. A synchronous lock blocks duplicate
execution and conflicting conversation operations. Unknown outcomes query the
same confirmation first; retry requires another explicit user action and reuses
the original identifier. No report task or coupon is inferred from a network
error. Frozen eligibility/quota is a preview, not a permanent client-side gate.

Recovery must survive token refresh and account switching without exposing one
account's messages to another. Missing source history is not proof that execution
failed: query the owned confirmation independently. Do not fabricate a message or
automatically resend a generation request. Reads and writes fence late responses
against account/token, conversation and request generation changes.

## Selected Child Navigation

Report/job links preserve the proposal's selected child in `profileId` without
changing the global active child. The backend remains authoritative for ownership
and child authorization. Invalid explicit scope fails closed. Explicit child jobs
do not update default-child Home shortcuts. Existing default report routes keep
their behavior.

## Acceptance

- Canonical-message validation; no invented model action or cross-turn proposal.
- Double-click and mutation lock; storage refusal before POST.
- Unknown result: GET-only refresh, explicit same-ID retry, definitive rejection.
- Source deletion/archive and authentication-change recovery.
- Late and out-of-order GET/POST must not revive pending or cross identity.
- Selected-child job completion and report reload, including stale 401 isolation.
- Full Vitest, lint and build; independent review, then Ego Lite desktop/mobile.

Natural-language confirmation is a later backend node. This client stage does not
enable production flags or claim real Ark/browser acceptance. Keep the existing
React visual style and do not alter Shizhi tutoring.
