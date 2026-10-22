# Sequential implementation

Use the native call protocol in SKILL.md.
Before EVERY manager launch, verify explicit approval and the current plan SHA-256 against planApproval.planSha256.
For missing or mismatched approval, read `planning.md` and return to its approval pause.

Save stage: implementing before the manager launch.
Supply request.md, research.md, plan.md, baseCommit, branch, and the core and plan-format contracts to `pi-workflows.manager`.
Include the recorded approval and matching hash.
Set its report to TASK_DIR/manager-round-<correctionRounds>.md.
Explicitly permit only pi-workflows.worker and pi-workflows.advisor.
Require exactly one worker at a time and terminal child results before advancing.
Manager executes only open phases; it does not implement product files.
Workers receive only required phase context and the core contract, not Main's phase references.

After validated DONE, read the plan.
Every phase and task must have [x] and supporting acceptance/check evidence.
Open checkboxes, missing reports, or failed required checks mean BLOCKED.
After all children stop and all checks pass, read `review.md`.
