# PolicyLens User Flows

## Flow 1: Create new client and upload policy

### Expected behavior
- A new client is created.
- Uploaded policy is saved only under the new client.
- The policy does not appear under any previously selected client.
- Refreshing the page preserves the relationship.

### Test steps
1. Start with at least one existing client.
2. Create a new client.
3. Upload a policy document.
4. Save the policy.
5. Confirm policy appears under the new client.
6. Switch to the old client.
7. Confirm policy does not appear there.
8. Refresh the browser.
9. Confirm the policy is still under the new client only.

## Flow 2: Existing client policy upload

### Expected behavior
- Selected client remains the save target.
- No new client is created.
- Policy appears under selected client only.
- Existing policies remain intact.

### Test steps
1. Select an existing client.
2. Upload a new policy.
3. Save the policy.
4. Confirm the policy appears under that selected client.
5. Confirm no duplicate client was created.
6. Refresh the browser.
7. Confirm policy remains under the same client.

## Flow 3: Add family member policy

### Expected behavior
- Policy is saved under the selected family member.
- Policy retains parent client ID.
- Policy does not duplicate under main client policy list unless there is an intentional aggregate view.
- Refreshing the page preserves the family ownership.

### Test steps
1. Select a client.
2. Add or select a family member.
3. Upload a policy for that family member.
4. Save the policy.
5. Confirm policy appears under family member.
6. Confirm it does not appear as a duplicated main client policy.
7. Refresh the browser.
8. Confirm relationship remains correct.

## Flow 4: Delete policy

### Expected behavior
- Deleting a main client policy removes only that policy.
- Deleting a family member policy removes only that family member's policy.
- Other client and family policies remain untouched.

### Test steps
1. Create client with multiple policies.
2. Add family member with policies.
3. Delete one main client policy.
4. Confirm other main client policies remain.
5. Confirm family policies remain.
6. Delete one family policy.
7. Confirm main client policies remain.
8. Refresh and confirm persistence.

## Flow 5: Duplicate prevention

### Expected behavior
- Accidental duplicate saves should be blocked or safely handled.
- A duplicate should be detected within the same owner context.
- Same policy-like data under a different family member or client should not be wrongly merged without confirmation.

### Test steps
1. Upload the same policy twice for same client.
2. Confirm duplicate behavior is intentional.
3. Upload same document under different family member.
4. Confirm the app does not corrupt ownership.
5. Refresh and verify.

## Flow 6: Parser and summary

### Expected behavior
- Raw extracted values remain available.
- Display formatting does not overwrite raw values.
- Missing fields are handled gracefully.
- AI summary does not fabricate policy details.

### Test steps
1. Upload policy with complete data.
2. Upload policy with missing fields.
3. Upload policy with difficult formatting.
4. Confirm raw extraction is preserved.
5. Confirm summary identifies missing values instead of inventing them.
