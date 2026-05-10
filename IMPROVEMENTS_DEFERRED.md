# Deferred report improvements

Four items from the v2.4.0-rc1.83-rc1.85 batch were deliberately deferred because each needs a small design decision that's faster to discuss than to guess wrong, or a focused session that shouldn't be conflated with unrelated changes.

This file is the handoff. Each section ends with the exact decision needed before code starts.

---

## 1. Consolidate the two PDF generators behind shared helpers

**Why deferred:** This is a structural refactor of ~50 lines of helper definitions duplicated across two ~2000-line generator functions. It carries real regression risk (subtle helper differences between the two generators may matter), so it needs to land as its own commit on a quiet branch — not on top of 8 other improvements where any regression becomes hard to bisect.

**The duplication.** Both `generateVisualReport` (individual) and `generateFamilyVisualReport` (family) define their own copies of the same 12+ helpers, with subtle drift:

| Helper | Individual | Family | Notes |
|---|---|---|---|
| `pdfSafe` / `cleanPdfText` | both names alias each other | both names alias each other | symmetric ✓ |
| `setFont` / `font` | both names alias each other | both names alias each other | symmetric ✓ (since rc1.80) |
| `text` / `write` | individual uses `text`, signature returns `lines.length * lineH` | family uses `write`, signature returns same | NOT aliased — copy-paste from one to the other will break |
| `n` | identical | identical | trivial dedup |
| `safe` | uses `pdfSafe` directly + slice ellipsis | uses `cleanPdfText` + Math.max(0,...) for ellipsis | minor logic difference |
| `money` | uses `n` directly, formats S$, k/M shortening | adds `blankZero` opt + same | family is a strict superset |
| `pct` | not present in individual | `(a,b) => b > 0 ? Math.max(0, Math.min(100, ...))` | family has, individual rolls inline |
| `label` | individual: `text(s.toUpperCase(), {size:6.4, bold})` | family: `write(s.toUpperCase(), {size:5.8, bold})` | DIFFERENT default sizes |
| `card` | identical | identical | trivial |
| `pill` | both use the same pattern | both use the same pattern | minor color-map differences |
| `bar` | identical | (no equivalent — family doesn't have a bar helper) | individual-only |
| `footer` | individual has TOC strip + page numbering (rc1.85) | family has different footer (`drawFooters`) | DIFFERENT |

**Plan when picking this up:**

1. Create `createReportEngine(doc, T_color, T_bw, opts)` factory. Returns a frozen object exposing all helpers. Lives at module scope, NOT inside the generator function.

   ```js
   const createReportEngine = (doc, palette, options = {}) => {
     const T = options.printMode ? palette.bw : palette.color;
     const pdfSafe = (s) => { /* ...canonical impl... */ };
     const cleanPdfText = pdfSafe;  // perma-alias
     const safe = (s, max=48) => { /* canonical merge of both impls */ };
     const n = (v) => { /* ...trivial... */ };
     const money = (value, opts={}) => { /* family's superset impl */ };
     const pct = (a, b) => b > 0 ? Math.max(0, Math.min(100, Math.round(n(a)/n(b)*100))) : 0;
     const setFont = (family='helvetica', style='normal', size=8, color=T.text) => {...};
     const font = setFont;  // perma-alias
     const text = (s, x, y, opts={}) => { /* with the rc1.83 fontStyle fallback */ };
     const write = text;  // perma-alias for family copy-paste
     const label = (s, x, y, color=T.text3, size=6.4) => text(pdfSafe(s).toUpperCase(), x, y, {size, style:'bold', color});
     const card = (x, y, w, h, fill=T.surface, stroke=T.border, r=3) => {...};
     const pill = (s, x, y, tone='primary', opts={}) => {...};
     const bar = (x, y, w, h, pctValue, color=T.primary) => {...};
     return Object.freeze({ T, pdfSafe, cleanPdfText, safe, n, money, pct, setFont, font, text, write, label, card, pill, bar });
   };
   ```

2. In each generator, replace the inline helper block with:

   ```js
   const eng = createReportEngine(doc, { color: T_COLOR, bw: T_BW }, { printMode });
   const { T, pdfSafe, safe, n, money, pct, setFont, font, text, write, label, card, pill, bar } = eng;
   ```

3. Test plan (CRITICAL — don't skip):
   - Generate Individual report with a real client. Visual diff against pre-refactor PDF (page-by-page).
   - Generate Family report with multi-member dataset. Visual diff.
   - Both with `printMode: true` and `printMode: false`.
   - Both with each non-baseline scenario.
   - Empty client / empty family edge cases.
   - The "label" size difference between generators (6.4 individual vs 5.8 family) MUST be preserved — pass an explicit `size` arg from each call site, or accept that the family report will visually shift slightly and document it.

4. The `footer` helpers are different enough that they should NOT go in the engine — leave them generator-local. Same for any draw* helpers (drawInflationBridge, drawStrategyGroup, drawFamilyMemberRow) that are page-layout-specific.

**Estimated effort:** 2-3 hours (1 hour extraction, 1 hour visual regression testing, 30min cleanup).

**Decision needed:** None — the plan above is sound. Just needs an uninterrupted block of time on a fresh branch.

---

## 2. "What changed since last review" page

**Why deferred:** Needs a storage-layer decision that affects schema migrations.

**Open questions:**

a) **Where to store snapshots.**
   - Option A: hub `policylens.report_snapshots` table on ckgtools-admin Supabase. Per-user, RLS-protected, durable, queryable. Adds a new schema migration. Right answer for advisor multi-device use.
   - Option B: local IndexedDB only. No backend changes. Doesn't survive device wipe / browser reset. Right answer if "snapshots" are seen as a UI nicety, not a data record.
   - **Recommendation: A.** Snapshots are the data record of advice given over time — they belong in durable storage.

b) **What to capture per snapshot.**
   - Minimal: `{client_id, taken_at, score, monthly_gap, total_cover, total_premium, scenario, advisor_email}` — small (50 bytes per snapshot), enough for the "what changed" diff.
   - Full: also include the underlying KPI rows (per-area gap %, per-policy line items) so the diff page can show "added Term Life S$500k since last review". Larger (~5KB per snapshot, JSON), more useful.
   - **Recommendation: full.** Storage is cheap, the "added X policy" diff is the killer feature.

c) **When to auto-snapshot.**
   - On every PDF generation (busy storage, but always have a record).
   - Only on explicit "Save baseline" button (clean, but easy to forget).
   - On PDF generation IF it's been >30 days since the last snapshot (lazy, debounced).
   - **Recommendation: third option.** No advisor UI burden, snapshots stay sparse and meaningful.

**SQL sketch (Option A + full + lazy):**
```sql
create table policylens.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  taken_at timestamptz not null default now(),
  scenario text not null default 'baseline',
  kpi_summary jsonb not null,         -- {score, monthly_gap, total_cover, total_premium}
  detail jsonb not null,              -- full report data dump for diffing
  pdf_filename text                    -- optional pointer to the saved PDF
);
alter table policylens.report_snapshots enable row level security;
create policy "snapshots are own user" on policylens.report_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index report_snapshots_user_client_taken on policylens.report_snapshots(user_id, client_id, taken_at desc);
```

**Decision needed:** confirm A + full + lazy (or specify alternative). Then ~3 hours: 30min schema migration + 1 hour snapshot save/load logic + 1 hour diff page rendering + 30min testing.

---

## 3. Save snapshot to Drive (with versioning)

**Why deferred:** Drive auth is wired (drive-auth-dev edge function refreshes tokens) but there's no existing "write file" code path. Needs a small folder-structure decision.

**Open questions:**

a) **Folder layout.**
   - Flat: `PolicyLens/<ClientName>_<Date>.pdf` — easy but pollutes the Drive root.
   - Nested: `PolicyLens/<ClientName>/<Date>_<ReportType>.pdf` — clean, scales, easy to share a single client folder. Recommended.

b) **Filename convention.**
   - Match the rc1.82 user-facing names: `Chan Chung Yin Individual Executive Review 2026-05-08.pdf` (date appended for uniqueness).
   - The current local Download names DON'T have the date (per rc1.82). Drive needs the date for versioning. So: same base name + ` <date>.pdf` suffix.

c) **Permission revocation handling.**
   - If the Drive token is invalid (revoked / expired beyond refresh): show toast "Drive permission lost — reconnect on the Settings tab" and fall back to local download. Don't silently fail.

d) **What to do on save.**
   - Generate the PDF in memory (`doc.output('blob')` instead of `doc.save(...)`).
   - Upload via Drive API `files.create` with multipart body.
   - Toast "Saved to Drive folder PolicyLens/Chan Chung Yin/" with an optional click-to-open link.

**Decision needed:** confirm nested layout + date-suffixed name + toast-with-link UX. Then ~2 hours: 30min Drive write helper + 1 hour UI integration + 30min error handling + testing.

---

## 4. Embed unicode font subset (Noto Sans) for non-ASCII names

**Why deferred:** Choosing a font + bundling strategy involves a build-size tradeoff that should be made deliberately.

**Why it matters:** jsPDF's built-in fonts (Helvetica/Times/Courier) are Latin-1 only. The `pdfSafe` helper currently strips non-ASCII so e.g. `François Müller` renders as `Francois Muller`. For a Singaporean market deliverable, names like `陈美莲` or `Tan Mei Lian (陈美莲)` get butchered.

**Open questions:**

a) **Which font.** Recommendation: **Noto Sans + Noto Serif** (Google Fonts, OFL license). Already a defacto unicode standard, pairs well with the existing Helvetica/Times-style aesthetic.

b) **Which subsets.**
   - Latin Extended (covers all European diacritics): ~80 KB per face. Cheap.
   - + CJK subset (Chinese / Japanese / Korean): adds ~3-5 MB per face. This is the elephant in the room.
   - **Recommendation: Latin Extended only by default. Lazy-fetch CJK on demand.** When pdfSafe detects non-Latin chars in client names, fetch the CJK font subset from a CDN before generation.

c) **Bundling strategy.**
   - Inline base64 in `index.html` (current PWA pattern): trivial to use, adds ~150 KB to the HTML for Latin Extended. Acceptable.
   - Lazy-load via `fetch` + `addFileToVFS`: keeps build small, but requires online for first use. Caches in IndexedDB after.
   - **Recommendation: inline the Latin Extended subset (always available, +150 KB to a 5 MB-ish HTML), lazy-fetch CJK subset (rare, mostly online use).**

d) **API surface.**
   - Add `useUnicodeFont(family, subset)` helper in the report engine.
   - At generator start: `await useUnicodeFont('NotoSans', detectScript(clientName));`
   - Update `pdfSafe` to ONLY strip when no unicode font is loaded (not always).

**Decision needed:** confirm Noto + Latin-inline + CJK-lazy. Then ~4 hours: 1 hour font subsetting (use [`google-webfonts-helper`](https://gwfh.mranftl.com/) or `fonttools`), 1 hour jsPDF integration, 1 hour pdfSafe rewrite, 1 hour testing across name variants.

---

## Summary

All four items are doable. None of them are doable as a 5-minute drop-in. They've been written up here so anyone (including me later) can pick them up cleanly without re-discovering the design space.

| Item | Effort | Blocker |
|---|---|---|
| #1 Consolidate generators | 2-3h | None — just needs a quiet block |
| #2 Snapshot diff page | 3h | Schema decision (A/B above) |
| #3 Save to Drive | 2h | Folder layout decision |
| #4 Unicode font | 4h | Font + bundling decision |
