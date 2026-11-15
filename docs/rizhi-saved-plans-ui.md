# Saved Revision Plans UI

This node implements the approved M4 archive surfaces: `/plans`, `/plan/:id`,
and a personal-center entry. It uses the current report/personal-center visual
language and introduces no new grading or generation workflow.

## Account And Scope

Plan reads require the captured login account and token. The service checks
both before dispatch and before adapter success or failure reaches shared
interceptors. Development identity and global page-child headers are removed;
only `profile_id` query scope is supplied explicitly. Plan routes do not receive
the generic timestamp query parameter. Account/route changes abort old requests
and clear rendered data. An explicit child link does not mutate the selected
global child or report shortcuts.

## Saved Content

The list shows one latest saved version per family with title, subject, child
scope, source period and saved date. Pagination uses 20-row offset pages.
Details show the saved goal, version, capture time, overview, evidence-supported
observations, optional suggestions and limitations separately. A version menu
reads immutable versions; opening the page never invokes generation or changes
the saved plan. All model text is escaped React text, not HTML or Markdown links.

The API response must match `revision_plan.v1`, plan/profile identity and the
requested version. Existing parent-report validation checks frozen facts;
subject, source dates and capture timestamp must match plan metadata. Priority
evidence IDs resolve only within those validated facts. Unknown content fields,
missing arrays, duplicate/unknown evidence and oversized content are rejected.
Provider/model and metric identifiers are displayed provenance, not executable
schema selectors; the explicit content/facts contracts govern rendering.

## States And Remaining Work

Loading, empty, unavailable, deleted/unauthorized, invalid link and retry states
must be distinct. Stale success/errors cannot repopulate a new account or reset
its authentication. Source-conversation deletion does not hide a saved plan.

Assistant proposal/confirmation, pinned-version discussion and explicit update
generation are separate nodes. Do not expose placeholder controls for them.
Real Ark quality and Ego Lite desktop/mobile checks remain release gates.
Only Ego Lite may be used; do not operate user-delegated space 10 until handed
back. These pages do not prove complete M4 or whole-upgrade acceptance.
