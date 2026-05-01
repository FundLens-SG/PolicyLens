# code_review.md

Use this checklist before completing any task.

## Scope
- [ ] Did the change address the exact user request?
- [ ] Did it avoid unrelated UI/design/copy changes?
- [ ] Did it avoid unrelated refactors?
- [ ] Did it avoid unnecessary dependencies?
- [ ] Did it keep the change as small as safely possible?

## Data safety
- [ ] Did it preserve existing data?
- [ ] Did it preserve existing IDs?
- [ ] Did it preserve storage keys?
- [ ] Did it avoid accidental overwrites?
- [ ] Did it avoid accidental duplicates?
- [ ] Did it handle empty/null/undefined values safely?

## App behavior
- [ ] Did the affected flow work after the change?
- [ ] Did nearby existing flows still work?
- [ ] Did the page reload/persistence behavior still work?
- [ ] Did console remain free of new errors?
- [ ] Did mobile/responsive layout remain intact?

## Code quality
- [ ] Is the fix at the root cause instead of the symptom?
- [ ] Are function names and variables still clear?
- [ ] Is there duplicated logic that should be consolidated?
- [ ] Are edge cases handled?
- [ ] Are comments added only where useful?

## Final response format
The final answer should include:
1. Summary of the fix.
2. Files changed.
3. Tests/checks performed.
4. Any remaining risk.
