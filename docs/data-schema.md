# PolicyLens Data Schema

This document defines the expected structure and ownership rules for PolicyLens data.

## Client object

```json
{
  "id": "client_unique_id",
  "name": "Client Name",
  "createdAt": "ISO date string",
  "updatedAt": "ISO date string",
  "profile": {},
  "policies": [],
  "familyMembers": [],
  "notes": [],
  "reviewSummary": {}
}
```

## Family member object

```json
{
  "id": "family_member_unique_id",
  "clientId": "parent_client_id",
  "name": "Family Member Name",
  "relationship": "Spouse / Child / Parent / Other",
  "profile": {},
  "policies": []
}
```

## Policy object

```json
{
  "id": "policy_unique_id",
  "ownerClientId": "client_unique_id",
  "familyMemberId": null,
  "policyNumber": "policy_number_if_available",
  "insurer": "insurer_name",
  "productName": "product_name",
  "policyType": "policy_type",
  "lifeAssured": "life_assured_name",
  "policyOwner": "policy_owner_name",
  "premium": {},
  "coverage": {},
  "cashValue": {},
  "beneficiaries": [],
  "extractedRawData": {},
  "formattedSummary": {},
  "sourceDocument": {},
  "createdAt": "ISO date string",
  "updatedAt": "ISO date string"
}
```

For a main client policy:

```json
{
  "ownerClientId": "client_123",
  "familyMemberId": null
}
```

For a family member policy:

```json
{
  "ownerClientId": "client_123",
  "familyMemberId": "family_456"
}
```

## Ownership rules
- Every policy must have `ownerClientId`.
- `familyMemberId` is optional.
- If `familyMemberId` is present, the policy belongs to that family member.
- Main client policies should have `familyMemberId: null`.
- Family member policies should not be duplicated into the main client's direct policy list unless the UI intentionally displays an aggregated view.
- Policy ownership should not change after save unless the user explicitly moves the policy.

## ID rules
- `client.id` must be unique.
- `familyMember.id` must be unique within the app.
- `policy.id` must be unique within the app.
- Do not rely only on policy number for uniqueness.
- Two different clients may theoretically have similar policy numbers due to imported data, formatting, or missing fields.
- Duplicate detection should consider owner context.

## Raw vs formatted data
- `extractedRawData` stores parser output.
- `formattedSummary` stores display-ready or AI-enhanced output.
- Formatting must not destroy raw extracted data.
- AI-generated interpretation should not replace the original parsed values.

## localStorage rules
- Do not rename localStorage keys without migration.
- Do not delete unknown fields during save.
- When updating one client, preserve all other clients.
- When updating one policy, preserve all other policies.
- When updating family member policies, preserve main client policies.

## Migration rules
If schema changes are necessary:
1. Write a migration function.
2. Preserve old data.
3. Add version detection.
4. Test old records and new records.
5. Document the change in `docs/known-bugs.md` or project notes.
