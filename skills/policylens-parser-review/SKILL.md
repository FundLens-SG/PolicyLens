---
name: policylens-parser-review
description: Use when editing PolicyLens document parsing, OCR extraction, policy field mapping, generated summaries, or policy review output.
---

# PolicyLens Parser Review Skill

## Purpose
Protect policy extraction accuracy.

## Rules
- Preserve raw extracted values.
- Do not overwrite raw parser output with formatted values.
- Do not fabricate missing policy values.
- Mark uncertain fields as uncertain or missing.
- Keep policy number formatting stable.
- Keep currency, dates, premium mode, and coverage values clear.
- Avoid aggressive normalisation unless the field is clearly identified.

## Field handling
For each extracted field, check:
- source value
- formatted value
- confidence
- missing/unknown state
- whether it belongs to policy owner, life assured, payer, or beneficiary

## High-risk fields
- policy number
- policy owner
- life assured
- premium amount
- premium frequency
- sum assured
- cash value
- surrender value
- beneficiaries
- riders
- policy start date
- maturity date
- premium end date

## Verification
Test with:
- complete policy document
- document with missing values
- document with multiple insured persons
- document with riders
- document with tables
- document with poor formatting

## Final answer
Include:
- extraction logic changed
- field mappings changed
- test documents or scenarios checked
- fields that remain uncertain
