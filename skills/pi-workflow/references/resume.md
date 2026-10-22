# Resume and interrupted work

Use the native call protocol in SKILL.md.
Only explicit resume permits another session to take over an existing task.
Do not allow concurrent Main Sessions to control the same task.

Read state.json and request.md first.
Check repository, base commit, feature branch, session association, and recorded transitions.
Read the current plan and required reports for the saved stage, not every historical artifact.
Preserve correctionRounds, reviewIndex, and planApproval.
Never reset `correctionRounds` or `reviewIndex` to 0.
Do not create a new task directory or branch.
Do not repeat completed phases.

Check exact active run IDs before starting anything.
Include manager's recorded child runs and their phases when implementation was interrupted.
For still-active runs, wait for native completion; do not launch duplicates.
If status, interrupted writes, partial changes, or ownership are unclear, pause and ask the user.
Never start duplicate workers.
A missing activeRun alone is not proof that all children stopped.
Reconcile terminal results and validate reports before advancing state.

| Saved stage | Next instruction |
|---|---|
| researching | Read research.md; reconcile existing research before considering another launch |
| planning | Read planning.md; reconcile any completed planer run |
| awaiting-plan-approval | Read planning.md; present the current plan and wait for explicit approval |
| implementing | Read implementation.md; check current approval and reconcile manager/worker runs first |
| reviewing | Read review.md; reconcile the current review before another launch |
| complete, review-limit | Report the saved result and stop |
| blocked or unknown | Explain the blocker or ambiguity and ask before continuing |

Resume alone does not approve implementation.
Missing planApproval data in older tasks is not approval.
Changed plans need fresh approval.
Before every new manager launch, verify the current plan SHA-256 and recorded explicit approval under planning.md.
Native completion cannot bypass the approval pause.
Use validated history to distinguish initial work from correction work.
If the next transition is unclear, ask rather than incrementing counters or repeating work.
