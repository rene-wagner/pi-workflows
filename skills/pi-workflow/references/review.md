# Review, correction routing, and completion

Use the native call protocol in SKILL.md.
Main owns correctionRounds and reviewIndex.
Their initial values are 0.
One initial review and at most three correction rounds permit a maximum of four reviews.

## Review

Save stage: reviewing before the reviewer launch.
Start `pi-workflows.reviewer` with request.md, research.md, current plan, worker/manager evidence, and baseCommit.
Supply the core and plan-format contracts.
Require the full diff, including committed changes, index, working tree, and untracked product files.
Set its only output to TASK_DIR/review-<reviewIndex>.md.
CLEAN requires sufficient check evidence.
BLOCKED is not FINDINGS and never starts an automatic correction retry.

## Findings

For FINDINGS at `correctionRounds == 3`, save stage: review-limit.
Write open findings to summary.md, inform the user, and stop.
Never start a fourth correction round or reset counters.

For FINDINGS below the limit, increase and save `correctionRounds` by 1 before correction starts.
Atomically record the review ID and planned correction in history with that counter update.
On resume, reconcile this transition before incrementing again.
Read `planning.md` and supply planer with the review report and existing plan.
Require appended correction phases covering every finding.
Preserve existing IDs, checkboxes, and history.
Get explicit user approval under planning.md after the correction plan.
Only then start manager under implementation.md for the open phases.
Use manager-round-<correctionRounds>.md.
After successful implementation, increase and save reviewIndex before the next review.
Do not increase it for the initial review.

## Completion

After CLEAN and full plan completion, save stage: complete.
Create summary.md with results, branch, tests, and remaining questions with approved assumptions.
Give absolute paths to TASK_DIR, research.md, plan.md, and the final review.
Do not create commits, pushes, or pull requests.
