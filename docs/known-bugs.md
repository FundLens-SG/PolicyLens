# PolicyLens Known Bugs and Mistakes Log

Use this file to record bugs, causes, and lessons so Codex does not repeat the same mistake.

## Bug format

```md
## Bug: Short title

### Symptom
What the user saw.

### Root cause
Where the bug actually came from.

### Fix
What changed.

### Test
How it was verified.

### Lesson for Codex
What future agents must avoid.
```

---

## Bug: Duplicate family policies / new-client routing issue

### Symptom
Family policies or newly uploaded policies appeared under the wrong client or appeared as duplicates.

### Likely root cause areas
- savePolicy and savePolicyForClient routing overlap.
- selected client state may be stale.
- new-client and existing-client flows may share save logic without clear ownership context.
- family member policy save may route through main client policy save.
- render logic may aggregate family policies and direct client policies without de-duplication.

### Fix principle
Fix the data ownership at save time.

Do not hide duplicated UI cards until storage ownership is verified.

### Test
- New client upload saves only to new client.
- Existing client upload saves only to selected existing client.
- Family policy saves only under the selected family member.
- Refresh does not create or reveal duplicates.

### Lesson for Codex
Never assume the current selected client is the correct destination without tracing the full user flow.
