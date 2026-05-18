# Phase 6 — PolicyLens corpus audit-with-evidence

You are auditing 837 entries in the PolicyLens product catalogue that need
verification against official sources. **The previous phases of this project
produced 99+ fabricated entries** — your job is to NOT add to that count. Every
verdict you return MUST cite a primary source with a direct quote.

## Background

PolicyLens has been through 5 phases of deep-research catalogue building, growing
from a few hundred entries to 3,303 across 49 insurers. A verification pass against
10 PPF (Policy Owners Protection Scheme) registers found:
- 2,113 entries verified ✓
- 324 not found in their insurer's register (Phase 6A)
- 866 from insurers without committed register coverage (Phase 6B — 513 after
  excluding banks/brokers/robo-advisors which use a different audit model)

## Your task — two tracks

### Phase 6A — Verify 324 against PPF registers (attached as text)

Input: `phase-6A-not-found-audit.json`
Resource: `ppf-registers/*.txt` (10 register files, all pre-extracted from PDFs)

For each entry, look up the insurer's register file and determine the verdict.

### Phase 6B — Verify 513 against insurer websites (no register attached)

Input: `phase-6B-no-register-audit.json`
Resource: Public insurer websites (URLs listed in README.md)

For each entry, locate the product on the insurer's official site (preferred:
their PPF/SDIC register page; acceptable: product brochure or "list of products"
page).

## Verdict format

For EACH entry in the input, output ONE verdict object in your output JSON:

```json
{
  "canonicalName": "<exact name from input>",
  "insurer": "<exact insurer from input>",
  "verdict": "keep" | "rename" | "delete" | "split" | "defer",
  "category": "<from schema enum>",
  "subType": "<from schema enum>",
  "registerLineQuote": "<exact text from register file or web page>",
  "sourceUrl": "<file path for register OR URL for web>",
  "sourcePageNum": null | <number for PDF pages, if applicable>,
  "reason": "<1-3 sentence explanation>",
  "confidence": "high" | "medium" | "low"
}
```

### Verdict meanings

- **`keep`** — Entry exists in the register/source under approximately this
  name. Provide the exact line quote that proves it. Set category/subType
  based on what the register tells you.
- **`rename`** — Entry exists but our canonicalName is wrong/imprecise.
  Provide `correctName` field with the proper form; keep canonicalName as
  the alias.
- **`delete`** — Entry does NOT appear in any official source after thorough
  search. Provide reason. Explain what search terms / pages you checked.
- **`split`** — Entry is a slash-joined family that should be split into
  separate canonical entries. Provide `variants` array, each with full
  classification + quote.
- **`defer`** — You cannot find evidence either way. Specify exactly what
  needs manual checking. Don't use this as a default; only when truly stuck.

### Schema enums (STRICT — entries with invalid sub-types are rejected)

**Categories**: `protection | health | maternity | savings | retirement | investment | cash_investments | other_assets`

**Sub-types by category**:
- protection: Term Life · Whole Life · Universal Life (UL) · Indexed UL (IUL) · Variable UL (VUL) · Critical Illness · Early Critical Illness · Personal Accident · Disability Income · Long-term Care · ILP (Protection) · Premium Waiver
- health: Integrated Shield Plan · Shield Rider · Hospital Income · CareShield Life / Supplement · ElderShield 300 · ElderShield 400 · Long-term Care
- maternity: Maternity Coverage
- savings: Endowment · Lifetime Endowment · Education Plan · Short-term Endowment
- retirement: Retirement Income (Par WL) · Annuity · CPF Life · Income Plan · Retirement
- investment: ILP (Investment) · Unit Trust · Single Premium Investment
- cash_investments: Fixed Deposit · T-bill · Singapore Savings Bond · Corporate Bond · Money Market · Cash Management · Structured Deposit · Fixed Coupon Note (FCN) · Equity Linked Note (ELN)
- other_assets: Property · Stocks/Equities · Brokerage Account · Regular Savings Plan (RSP) · Gold/Precious Metals · Fixed Coupon Note (FCN) · Equity Linked Note (ELN) · Options/Futures · Cryptocurrency · Art/Collectibles · Other

## Known traps from previous phases

1. **Phase 2 fabrication pattern**: 99+ entries cited a generic PPF register URL
   with identical boilerplate notes ("Legacy or rider entry captured for gap-fill")
   and were all fabrications. Do NOT generate boilerplate. If unsure, defer.

2. **"Rider" appended to base plan names**: GE register has "Great Wealth
   Multiplier 3" (a base plan) — there is no "Wealth Multiplier Rider". The AI
   may have appended "Rider" to base plan names incorrectly. Check the register's
   category column: CAT 1 = riders/add-ons, CAT 2 = main plans.

3. **Truncated parentheticals**: Entries like "FWD Car Insurance (Classic" or
   "Singlife current : ^Singlife\s+..." are corpus-text-parser artifacts —
   always `verdict: "delete"`.

4. **Slash-joined families**: "Plan A / Plan B / Plan C" needs `verdict:
   "split"` with separate variants, not single keep verdicts.

5. **Maternity sub-type**: Always `Maternity Coverage`, never "Maternity".

6. **Premium Waiver / Payer Benefit riders**: Use `protection/Premium Waiver`.
   These waive premiums on payer's Death/TPD/CI events. Distinct from CI (which
   pays lump sum) and Disability Income (which pays income).

7. **Shield Riders attach to ISPs**: Use `health/Shield Rider`. These are NOT
   listed in PPF registers (they're MOH-listed under the IP scheme). For HSBC,
   Income, GE, Prudential Shield Riders, check the MOH IP register or the
   insurer's IP product pages, not the PPF register text.

8. **Legacy pre-PPF products**: Some entries are real legacy products that
   pre-date the PPF register. If you find ONE credible historical reference
   (insurer's product history page, archived brochure, regulatory filing),
   `verdict: "keep"` with the URL.

## Output

Two files:
- `phase-6A-verifications.json` — for Phase 6A entries (324 total)
- `phase-6B-verifications.json` — for Phase 6B entries (513 total)

Each file structure:
```json
{
  "metadata": {
    "phase": "P6A" or "P6B",
    "researcher": "Claude Co-Work" or "GPT-5.5 Pro",
    "generatedAt": "<ISO timestamp>",
    "registersUsed": ["aia.txt", "ge.txt", ...]
  },
  "summary": {
    "totalChecked": <number>,
    "keep": <number>,
    "rename": <number>,
    "delete": <number>,
    "split": <number>,
    "defer": <number>
  },
  "verifications": [ ...array of verdict objects... ]
}
```

## Start order

**Phase 6A first**, working through the largest-count insurers:
1. Singlife (70 entries) — check `ppf-registers/singlife.txt`
2. Great Eastern (49) — check `ge.txt`
3. AIA (46) — check `aia.txt`
4. NTUC Income (37) — check `income.txt`
5. HSBC Life (31) — check `hsbc-life.txt`
6. Manulife (31) — check `manulife.txt`
7. Prudential (27) — check `prudential.txt`
8. FWD (15) — check `fwd.txt`
9. China Life (10) — check `china-life.txt` (note: only 80 lines, partial)
10. Tokio Marine (7) — check `tokio-marine.txt`
11. China Life (Singapore) (1)

**Phase 6B second**, smaller groups can run in parallel between Co-Work and
ChatGPT 5.5 Pro since we dedup at assimilation time:
1. Etiqa (124) · China Taiping (89) · Raffles Health (53 + 12 + 3)
2. MSIG (45) · Sompo (34)
3. HNW offshore: Manulife Bermuda (20) · Transamerica Bermuda (20) · Quilter
   International (14) · FPI (13) · Sun Life HK (10) · Hansard (10)
4. Smaller: Liberty (20 + 13 + 2) · Allianz (16) · HL Assurance (9) · Zurich
   International Life (7) · Generali (2)

Expected total runtime: 6A ~3-4 hours, 6B ~4-5 hours. Run in parallel where
possible.
