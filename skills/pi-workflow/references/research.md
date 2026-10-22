# New task and research

Use the native call protocol in SKILL.md.
For resume or an existing session task, read `resume.md` first.
Reuse the known TASK_DIR for the same task.
For an independent task, ask the user to start a new session.
Never use a global latest pointer.

## Bounded preflight

If the request is empty, ask for the task or ticket before running agents.
Check repository root, HEAD, current branch, and status, including untracked files.
Missing repository or HEAD means stop and ask; do not initialize Git.
Pause for unrelated changes or another active workflow sharing the checkout.
Do not create a branch yet.

Enable the native subagent tool if necessary.
Call `subagent({action:"list",options:{capabilities:true}})` once.
Verify these six package roles and their effective permissions:
- pi-workflows.researcher: read-only repository/MCP, research.md only, no delegation
- pi-workflows.planer: plan.md only; delegates only to pi-workflows.advisor
- pi-workflows.manager: plan checkboxes/report only; delegates only to pi-workflows.worker or pi-workflows.advisor
- pi-workflows.worker: assigned phase files/tests/report; no delegation
- pi-workflows.reviewer: review report only; no delegation
- pi-workflows.advisor: assigned advice report only; no delegation

Reject unexpected package-role replacements or widened permissions.
Verify Pi and npm:pi-subagents are installed and loaded separately.
Nested delegation needs effective depth at least 2; never increase stricter user limits.
Use available capability metadata and only necessary settings fields for these checks.
Do not read complete settings, README, or diagnostic guides as routine preflight.
Use doctor or targeted documentation only for a concrete diagnostic need.

Researcher defaults select MCP servers linear and gitea.
Use effective overrides when server names differ.
Verify configured selections, not entire MCP response schemas.
Actual server access and authentication must succeed in the child.
Missing required servers or tools mean BLOCKED, not empty research.
Always launch researcher asynchronously so ambient MCP extensions can load.

## Private task directory

For a new task, create one directory with Node:

```bash
node --input-type=module -e '
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const root = join(homedir(), ".pi", "tasks");
mkdirSync(root, { recursive: true, mode: 0o700 });
const dir = join(root, randomUUID());
mkdirSync(dir, { mode: 0o700 });
console.log(dir);
'
```

Save the absolute path and give it to the user.
Initialize request.md and state.json only for a new task.
On resume, preserve existing metadata and select remaining steps from validated history.
Write request.md with the original user task, scope, repository, initial branch, and base commit.
Do not copy workflow boilerplate, generic instructions, or diagnostic transcripts into request.md.
Create state.json with:
- schemaVersion: 1; taskId: UUID; taskDir; repo
- sessionReference: the available real reference, never an invented value
- baseBranch; baseCommit; featureBranch: null
- stage: researching; correctionRounds: 0; reviewIndex: 0
- activeRun: null; planApproval: null; history: []

Only Main writes state atomically.
Record the researcher assignment before launch.

## Research handoff and transition

Start `pi-workflows.researcher` with the original request.
Supply request.md, project instructions, the core contract, and TASK_DIR/research.md as its only permitted output.
No additional role contract or later phase reference is needed.
Set explicit cwd, async:true, and context:"fresh".
No delegation or repository changes are permitted.

After validated DONE, read research.md and ask all open questions together.
Record answers in request.md.
Wait for answers to blocking questions; never guess requirements.
Other questions may remain only with explicit user approval of their assumptions.
After successful research and required answers, read `planning.md`.
