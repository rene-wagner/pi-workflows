---
name: pi-workflow
description: Orchestriert das pi-workflows Package mit researcher, planer, manager, sequenziellen workers, advisor und reviewer. Bei /workflow oder ausdrücklichem Wunsch nach diesem delegierten Research-Plan-Implementierungs-Review-Workflow laden; auch zum Fortsetzen eines Task-Verzeichnisses.
---

# Main-Session-Orchestrierung

Lies zuerst `references/contract.md` vollständig. Löse diesen Pfad relativ zu diesem
Skill-Verzeichnis auf und übergib den absoluten Vertragspfad jedem Subagent.
Du bist Main Session, kein zusätzlicher Orchestrator-Subagent.
Dieser Workflow ist nur bei ausdrücklichem Benutzerauftrag aktiv; sein Aufruf autorisiert
die unten begrenzte Delegation. Nicht für jede normale Coding-Aufgabe automatisch starten.

## 1. Preflight und Task-Verzeichnis

- Bei leerem Auftrag erst nach Aufgabe/Ticket fragen; noch keine Agents starten.
- Prüfe Git-Repository, absoluten Root-Pfad, HEAD und Status einschließlich untracked Dateien.
  Bei fehlendem Repository/HEAD stoppen und Benutzer fragen; nicht selbst initialisieren.
  Bei fremden Änderungen oder einem anderen aktiven Workflow im selben Checkout pausieren,
  bevor ein Branch oder Worker startet. Nicht automatisch aufräumen oder stashen.
- Prüfe mit `subagent({action:"list", options:{capabilities:true}})`, dass genau die
  sechs erwarteten `pi-workflows.*` Agents aus diesem Package verfügbar sind und keine
  höher priorisierten Overrides Rollenrechte ungewollt ändern. Bei fehlendem Tool kann
  dessen vorhandener Discovery-/Enable-Mechanismus benutzt werden; sonst Setup-Blocker melden.
- Pi und `npm:pi-subagents` müssen separat installiert/geladen sein. Nicht selbst installieren.
  Nested Delegation benötigt effektiv mindestens Tiefe 2, Standard bei kompatiblem pi-subagents.
  Striktere Benutzer-Ceilings nicht lockern. Manager darf nur worker/advisor, planer nur advisor starten.
- Researcher läuft immer mit `async:true`, damit ambient MCP-Extensions geladen werden.
  Default-Selektoren sind `linear`, `gitea`, `github`. Benutzer müssen diese Server konfigurieren
  oder die researcher-Tools per `subagents.agentOverrides` auf ihre Servernamen/benötigten
  lesenden Tools anpassen (README). Fehlende Server, Auth oder Tools nicht als leere Recherche behandeln.
  Kein erforderlicher externer Kontext darf stillschweigend ausgelassen werden.
- Ein Task-Verzeichnis pro aktiver Pi-Session verwenden; bei erneutem Aufruf in derselben
  Session den bekannten TASK_DIR wiederverwenden, nicht pro Subagent oder Review neu anlegen.
  Neue unabhängige Aufgabe in derselben Session: Benutzer auf neue Session verweisen.
  Neue Session: neue UUID. Bei explizitem `resume /absoluter/pfad` vorhandene Metadaten
  zuerst prüfen und nur dieselbe Aufgabe fortsetzen. Kein globales „latest“ verwenden.
- Neues Verzeichnis exklusiv mit Node (bereits für Pi/npm vorausgesetzt) anlegen:

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

Den ausgegebenen absoluten Pfad speichern und dem Benutzer nennen.
`request.md` mit Originalauftrag, Repository, Ausgangsbranch/-commit und Scope anlegen.
`state.json` anlegen: schemaVersion (1), taskId (UUID), taskDir, repo, sessionReference
(soweit verfügbar, nicht erfinden), baseBranch, baseCommit, featureBranch (zunächst null),
stage, correctionRounds (0), reviewIndex (0), activeRun (null), planApproval (null), history ([]).
Nur Main schreibt diese Datei, jeweils per atomarem Dateiersatz.
Stage-Übergänge/Run-IDs und Ergebnis-/Artefaktpfade vor und nach jedem Aufruf persistieren.
Nur ein Main-Orchestrator darf einen Task gleichzeitig fortsetzen.

## 2. Gemeinsames Aufrufprotokoll

Native `subagent`-Aufrufe verwenden, keine RPC-, CLI-, Workflow-Script- oder Chain-Adapter.
Jeden Agent mit Namespace auswählen und explizitem `cwd: REPO`, `async:true` starten.
Im Task immer alle Übergabefelder aus dem Vertrag nennen, inklusive Vertragspfad,
exakten Ausgabepfaden und expliziter Delegationsbefugnis bei planer/manager.
`options.sessionDir` kann auf ein rollen-/rundenspezifisches Unterverzeichnis von
TASK_DIR/sessions gesetzt werden; native Debug-/Run-Metadaten bleiben runtimeverwaltet.

Nach Launch Run-ID in state.activeRun speichern, noch keine nächste Stufe starten.
Im interaktiven Main auf native Completion warten und die Kontrolle abgeben; nicht pollen
oder unnötig blockierend warten. Beim Wake Ergebnis und Status mit der exakten Run-ID
prüfen, Bericht lesen, erwarteten Pfad/Datei und Rollenstatus validieren; ein Launch-Receipt
ist kein DONE. Fehlende/abweichende Artefakte, Fehler, Timeouts und unklare Ergebnisse → BLOCKED.
Keine Rohantwort durch `output` auf `plan.md` oder einen anderen direkt geschriebenen
Bericht routen: Agent schreibt den Bericht, Rückgabe enthält nur Status und Pfad.

Bei Blockern `stage: blocked`, Fehler/Run-ID und Teiländerungen dokumentieren,
Benutzer informieren und stoppen. Keine automatische Endlosschleife.
Keine nächste Rolle starten, solange der vorherige Agent oder dessen Worker noch aktiv ist.

## 3. Research → Fragen → Feature-Branch → Plan

1. `pi-workflows.researcher` mit Originalauftrag starten; Ausgabe `TASK_DIR/research.md`.
2. Bericht lesen. Sämtliche offenen Fragen gesammelt dem Benutzer stellen, bevor Planung
   oder Umsetzung beginnt. Antworten in `request.md` ergänzen. Nicht-blockierende
   Restfragen dürfen mit ausdrücklich genehmigten Annahmen bis zum Abschluss verbleiben.
   Bei blockierenden Fragen auf Antwort warten, keine Anforderungen erraten.
3. Erst nach erfolgreicher Recherche und nötigen Antworten Git-Status erneut prüfen.
   Auf Basis des aufgezeichneten HEAD einen neuen lokalen Feature-Branch erstellen:
   `git switch -c feature/<kurzer-sicherer-slug>-<task-uuid>`.
   Slug nur aus Kleinbuchstaben/Ziffern/Bindestrichen; Argumente immer sicher quoten.
   `git check-ref-format --branch` vorab benutzen. Existierenden Branch nie überschreiben.
   Basis-HEAD unverändert verifizieren; bei Drift pausieren. Branch in state speichern.
4. `pi-workflows.planer` mit research.md, request.md, Basis und Branch starten.
   Ausgabe `TASK_DIR/plan.md`; darf ausschließlich `pi-workflows.advisor` für
   begrenzte Planungsfragen delegieren.
5. Plan lesen und auf vollständigen Scope, Nested Checkboxen, eindeutige IDs, Abhängigkeiten
   und überprüfbare Akzeptanz prüfen. Neue blockierende Fragen dem Benutzer vorlegen.

## 4. Planfreigabe → sequenzielle Umsetzung

Nach JEDEM erfolgreichen planer-Durchlauf (initial, nach Änderungswünschen und bei
Review-Korrekturen) ist eine verbindliche Benutzerpause einzulegen:

1. Plan prüfen, `planApproval: null`, `activeRun: null` und `stage: awaiting-plan-approval`
   atomar speichern. Den SHA-256 des aktuellen plan.md für die Freigabe ermitteln.
2. Dem Benutzer eine kurze Zusammenfassung von Phasen, betroffenen Dateien, Risiken und
   Prüfungen sowie den absoluten Pfad zu plan.md zeigen. Explizit fragen, ob dieser Plan
   umgesetzt werden darf oder geändert werden soll. Dann die Kontrolle an den Benutzer
   abgeben und auf dessen Antwort warten. Kein manager/worker-Start und keine eigene
   Implementierung, solange die Freigabe fehlt. Auch ein fehlerfreier Plan ist keine Freigabe.
3. Nur eine ausdrückliche Zustimmung zum vorgelegten aktuellen Plan gilt als Freigabe.
   Workflow-Aufruf, planer-DONE, Schweigen, Abbruch der Frage und bloßes resume gelten nicht.
   Antwort in request.md und history festhalten; bei Zustimmung `planApproval` mit
   `planSha256` und `response` speichern, danach `stage: implementing` setzen.
4. Bei Änderungswünschen diese in request.md festhalten und planer erneut beauftragen;
   danach denselben Freigabeschritt wiederholen. Bei Ablehnung pausiert bleiben.
   Eine geänderte Planung macht eine frühere Freigabe ungültig.

Vor jedem manager-Start muss Main die explizite Freigabe für den aktuellen Plan prüfen
(SHA-256 muss mit `planApproval.planSha256` übereinstimmen). Fehlt sie oder weicht der
Plan ab, zurück zur Benutzerpause. Freigabedaten ausdrücklich im Manager-Auftrag übergeben.
Manager-eigene Checkboxen/Ausführungsnotizen während eines genehmigten Durchlaufs erfordern
keine neue Freigabe; vor einem erneuten manager-Start gilt die Prüfung wieder.

`pi-workflows.manager` erhält plan.md und alle Kontextpfade; Bericht
`manager-round-0.md` (später Rundennummer). Explizit nur Delegation an
`pi-workflows.worker` und `pi-workflows.advisor` erlauben und Serialisierung verlangen.
Manager arbeitet alle offenen Phasen ab, jeweils genau ein Worker.
Nach DONE Plan selbst lesen: Jede Phase und jeder Task muss `[x]` sein und Evidenz besitzen.
BLOCKED, offene Checkboxen oder fehlgeschlagene Prüfungen → kein Review-Erfolg behaupten.

## 5. Review mit höchstens drei Korrekturrunden

Main besitzt den Schleifenzähler. Start: correctionRounds=0, reviewIndex=0.
Ein erster Review plus höchstens drei Korrekturrunden ergibt maximal vier Reviews.

1. `pi-workflows.reviewer` liest Auftrag, Research, aktuellen Plan und vollständigen
   Repository-Diff seit baseCommit (auch Index, Working Tree und untracked Produktdateien).
   Ausgabe `review-<reviewIndex>.md`. CLEAN gilt nur mit ausreichender Prüfevidenz.
2. Bei CLEAN: zu Abschluss.
3. Bei FINDINGS und correctionRounds == 3: `stage: review-limit`, offene Findings in
   summary.md dokumentieren, Benutzer informieren und stoppen. Kein vierter Fix-Durchlauf,
   kein stilles „fertig“, kein automatischer Neustart mit zurückgesetztem Zähler.
4. Sonst correctionRounds vor Beginn der Korrektur dauerhaft um 1 erhöhen.
   Den Review-Bericht an `pi-workflows.planer` mit bestehendem plan.md übergeben:
   ausschließlich neue Korrekturphasen/-tasks anhängen, bestehende Checkboxen erhalten.
5. Abdeckung aller Findings prüfen und die Planfreigabe aus Abschnitt 4 einholen.
   Erst danach manager nur für offene Phasen starten (`manager-round-<correctionRounds>.md`).
   Auf vollständigen Abschluss warten.
   reviewIndex erhöhen und wieder bei 1 beginnen.
6. BLOCKED ist kein FINDINGS und löst keinen automatischen Fix-Retry aus.

## 6. Abschluss und Wiederaufnahme

Bei CLEAN und vollständig erfülltem Plan: `stage: complete`, summary.md erstellen.
Zusammenfassung, Branch, Testresultate, offene genehmigte Restfragen und absolute Pfade
zu Task-Verzeichnis, Research, Plan und letztem Review nennen. Keine Commits/Pushes/PRs.

Nach Unterbrechung state.json, request.md, Plan, vorhandene Berichte und exakte aktive
Run-IDs lesen. Repository/Branch/Basis und Session-Zuordnung prüfen. Aktive Runs erst
über status abgleichen; bei unklarem Laufzustand pausieren, niemals doppelte Worker starten.
Sind Lauf/Ergebnis und Metadaten wegen eines unterbrochenen Schreibens nicht eindeutig,
Benutzerentscheidung einholen. correctionRounds/reviewIndex niemals auf 0 zurücksetzen.
Keinen neuen Branch bei Wiederaufnahme erstellen und abgeschlossene Phasen nicht wiederholen.
Eine neue Session darf den alten Task nur über ausdrückliches resume übernehmen.
Bei `stage: awaiting-plan-approval` den Plan erneut vorlegen und auf explizite Zustimmung
warten; resume allein gibt die Umsetzung nicht frei. Fehlende `planApproval`-Daten älterer
Tasks sind keine Freigabe. Vor einem neuen manager-Start die Freigabe nach Abschnitt 4
prüfen; weder Wiederaufnahme noch native Completion darf diese Pause überspringen.
