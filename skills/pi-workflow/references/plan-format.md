# Plan role contract

Only planer, manager, reviewer, and Main's planning validation need this contract.
Researcher, worker, and advisor do not load it by default.

Include these plan.md sections:
- Objective
- Scope and exclusions
- Requirements with sources
- Architecture
- Risks and dependencies
- Assumptions and questions
- Validation strategy
- The executable list below

```markdown
## Implementation
- [ ] P1: Descriptive phase name
  - [ ] P1.T1: Specific task with affected files
  - [ ] P1.T2: Confirm tests and acceptance criteria

### P1 - Details
- Files and interfaces: ...
- Steps and dependencies: ...
- Acceptance criteria: ...
- Check commands: ...
```

Every phase needs at least one task and measurable acceptance criteria, including check commands.
Use stable, unique IDs and dependency order.
A small change can have one phase with one task.
Do not use other checkbox lists in plan.md.
Use plain lists for questions and background.
Only manager sets [x] after checking worker evidence.
Complete a phase only when all its tasks and phase checks pass.
Record partial success for individual tasks; keep blockers open.

For review findings, planer appends consecutive phase IDs and new tasks.
Keep existing IDs, checkboxes, and execution notes unchanged.
Each new task references its finding ID and review report.
Cover every finding.

Main obtains explicit approval after every planer run, including correction plans.
Main supplies the approved plan SHA-256 and recorded user response to manager.
Planer changes invalidate approval.
Manager must reject missing or mismatched approval.
