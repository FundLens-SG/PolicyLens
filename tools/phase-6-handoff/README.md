# Phase 6 audit hand-off package

Self-contained bundle for Claude Co-Work + ChatGPT 5.5 Pro. Includes all inputs
needed to verify the 324 not-found + 513 no-register entries against official
sources WITHOUT requiring PDF extraction tooling.

## Contents

```
phase-6-handoff/
├── README.md                                   # this file
├── BRIEF.md                                    # the audit brief
├── phase-6A-not-found-audit.json              # 324 entries to verify (input)
├── phase-6B-no-register-audit.json            # 513 entries to verify (input)
└── ppf-registers/                              # pre-extracted register text
    ├── aia.txt           (~45 KB,  810 lines)  # AIA Singapore Life Fund
    ├── ge.txt            (~88 KB, 3,947 lines) # Great Eastern
    ├── manulife.txt      (~34 KB,   863 lines) # Manulife Singapore
    ├── prudential.txt    (~26 KB,   353 lines) # Prudential Singapore
    ├── singlife.txt      (~24 KB,   354 lines) # Singlife (includes Aviva legacy)
    ├── income.txt        (~15 KB,   225 lines) # NTUC Income / Income Insurance
    ├── hsbc-life.txt    (~166 KB, 1,554 lines) # HSBC Life Singapore
    ├── fwd.txt           ( ~5 KB,   142 lines) # FWD Singapore
    ├── tokio-marine.txt  (~34 KB,   515 lines) # Tokio Marine Singapore
    └── china-life.txt    ( ~4 KB,    80 lines) # China Life (Singapore) — partial
```

## Key methodological notes (READ FIRST)

### For Phase 6A — PPF registers are ATTACHED as text

All 10 PPF registers have been pre-converted to plain text via `pdftotext -layout`
and are attached in `ppf-registers/*.txt`. Quote directly from these files.
**Do NOT attempt to fetch the PDF URLs** — those would require PDF tooling that
neither Co-Work nor ChatGPT 5.5 Pro reliably has. The pre-extracted text is the
canonical source for "registerLineQuote" fields.

When citing the register, use the file path as the source:
```
"sourceUrl": "ppf-registers/manulife.txt",
"registerLineQuote": "<line text from the file>",
"sourcePageNum": null  // page numbers don't apply to extracted text
```

### For Phase 6B — Tier B + HNW offshore

These insurers' registers are NOT included. For each entry, you need to either:

1. Find a public PPF register PDF (if you have PDF tooling) and quote from it
2. Find an insurer product page / brochure URL and quote from the HTML
3. If neither, use `verdict: "defer"` with explanation — do NOT fabricate

Acceptable sources for Tier B insurers (these insurers DO publish PPF registers):
- **Etiqa**: https://www.etiqa.com.sg/policy-owners-protection-scheme/
- **China Taiping**: https://www.sg.cntaiping.com/en/our-support/regulatory-guides/
- **Raffles Health**: https://www.raffleshealthinsurance.com/ppf-scheme/
- **MSIG**: https://www.msig.com.sg/about-msig/regulatory-policies/
- **Sompo**: https://www.sompo.com.sg/about-us/policy-owners-protection-scheme
- **Liberty**: https://www.libertyinternational.com/sg/ (look for PPF register)
- **Allianz**: https://www.allianz.sg/about-allianz/policy-owners-protection-scheme.html
- **HL Assurance**: https://www.hlas.com.sg/policy-owner-protection-scheme
- **Generali**: https://www.generali.com.sg/

Acceptable sources for HNW offshore (these do NOT have SG PPF registers but
have public product info):
- **Manulife (International) Bermuda**: https://www.manulife.com.hk/en/individual/products/
  (Indexed UL, Heirloom, Signature IUL — these are also marketed to SG HNW)
- **Sun Life Hong Kong**: https://www.sunlife.com.hk/en/about-us/our-products/
- **Friends Provident International**: https://www.fpinternational.com/
- **Old Mutual International / Quilter International**: https://www.quilterinternational.com/
- **Transamerica Life Bermuda**: https://www.transamericalifebermuda.com/
- **Hansard International**: https://www.hansard.com/

## How to use this bundle

1. Read `BRIEF.md` for the task description
2. Open `phase-6A-not-found-audit.json` — work through entries by insurer
3. For each entry, look up the corresponding register text file
4. Produce `phase-6A-verifications.json` with your verdicts
5. Repeat for `phase-6B-not-found-audit.json` → `phase-6B-verifications.json`
6. Hand both output JSONs back to the project lead

## Confidence levels — be honest

- **"high"**: Found exact name match in register text, OR found explicit product
  page that quotes the canonical name and describes its benefits.
- **"medium"**: Found name in register/insurer page but with minor variation
  (different punctuation, plural form, generational suffix). Confidence is
  medium because there's mild ambiguity.
- **"low"**: Found indirect references (e.g. third-party review, forum post,
  policyholder comparison site) but no primary source. Use this OR `verdict:
  "defer"` — your call based on the indirect evidence quality.

Avoid "low" except when actually low. Don't downgrade "high" to "medium" out of
caution — be precise about your confidence.
