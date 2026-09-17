---
"@fluidframework/driver-definitions": minor
"@fluidframework/container-loader": minor
"@fluidframework/odsp-driver": minor
"__section": feature
---

Add batched point-in-time sequence-number availability checks

`checkSequenceNumberAvailability` determines whether resolved sequence numbers can currently be
materialized as historical containers without instantiating a container for each target. Results
distinguish verified availability, authoritative retention or lineage loss, and transient failures
that callers must retry without deleting durable marks.

ODSP supports the API through the optional `createPointInTimeAvailabilityProvider` implementation
exported from its point-in-time entry point.
