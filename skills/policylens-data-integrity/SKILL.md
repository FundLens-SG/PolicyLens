---
name: policylens-data-integrity
description: Use when editing PolicyLens client, family, policy, upload, import, save, delete, parser, summary, or localStorage logic.
---

# PolicyLens Data Integrity Skill

Use this skill whenever a task touches:
- clients
- family members
- policies
- policy upload
- policy parsing
- savePolicy
- savePolicyForClient
- localStorage
- duplicate policy issues
- new-client vs existing-client routing
- policy display or deletion

## Before editing
Trace the full path:
1. Where does the user start?
2. Is this a new-client, existing-client, or family-member flow?
3. What is the intended ownerClientId?
4. Is familyMemberId required?
5. Which function creates the policy object?
6. Which function saves the policy object?
7. Which localStorage key is updated?
8. Which render function displays the result?

## Never do
- Never patch by hiding duplicate UI cards before checking storage.
- Never create another save function unless existing save functions cannot be safely reused.
- Never change storage keys without a migration.
- Never overwrite raw extracted data with summary data.
- Never assume selectedClient is correct without tracing the flow.
- Never save a family member policy as a main client policy.

## Required checks
After editing, test:
- New client policy upload.
- Existing client policy upload.
- Family member policy upload.
- Page refresh persistence.
- Duplicate prevention.
- Console errors.

## Final answer
Report:
- Root cause.
- Files/functions changed.
- Data flow before and after.
- Tests completed.
- Remaining risk.
