# PolicyLens Refinement Notes From Architecture Research

Source research folder: `C:\Users\user\Desktop\CKGTools-Architecture-Research`

Last reviewed: 2026-05-16

## Design Direction

PolicyLens should keep acting as the specialist extraction and policy-review engine, while CRMLens becomes the regulated system of record. Future PolicyLens work should avoid making the extracted policy object the only truth. Instead, extraction should move toward:

- document intake with sha256 deduplication;
- extraction runs with model/prompt version stamps;
- per-field evidence with page, bounding box, raw text, confidence, and model version;
- reviewer-gated field suggestions;
- approved facts that cannot be silently overwritten after advisor verification;
- policy coverages/riders as structured children of the parent policy, not flattened strings.

## Immediate Product Principles

1. No silent auto-apply for regulated facts.
   Extracted values may be prefilled, but the advisor's accept/edit action should be the moment a fact becomes trusted.

2. Evidence must survive extraction.
   Every important field should eventually be traceable back to source text, page, and model output. `_extractedRaw` is useful, but not enough for audit-grade review.

3. Participant roles are first class.
   A policy can involve an owner, life insured, payer, beneficiary, trustee, or sheet/document owner. Routing logic should preserve those roles instead of collapsing them into one client name.

4. Riders and coverages belong under the main policy.
   Integrated Shield Plan riders, life riders, waiver riders, and ILP funds should be stored as structured child records/arrays during the transition, then mapped to canonical `policy_coverages` / `policy_funds` later.

5. PolicyLens should not invent canonical identity long term.
   It can propose a client or policy from documents, but the target architecture has CRMLens assigning canonical party and policy IDs.

6. Verified fields outrank extraction.
   Sync code should treat `advisor_verified` and `client_signed_off` values as protected. Any automated update that disagrees should become a conflict/review item.

## Near-Term PolicyLens Backlog

### Phase 1: Stabilise Current Extraction

- Continue adding fixture-based regression tests for real FC workbooks and insurer statements.
- Keep ISP/rider coalescing deterministic and testable.
- Emit coalescing warnings instead of failing silently when rows look ambiguous.
- Expand extraction tests to cover multi-owner spreadsheets, OCR typo names, rider continuations, and malformed premium cells.
- Keep bumping extraction pipeline/cache versions when parser behavior changes.

### Phase 2: Make Evidence Reviewable

- Introduce a lightweight `extraction_runs` object in the current local model.
- Store per-field evidence records alongside imported policies, even before the canonical database exists.
- Add reviewer UI affordances: "show source", field confidence, and source text snippet.
- Add model/prompt version to every extraction result.

### Phase 3: Prepare For Canonical Data

- Add transitional mappers from current PolicyLens policy JSON to:
  - policy participants;
  - policy coverages/riders;
  - policy funds;
  - policy events;
  - approved facts / field suggestions.
- Preserve unknown/blank distinction. Do not normalise explicit `unknown` into empty.
- Avoid new features that deepen dependence on `riders_json`, flat policy rows, or Drive folder names as identity.

### Phase 4: Sync With CRMLens Safely

- Produce `clients-manifest.json` from PolicyLens Drive data so CRMLens can stop walking every folder.
- Adopt symmetric field-version rules once CRMLens supports them.
- Never push a PolicyLens extraction over an advisor-verified CRMLens value; create a conflict/review item instead.
- Treat PolicyLens-originated policies as proposals until linked to canonical CRMLens policy IDs.

## Guardrails For Future Changes

- Parser fixes should include a fixture or harness test before commit.
- Any new AI output field should include confidence and evidence placeholders, even if bbox support is not complete yet.
- Any new sync path should include source, actor, timestamp, and version metadata.
- Any new review recommendation should cite the policy/finding/evidence that generated it.
- Avoid broad rewrites of the 5 MB SPA until the regulated data backbone is clearer; extraction correctness and evidence come first.

## Highest-Leverage First Moves

1. Worker fail-closed + rate limit.
2. `clients-manifest.json` producer in PolicyLens.
3. Extraction run metadata and model/prompt stamps.
4. Per-field evidence persistence for uploaded documents.
5. Side-by-side reviewer foundation once evidence exists.
6. Canonical coverage/rider mapper, starting with ISP riders because that is already causing real user-visible issues.
