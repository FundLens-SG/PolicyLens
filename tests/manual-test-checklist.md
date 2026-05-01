# PolicyLens Manual Test Checklist

Run this after every material change.

## Startup
- [ ] App loads without console errors.
- [ ] Existing clients load.
- [ ] Existing policies load.
- [ ] Existing family members load.

## New client
- [ ] Can create a new client.
- [ ] Can upload policy for new client.
- [ ] Policy appears under new client.
- [ ] Policy does not appear under old client.
- [ ] Refresh preserves new client and policy.

## Existing client
- [ ] Can select existing client.
- [ ] Can upload policy for selected client.
- [ ] No duplicate client is created.
- [ ] Existing policies remain.
- [ ] Refresh preserves correct policy ownership.

## Family member
- [ ] Can add family member.
- [ ] Can upload policy for family member.
- [ ] Policy appears under family member.
- [ ] Policy does not duplicate as main client policy.
- [ ] Refresh preserves family policy ownership.

## Duplicate handling
- [ ] Uploading the same policy twice does not create accidental duplicates.
- [ ] Duplicate behavior is clear and intentional.
- [ ] Duplicate check respects client/family ownership context.

## Delete/update
- [ ] Delete main client policy affects only that policy.
- [ ] Delete family policy affects only that family member policy.
- [ ] Updating one policy does not overwrite another.
- [ ] Updating one client does not overwrite another.

## Parser
- [ ] Raw extracted data is preserved.
- [ ] Missing fields do not crash the app.
- [ ] Summary does not fabricate missing values.
- [ ] Policy number remains readable.
- [ ] Product name remains readable.

## UI regression
- [ ] Layout still works on desktop.
- [ ] Layout still works on mobile.
- [ ] No unintended text/design changes.
- [ ] No new visual duplication.
