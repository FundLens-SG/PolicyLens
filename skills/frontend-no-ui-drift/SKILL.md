---
name: frontend-no-ui-drift
description: Use when fixing frontend bugs where the user did not request UI, styling, copy, layout, or branding changes.
---

# Frontend No UI Drift Skill

## Purpose
Prevent accidental visual or wording changes while fixing logic bugs.

## Rules
- Do not change layout unless the task asks for layout changes.
- Do not change colours unless the task asks for colour changes.
- Do not change font, spacing, cards, headers, copy, buttons, or branding unless required.
- Do not replace components just because they look cleaner.
- Do not rewrite CSS to fix a JavaScript data bug.
- Do not remove user-facing sections unless confirmed obsolete.

## Before editing
Identify whether the issue is:
- data
- state
- rendering
- styling
- routing
- API
- persistence

If it is not styling, avoid styling edits.

## Verification
After editing:
- Compare the affected screen before and after.
- Confirm only the requested behavior changed.
- Check mobile layout if frontend was touched.
- Confirm no text changed unless requested.

## Final answer
Say explicitly whether UI was changed or preserved.
