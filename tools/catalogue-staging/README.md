# Catalogue staging directory

Drop JSON files here from Claude Co-Work / ChatGPT 5.5 deep-research runs (per
the brief dated 2026-05-17).

Then run from the PolicyLens root:

```bash
npm run assimilate:catalogue           # dry-run — validates + emits reports
npm run assimilate:catalogue:apply     # writes corpus additions to PolicyLens_Singapore_Reference/
npm run assimilate:selftest            # validates the pipeline itself
```

Outputs land in `../catalogue-output/`:

- `assimilation-report-<ts>.json` — top-level summary
- `conflicts-<ts>.json` — numbered conflicts for review
- `new-entries-<ts>.json` — all entries that don't match any existing record
- `corpus-additions-<ts>.txt` — append-able text rows for the SG reference corpus
- `seed-repository-patch-<ts>.js` — ready-to-paste JS object literals for
  `SEED_REPOSITORY` in `src/index.babel.html` (only high-confidence entries with
  notes ≥80 chars)

Both this directory and the output directory are git-ignored — only the
pipeline tool itself is committed.
