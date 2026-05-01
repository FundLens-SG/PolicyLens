# PLANS.md

Use this file whenever the task is complex, risky, touches data, touches routing, or could break existing user flows.

## Default workflow

### 1. Understand first
Before editing code:
- Identify the exact user flow involved.
- Locate the relevant files, functions, and state/storage variables.
- Explain the current flow in plain English.
- State the suspected root cause.
- State the smallest safe fix.

Do not edit code until the current flow is understood.

### 2. Diagnose before patching
For every bug:
- Reproduce it mentally or manually.
- Identify where the wrong value/state is first created.
- Identify where it is saved.
- Identify where it is displayed.
- Fix the earliest correct point, not the visible symptom.

Avoid hiding bugs in the UI.

### 3. Implement narrowly
When editing:
- Make the smallest safe change.
- Avoid unrelated refactors.
- Do not rename variables casually.
- Do not change UI/layout/copy unless requested.
- Do not add dependencies unless necessary.
- Preserve existing storage keys and schemas unless a migration is clearly needed.

### 4. Verify
After edits:
- Run available tests.
- Run lint/build if available.
- Start the app if possible.
- Check browser console errors.
- Manually test the affected workflow.
- Test at least one nearby old workflow to avoid regression.

### 5. Report
Final response must include:
- Files changed.
- Functions changed.
- What root cause was fixed.
- What was tested.
- Any remaining risk or assumption.

## When uncertain
If the intended behavior is unclear:
- Do not invent product logic.
- Look for existing patterns in the codebase.
- Choose the least destructive behavior.
- Preserve existing data.
- Explain the assumption before implementing.

## Do not do these
- Do not rewrite the whole file to fix one issue.
- Do not create duplicate helper functions when a similar one exists.
- Do not silence errors without explaining why they occur.
- Do not change persistence/storage format without migration.
- Do not ship a cosmetic fix for a data bug.
