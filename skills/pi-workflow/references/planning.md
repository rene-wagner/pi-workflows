# Planning and explicit approval

Use the native call protocol in SKILL.md.
Read `plan-format.md` before assigning or validating a plan.
Supply its absolute path as a role contract to planer.

## Feature branch

Only after successful research and required answers, check Git status and the recorded base HEAD again.
Pause for drift or unrelated changes.
For a new task without featureBranch, validate a new local branch with `git check-ref-format --branch`.
Then use `git switch -c feature/<short-safe-slug>-<task-uuid>`.
Use only lowercase letters, digits, and hyphens in the slug.
Quote all arguments safely.
Never overwrite a branch or create another branch during resume or correction.
Save featureBranch in state.

## Plan

Save stage: planning before the planer launch.
Start `pi-workflows.planer` with request.md, research.md, baseCommit, branch, and the core and plan-format contracts.
Permit only bounded advisor delegation.
Its only own output is TASK_DIR/plan.md; advisor writes its separately assigned report.
In correction mode, also supply the existing plan and review report.
Require only appended phases, preserving existing IDs, checkboxes, and execution notes.
Validate scope, unique IDs, dependencies, acceptance criteria, checks, and coverage of every review finding.
Ask the user any new blocking questions.

## Approval after every planer run

After EVERY successful `planer` run, pause for user approval.
This includes the initial plan, requested changes, and review corrections.

1. Atomically save planApproval: null, activeRun: null, and stage: awaiting-plan-approval.
   Calculate the SHA-256 of the current plan.md.
2. Summarize phases, affected files, risks, and checks.
   Include the absolute plan.md path and ask whether to implement or change this plan.
   Yield control and wait for the answer.
   Do not start manager or worker without approval.
   Do not implement changes yourself.
3. Accept only explicit approval of the current presented plan.
   Workflow invocation, planer DONE, silence, a dismissed question, and resume alone are not approval.
   Record the answer in `request.md` and `history`.
   Save planApproval with planSha256 and response, then stage: implementing.
4. For requested changes, record them in request.md and run planer again.
   Repeat approval after that run.
   Rejection leaves the workflow paused.
   Plan changes invalidate earlier approval.

Before every manager launch, the current plan SHA-256 must match planApproval.planSha256.
Otherwise, return to the approval pause.
Manager checkbox changes and execution notes during an approved run do not require new approval.
Before another manager launch, check approval again.
Once approval is recorded, read `implementation.md`.
