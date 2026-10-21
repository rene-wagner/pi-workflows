---
description: Recherche, Planung, sequenzielle Umsetzung und maximal drei Review-Korrekturrunden
argument-hint: "<Aufgabe, Ticket oder URL | resume /absoluter/task/pfad>"
---
Lade den Skill `pi-workflow` vollständig und führe ihn als Main Session aus.
Dieser Aufruf autorisiert ausdrücklich die dort beschriebene Delegation einschließlich
`pi-workflows.manager → pi-workflows.worker/advisor` und
`pi-workflows.planer → pi-workflows.advisor`.
Behalte Orchestrierung, Benutzerfragen, Branch-Erstellung und finale Abnahme in der Main Session.
Keine RPC-Aufrufe, keine eigene Extension und keine Workflow-Skripte verwenden.

Auftrag:
$@
