# PPF Register reference data

Text extracts from each insurer's PPF (Policy Owners' Protection Scheme) register
PDF. Used by `tools/verify-against-registers.mjs` to cross-check the corpus.

## Source URLs (refresh periodically)

| File | Source URL | Pages | Notes |
|---|---|---|---|
| `aia.txt` | https://www.aia.com.sg/content/dam/sg-wise/en/docs/help-support/aia-singapore-register-of-insured-policies-life-fund.pdf | — | WebFetch + curl timeout; Chrome same-origin fetch worked |
| `ge.txt` | https://www.greateasternlife.com/sg/en/customer-services/insurance-guides/register-of-insured-policies-great-eastern-life-singapore-pdf.html | — | Main GE PPF register |
| `manulife.txt` | https://www.manulife.com.sg/content/dam/insurance/sg/insurance-guides/register_of_insured_policies.pdf | — | **MISSING** — Chrome renders inline, no auto-download. Manual download required. |
| `prudential.txt` | https://www.prudential.com.sg/-/media/project/prudential/pdf/claims-and-support/sdic-register-for-website.pdf | — | |
| `singlife.txt` | https://singlife.com/content/dam/public/sg/documents/documents/ppf-scheme-register-life.pdf | — | Includes legacy Aviva products |
| `income.txt` | https://www.income.com.sg/getContentAsset/1a5cc9a7-4e4d-463d-b13e-169cd728b0bd/05c6012c-3879-4f1c-b994-00e61e65c363/Life-PPF-Register-01Apr2026.pdf | — | NTUC Income / Income Insurance (rebrand) |
| `hsbc-life.txt` | https://www.insurance.hsbc.com.sg/content/dam/hsbc/insn/documents/customer-service/list-of-policies-under-policy-owners-protection-scheme.pdf | 24 | Excludes Shield Riders (those are MOH-listed separately) |
| `fwd.txt` | https://www.fwd.com.sg/wp-content/uploads/2026/02/List_of_Insured_Policies-PPFL_FWD-as-at-20260210.pdf | — | |
| `tokio-marine.txt` | https://www.tokiomarine.com/content/dam/tokiomarine/sg/life/about-us/ppf/TMLS%20-%20PPF%20Register%20of%20Products%20%28updated%20as%20of%2028%20Apr%202026%29_v1.pdf | 7 | |
| `china-life.txt` | https://www.chinalife.com.sg/sites/default/files/2025-02/Register%20of%20Insured%20Policies%20-%20China%20Life%20Insurance%20%28Singapore%29%2020250214%20-%20ENG_updated.pdf | — | Currently only 80 lines extracted — likely incomplete or PDF has heavy image content |

## Missing registers (entries unverifiable)

- **Manulife** — Chrome PDF viewer renders inline, can't programmatically download. Need manual save.
- **China Taiping** — URL https://www.sg.cntaiping.com/sites/taiping_sg/files/2024-07/List_of_Insured_Policies-Life_23-July.pdf returns 404
- **Etiqa** — 403 Forbidden from automated requests
- **Raffles Health** — Shield Riders are not in PPF registers (they're MOH-listed IP riders, separate registration)
- **Liberty / MSIG / Sompo / HL Assurance / Allianz / Generali** — most are GI carriers, limited life-rider coverage to verify

## Re-running

```sh
# Extract PDF → text
"C:/Program Files/Git/mingw64/bin/pdftotext.exe" -layout aia.pdf aia.txt

# Run verification
node tools/verify-against-registers.mjs --riders-only
node tools/verify-against-registers.mjs --insurer "AIA"   # one insurer
node tools/verify-against-registers.mjs                    # full corpus
```

Output lands in `tools/verification-output/` with timestamped JSON files
(verified / not-found / no-register).
