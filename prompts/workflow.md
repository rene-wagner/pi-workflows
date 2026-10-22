---
description: Research, planning, sequential implementation, and no more than three review correction rounds
argument-hint: "<task, ticket, or URL | resume /absolute/task/path>"
---

Read the full `pi-workflow` skill.

Execute it in the Main Session.

This invocation explicitly permits the delegation that the skill describes, including these nested calls:
- `pi-workflows.manager → pi-workflows.worker/advisor`
- `pi-workflows.planer → pi-workflows.advisor`

Keep workflow control, user questions, branch creation, and final acceptance in the Main Session.

Do not use RPC calls, a custom extension, or workflow scripts.

Request:
$@
