# pi-workflows

Deklaratives Pi-Package für den Ablauf aus [Workflow.drawio.svg](Workflow.drawio.svg):
Recherche → Planung → sequenzielle Umsetzung → unabhängiges Review.

**Keine eigene Extension, kein RPC, kein TypeScript, keine Runtime-Abhängigkeiten.**
Das Package besteht zur Laufzeit nur aus Markdown-Agents, Prompt und Skill.
Die Orchestrierung übernimmt die Main Session über das native `subagent`-Tool.

## Voraussetzungen und Installation

- Pi mit Package-/Skill-/Prompt-Unterstützung (lokal geprüft: **Pi 1.3.0**).
- [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents)
  mit Package-Agent-Discovery, Namespaces, `allowedAgents` und Nested Delegation
  (lokal geprüft: **0.80.0**).
- Git-Repository mit mindestens einem Commit; sauberer Checkout vor Workflow-Start.
- Konfigurierte/authentifizierte MCP-Server für den benötigten externen Kontext.
- Node.js >= 20 (für Pi/npm, UUID-Erstellung und optionale Tests).

```bash
pi install npm:pi-subagents
pi install /absoluter/pfad/zu/pi-workflows
```

Anschließend Pi neu starten bzw. `/reload` verwenden.
Das Package installiert seine Voraussetzung absichtlich **nicht** als npm-Unterabhängigkeit:
Pi muss `pi-subagents` selbst als Package laden.

Im Package-Manifest meldet `pi.subagents.agents` die sechs Agents an;
`pi.skills` und `pi.prompts` registrieren Skill und Slash-Prompt.
Keine Dateien nach `~/.pi/agent/agents` kopieren.

### MCP konfigurieren

Default-Namen des researcher: **linear**, **gitea**, **github**.
Die Server müssen tatsächlich unter diesen Namen konfiguriert, erreichbar und
authentifiziert sein. Das Package enthält keine Tokens und ändert keine MCP-Konfiguration.
Pi Built-in MCP und pi-mcp-adapter sind gemäß deren Subagent-Unterstützung nutzbar.
MCP-Agents laufen immer im Hintergrund (`async: true`), damit benötigte ambient
Extensions auch im Child geladen werden.

Bei anderen Servernamen oder nur einem Teil der Quellen den **vollständigen**
Tool-Satz überschreiben. Beispiel für diese Umgebung mit `gitea_mcp` und `linear`,
ohne GitHub, in `~/.pi/agent/settings.json` mit vorhandenen Einstellungen **zusammenführen**:

```json
{
  "subagents": {
    "agentOverrides": {
      "pi-workflows.researcher": {
        "tools": "read, bash, write, mcp:linear, mcp:gitea_mcp"
      }
    }
  }
}
```

`mcp:<server>` erlaubt sämtliche vom Server exponierten Tools. Der Agent ist
angewiesen, nur lesend zuzugreifen; für technisch engere Rechte einzelne Tools auswählen:
`mcp:<server>/<exakter-toolname>`. Die Tool-Namen mit `/mcp` bzw. der
Subagent-Capability-Anzeige prüfen; keine Fantasienamen übernehmen.
Ohne erforderlichen Zugriff meldet der Workflow BLOCKED statt Recherche zu erfinden.
Ein nicht installierter Default-Server kann bereits den Child-Start verhindern, selbst
wenn er für ein einzelnes Ticket nicht gebraucht wird: dann den Override vorher anpassen.

Verschachtelung braucht effektiv mindestens `subagents.maxSubagentDepth: 2`
(Main → manager/planer → worker/advisor); bei der geprüften Version ist 2 der Standard.
Striktere globale oder geerbte Beschränkungen werden nicht umgangen.
Modelle sind nicht fest verdrahtet und erben die lokale Pi-Konfiguration.
Für rollenbezogene Modelle `subagents.agentOverrides["pi-workflows.worker"].model` usw. setzen.

## Verwendung

Im Ziel-Repository:

```text
/workflow Implementiere LINEAR-123 unter Berücksichtigung von https://…
```

Alternativ `/skill:pi-workflow <Aufgabe>`.
Der Prompt lädt den Skill; er ist kein Extension-Command.
Ein Aufruf mit leerer Aufgabe fragt zuerst nach dem Auftrag.

1. Main prüft Setup/Repository und legt ein privates UUID-Task-Verzeichnis an.
2. researcher schreibt Quellen, Anforderungen und offene Fragen.
3. Main stellt offene Fragen gesammelt dem Benutzer; Antworten werden festgehalten.
4. **Nach erfolgreicher Recherche** erstellt Main einen lokalen
   `feature/<slug>-<uuid>`-Branch.
5. planer analysiert das Repository und schreibt einen Plan mit Phasen und Nested Tasks.
6. **Pause zur Planfreigabe:** Main zeigt eine Zusammenfassung und den absoluten Planpfad.
   Der Benutzer liest den Plan und stimmt ausdrücklich zu oder fordert Änderungen an.
   Ohne Zustimmung startet keine Umsetzung; nach Planänderungen wird erneut gefragt.
7. manager delegiert offene Phasen **nacheinander**, jeweils an genau einen worker.
   Nur manager hakt belegte Task-/Phasenerfolge im Plan ab.
8. reviewer prüft den vollständigen Diff. Findings gehen über Main an planer,
   der zusätzliche Korrekturphasen anhängt. Auch dieser Plan wird erst nach erneuter
   Benutzerfreigabe umgesetzt. manager führt nur die offenen Phasen aus.
9. Nach sauberem Review meldet Main Ergebnis, Tests, Branch und Artefaktpfade.

planer darf bei Planungsschwierigkeiten advisor konsultieren; manager bei sehr komplexen
Implementierungsproblemen. worker delegiert nicht und meldet Probleme an manager.
reviewer repariert keinen Code und startet selbst keine weiteren Agents.

**Review-Limit:** ein initiales Review, danach höchstens **drei Korrekturrunden**
(`planer → manager → reviewer`), also maximal vier Reviews. Bestehen anschließend
Probleme, endet der Workflow mit `review-limit`, nicht mit einer Erfolgsmeldung.
Der Zähler wird vor jeder Korrektur gespeichert und bei Wiederaufnahme nicht zurückgesetzt.
Infrastrukturfehler und fehlende Pflichtprüfungen sind BLOCKED, keine automatischen Fix-Schleifen.

## Artefakte

Bewusst unter dem globalen **`~/.pi/tasks/`**, nicht unter `~/.pi/agent/tasks/`
und nicht im Ziel-Repository:

```text
~/.pi/tasks/<uuid>/
├── request.md
├── state.json
├── research.md
├── plan.md
├── manager-round-0.md
├── worker-P1-attempt-1.md
├── advisor-planer-<id>.md       # optional
├── review-0.md
├── manager-round-1.md          # optional
├── review-1.md                 # optional, bis review-3.md
├── sessions/                  # optionale Child-Transkripte
├── …                          # Testlogs und weitere Phasenberichte
└── summary.md
```

Jede Rolle erhält absolute Pfade und den gemeinsamen Vertrag.
Alle Agent-Arbeitsdokumente/Logs liegen im Task-Verzeichnis. Beauftragte Produktdateien
und Tests gehören selbstverständlich weiterhin ins Repository. Pi und pi-subagents
dürfen eigene Laufzeit-/Debug-Metadaten zusätzlich an ihren nativen Speicherorten führen.

Ein Task-Verzeichnis pro aktiver Session; weitere Workflow-Aufrufe derselben Session
verwenden den bereits bekannten Task weiter. Für einen unabhängigen Auftrag eine neue
Pi-Session starten. Es gibt keinen globalen, parallelitätsanfälligen `latest`-Zeiger.
Aufbewahrung/Löschung erfolgt manuell; keine automatische Bereinigung.

### Wiederaufnahme

```text
/workflow resume /home/name/.pi/tasks/<uuid>
```

Main liest Status/Plan/Berichte, prüft Repository/Branch und gleicht aktive Run-IDs ab,
bevor weitere Arbeit gestartet wird. Unklare oder noch laufende Worker blockieren einen
Neustart. Eine offene Planfreigabe bleibt als `awaiting-plan-approval` in state.json
persistiert: `resume` allein ist keine Zustimmung und startet keine Implementierung.
Fehlende oder nicht mehr zum Plan passende Freigaben werden erneut eingeholt.
Nicht mehrere Main Sessions gleichzeitig auf denselben Task/Checkout ansetzen.

## Rollen und Sicherheit

| Runtime-Name | Aufgabe | Delegation |
|---|---|---|
| `pi-workflows.researcher` | MCP-Recherche | keine |
| `pi-workflows.planer` | Plan und neue Korrekturphasen | advisor |
| `pi-workflows.manager` | serielle Umsetzung, Checkboxen | worker, advisor |
| `pi-workflows.worker` | genau eine Phase implementieren | keine |
| `pi-workflows.reviewer` | unabhängiges Review, keine Fixes | keine |
| `pi-workflows.advisor` | begrenzte Beratung | keine |

Der Namespace verhindert Kollisionen mit eingebauten Agents. Benutzer-/Projekt-Agents
und Overrides haben dennoch höhere Priorität: Preflight prüft die effektiven Rollen.

Keine automatischen Commits, Pushes, PRs, Ticketänderungen, Installationen oder
destruktiven Git-Operationen. Fremde lokale Änderungen werden weder entfernt noch gestasht.
Benutzerentscheidungen bleiben in Main.

### Grenzen der rein deklarativen Umsetzung

Das sind verbindliche **Agent-Anweisungen**, keine deterministische Zustandsmaschine:
- Kein Session-Start-Hook: das Task-Verzeichnis entsteht beim Workflow-Aufruf, nicht beim Start jeder beliebigen Pi-Session.
- Session-Zuordnung/Wiederaufnahme und atomare Statusschreibung werden von Main ausgeführt.
- Ein-Worker-Regel, Dateibesitz und Drei-Runden-Limit werden nicht durch eigene Locks,
  Prozesskontrollen oder Extension-Code technisch erzwungen.
- Tool-Allowlisten und `allowedAgents` begrenzen Fähigkeiten, aber Bash/Write sind keine
  Dateisystem-Sandbox; MCP-Read-only erfordert für harte Grenzen entsprechende Serverrechte.
- Native Completion und Fortsetzung müssen durch die installierte Pi-/Subagent-Version funktionieren.

Eine harte Garantie gegen Modellabweichungen oder konkurrierende Sessions würde eine
eigene Extension bzw. einen ausführbaren Controller erfordern. Darauf wird zugunsten
der gewünschten reinen Agents-/Prompts-/Skills-Lösung verzichtet.

## Entwicklung und Prüfungen

```bash
npm test
npm pack --dry-run
```

Die dependency-freien Node-Tests prüfen Manifest/Ressourcen, Frontmatter,
Delegationsrechte, Sicherheits-/Artefaktverträge und die reale UUID-Erstellung in einem
isolierten HOME. Es sind **keine** vollständigen LLM-/MCP-End-to-End-Tests.

Optional echte Discovery mit einer lokal installierten kompatiblen pi-subagents-Version:

```bash
PI_SUBAGENTS_ROOT=/absoluter/pfad/zu/node_modules/pi-subagents npm test
```

Dieser Test nutzt die interne Discovery der angegebenen Version und prüft sechs
Package-Agents ohne Parserdiagnosen. Er startet keine Modelle, verbindet keine MCP-Server
und ändert keine Pi-Benutzereinstellungen. Das Diagramm bleibt als Entwicklungsreferenz
im Repository, wird aber nicht im npm-Package ausgeliefert.
