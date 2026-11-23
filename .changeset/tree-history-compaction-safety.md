---
"@fluidframework/tree": minor
"__section": tree
---
Protect retained history during internal compaction

Internal history compaction preserves the namespace ordering needed to restore retained states after repeated compaction.
It also maintains cached history counts and repair-data cleanup across transaction rollback, and prevents metadata nesting from blocking summaries.

Configurations with `minVersionForCollab` at or above `"3.14.0"` write SharedTree summary version 3.
This format requires compaction-aware readers; older readers reject it during loading.
Current readers also reject loading version 3 with an older write configuration, preventing a summary downgrade.
Compaction remains internal and disabled by default; no application-facing compaction or revision-preservation API is added.
