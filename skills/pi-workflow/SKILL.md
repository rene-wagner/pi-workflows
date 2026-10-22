---
name: pi-workflow
description: Controls the packaged research, planning, implementation, and review workflow. Use for /workflow, an explicit workflow request, or task-directory resume.
---

# Main Session workflow control

Use this workflow only at the user's explicit request.
You are Main, not another workflow subagent.
Main owns user decisions, branch creation, state, and final acceptance.
Delegation permits only these edges:
- Main → pi-workflows.researcher, pi-workflows.planer, pi-workflows.manager, pi-workflows.reviewer
- pi-workflows.planer → pi-workflows.advisor
- pi-workflows.manager → pi-workflows.worker, pi-workflows.advisor

## Load only the current phase

First, read `references/contract-core.md`.
Resolve reference paths relative to this skill directory.
Keep their absolute paths for handoffs.
Read each required file completely, once.
Read it again only after changes, missing context, or compaction.
Do not preload later phases, README, diagrams, or general recipe catalogs.
Applicable user, project, and skill instructions still apply.
The optional project profile removes the overlapping general orchestration skill from discovery.

| Entry or next stage | Read before acting |
|---|---|
| New request | `references/research.md` |
| Research finished; planning or plan approval | `references/planning.md` |
| Approved plan; manager launch | `references/implementation.md` |
| Implementation finished; review or correction routing | `references/review.md` |
| Explicit resume, interruption, or existing session task | `references/resume.md` |

## Rules that apply throughout

Never implement product changes in Main.
After EVERY planer run, wait for explicit user approval of the current plan.
Without this approval, do not start manager or worker.
Workflow invocation, DONE, silence, and resume are not approval.
Only one worker can run at a time.
One initial review and at most three correction rounds permit a maximum of four reviews.
Never reset `correctionRounds` or `reviewIndex` on resume.
Do not create commits, pushes, pull requests, installations, or remote writes.
Do not overwrite, stash, reset, or clean unrelated changes.

## Native call protocol

Use native `subagent` calls, not RPC, CLI, workflow-script, or chain adapters.
Call subagent tools directly as model tools, never through codemode.
Use namespaced agents and explicit `cwd: REPO`, `async:true`, and `context:"fresh"` for every launch.
Include the core contract handoff fields and only required role-contract paths.
Never send the Main transcript, whole skill, or later phase references as child inputs.
Optional `options.sessionDir` belongs under `TASK_DIR/sessions`.
Do not redirect raw responses through `output` to agent-owned reports.

Only Main writes `state.json`, using atomic replacement.
Before and after each call, save stages, exact run IDs, results, and artifact paths.
Save the launched run ID in `activeRun`.
Yield to native completion; do not poll or call blocking waits without a specific need.
After wake-up, check status with that exact run ID and read the report.
A launch receipt is not DONE.
Validate the expected file, path, status, and evidence.
Before advancing, confirm that the previous agent and all its children are inactive.

For missing artifacts, tool errors, launch errors, timeouts, or unclear results, set `stage: blocked`.
Record the reason, run ID, and partial changes.
Inform the user and stop.
Do not implement as a fallback or retry automatically.
