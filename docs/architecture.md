# PolicyLens Architecture

## Purpose
PolicyLens helps CK review insurance policies, extract policy information, organise policies by client and family member, and generate usable review summaries.

## Main concepts

### Client
The main person being reviewed.

A client may have:
- personal profile details
- policy records
- family members
- review notes
- generated summaries

### Family member
A person related to the main client.

A family member may have:
- profile details
- their own policy records
- relationship to the main client

### Policy
An insurance policy belonging to either:
- the main client, or
- one specific family member

A policy should never float without an owner.

### Extracted policy data
This is raw information parsed from uploaded policy documents.

Raw extracted data should be preserved before any formatting, summary, or interpretation.

### Review output
This is the user-facing summary generated from policy data.

Review output can be regenerated, but raw extracted policy data should remain stable.

## Expected data flow

### New client policy upload
1. User creates or selects new client workflow.
2. Policy document is uploaded.
3. Parser extracts raw data.
4. App creates a policy object.
5. Policy is saved under the newly created client.
6. UI renders that policy under the new client only.
7. Page refresh keeps the same relationship.

### Existing client policy upload
1. User selects an existing client.
2. Policy document is uploaded.
3. Parser extracts raw data.
4. App creates a policy object.
5. Policy is saved under the selected existing client.
6. No new client is created.
7. UI renders that policy under the selected client only.

### Family member policy upload
1. User selects a client.
2. User selects or creates a family member.
3. Policy document is uploaded.
4. Parser extracts raw data.
5. App creates a policy object with family member ownership.
6. Policy is saved under that family member.
7. Policy does not accidentally duplicate under the main client.
8. Page refresh keeps the same relationship.

## High-risk technical areas
- localStorage structure
- client ID generation
- policy ID generation
- selected client state
- new-client vs existing-client mode
- family member ownership
- import/upload route
- savePolicy/savePolicyForClient relationship
- render logic that aggregates policies
- delete/update policy logic

## Architecture rule
Data ownership must be correct at the storage layer before the UI renders it.

Do not solve ownership bugs by filtering or hiding UI cards.
