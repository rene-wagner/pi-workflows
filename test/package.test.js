import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(join(root, path), "utf8");
const roles = ["advisor", "manager", "planer", "researcher", "reviewer", "worker"];
// This deliberately small parser validates our scalar-only frontmatter, not general YAML.
function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, "frontmatter required");
  const fields = {};
  for (const line of match[1].split("\n")) {
    const entry = line.match(/^([A-Za-z][A-Za-z0-9-]*): (.*)$/);
    assert.ok(entry, `unsupported frontmatter line: ${line}`);
    assert.ok(!(entry[1] in fields), "duplicate frontmatter key");
    fields[entry[1]] = entry[2];
  }
  return fields;
}
const list = (value) => value?.split(",").map((v) => v.trim()).sort() ?? [];
const agents = Object.fromEntries(await Promise.all(roles.map(async (role) => {
  const text = await read(`agents/${role}.md`);
  return [role, { text, fields: frontmatter(text) }];
})));
const skill = await read("skills/pi-workflow/SKILL.md");
const contract = await read("skills/pi-workflow/references/contract.md");

test("manifest exposes only declarative runtime resources", async () => {
  const manifest = JSON.parse(await read("package.json"));
  assert.equal(manifest.name, "pi-workflows");
  assert.ok(manifest.keywords.includes("pi-package"));
  assert.deepEqual(manifest.pi, {
    skills: ["./skills"], prompts: ["./prompts"], subagents: { agents: ["./agents"] },
  });
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.pi.extensions, undefined);
  assert.deepEqual((await readdir(join(root, "agents"))).sort(), roles.map((r) => `${r}.md`));
  for (const path of ["agents", "prompts", "skills", "README.md"]) {
    assert.ok(manifest.files.includes(path));
    assert.ok(await stat(join(root, path)));
  }
});

test("all six roles are namespaced and inherit no orchestration skills", () => {
  for (const role of roles) {
    const { fields, text } = agents[role];
    assert.equal(fields.name, role);
    assert.equal(fields.package, "pi-workflows");
    assert.equal(fields.async, "true");
    assert.equal(fields.inheritSkills, "false");
    assert.equal(fields.inheritProjectContext, "true");
    assert.match(text, /Workflow-Vertrag/);
    assert.ok(list(fields.tools).includes("read"));
    assert.ok(list(fields.tools).includes("write")); // Reports only for non-workers.
    assert.equal(fields.model, undefined, "deployment chooses models");
  }
});

test("nested delegation is limited to the requested edges", () => {
  const allowed = {
    manager: ["pi-workflows.advisor", "pi-workflows.worker"],
    planer: ["pi-workflows.advisor"],
  };
  for (const role of roles) {
    const { fields } = agents[role];
    assert.equal(list(fields.tools).includes("subagent"), role in allowed);
    assert.deepEqual(list(fields.allowedAgents), allowed[role] ?? []);
    if (role in allowed) assert.equal(fields.maxSubagentDepth, "2");
  }
  assert.match(agents.manager.text, /genau EINEN/);
  assert.match(agents.manager.text, /terminal/);
  assert.match(agents.worker.text, /Plan-Checkboxen niemals selbst setzen/);
});

test("researcher declares MCP selectors and background execution", () => {
  const { fields, text } = agents.researcher;
  assert.deepEqual(list(fields.tools).filter((t) => t.startsWith("mcp:")),
    ["mcp:gitea-mcp", "mcp:linear"]);
  assert.match(text, /ausschließlich lesende Tools/);
  assert.match(text, /BLOCKED/);
});

test("prompt loads skill and explicitly authorizes bounded delegation", async () => {
  const prompt = await read("prompts/workflow.md");
  assert.ok(frontmatter(prompt).description);
  assert.match(prompt, /Skill `pi-workflow` vollständig/);
  assert.match(prompt, /\$@/);
  assert.match(prompt, /autorisiert ausdrücklich/);
  const fields = frontmatter(skill);
  assert.equal(fields.name, "pi-workflow");
  assert.ok(fields.description.length <= 1024);
});

test("durable orchestration includes branch ordering, counters and resume gates", () => {
  assert.match(skill, /references\/contract.md/);
  assert.ok(skill.indexOf("pi-workflows.researcher` mit Originalauftrag") <
    skill.indexOf("git switch -c feature/"));
  for (const key of ["state.json", "baseCommit", "featureBranch", "activeRun",
    "correctionRounds", "reviewIndex", "review-limit", "summary.md"]) {
    assert.ok(skill.includes(key), key);
  }
  assert.match(skill, /correctionRounds == 3/);
  assert.match(skill, /vor Beginn der Korrektur dauerhaft um 1 erhöhen/);
  assert.match(skill, /maximal vier Reviews/);
  assert.match(skill, /niemals auf 0 zurücksetzen/);
  assert.match(skill, /niemals doppelte Worker starten/);
  assert.match(skill, /Receipt\s+ist kein DONE/);
});

test("every planner handoff requires durable explicit user approval before implementation", async () => {
  const gateStart = skill.indexOf("## 4. Planfreigabe");
  const managerStart = skill.indexOf("`pi-workflows.manager` erhält plan.md");
  assert.ok(gateStart > 0 && managerStart > gateStart);
  const gate = skill.slice(gateStart, managerStart);
  for (const text of ["Nach JEDEM erfolgreichen planer-Durchlauf", "planApproval: null",
    "stage: awaiting-plan-approval", "auf dessen Antwort warten", "Kein manager/worker-Start",
    "planApproval.planSha256", "request.md und history", "Änderungswünschen",
    "Workflow-Aufruf, planer-DONE, Schweigen, Abbruch der Frage und bloßes resume gelten nicht"]) {
    assert.ok(gate.includes(text), text);
  }
  const review = skill.slice(skill.indexOf("## 5."), skill.indexOf("## 6."));
  assert.match(review, /Planfreigabe aus Abschnitt 4 einholen/);
  assert.match(review, /Erst danach manager/);
  const resume = skill.slice(skill.indexOf("## 6."));
  assert.match(resume, /awaiting-plan-approval/);
  assert.match(resume, /resume allein gibt die Umsetzung nicht frei/);
  assert.match(resume, /Fehlende `planApproval`-Daten älterer\s+Tasks sind keine Freigabe/);
  assert.match(agents.manager.text, /Bei fehlender oder abweichender\s+Freigabe BLOCKED/);
  assert.match(agents.manager.text, /keine Worker starten/);
  assert.match(agents.planer.text, /DONE ist keine Implementierungsfreigabe/);
  assert.match(contract, /Ohne diese Freigabe dürfen weder manager\/worker starten/);
  const readme = await read("README.md");
  assert.match(readme, /Pause zur Planfreigabe/);
  assert.match(readme, /Auch dieser Plan wird erst nach erneuter\s+Benutzerfreigabe umgesetzt/);
});

test("artifact, plan and review contracts preserve ownership and validation", () => {
  for (const status of ["DONE", "BLOCKED", "FINDINGS", "CLEAN"]) {
    assert.ok(contract.includes(status));
  }
  assert.match(contract, /\$HOME\/\.pi\/tasks\/<UUID>/);
  assert.match(contract, /- \[ \] P1:/);
  assert.match(contract, /  - \[ \] P1.T1:/);
  assert.match(contract, /Nur manager setzt/);
  assert.match(agents.planer.text, /Bestehende Phasen\/Checkboxen/);
  assert.match(agents.reviewer.text, /untracked Produktdateien/);
  assert.match(agents.reviewer.text, /BLOCKED, nicht CLEAN/);
  assert.match(contract, /keine Filesystem-Sandbox/);
});

test("documented initializer creates distinct private UUID directories outside repo", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-workflows-test-"));
  try {
    const command = skill.match(/```bash\n(node --input-type=module -e '[\s\S]*?')\n```/);
    assert.ok(command, "executable initializer present");
    const run = () => execFileSync("bash", ["-c", command[1]], {
      env: { ...process.env, HOME: home }, encoding: "utf8",
    }).trim();
    const first = run();
    const second = run();
    assert.notEqual(first, second);
    for (const dir of [first, second]) {
      assert.equal(resolve(dir, ".."), join(home, ".pi", "tasks"));
      assert.match(dir.split("/").at(-1),
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      assert.equal((await stat(dir)).mode & 0o777, 0o700);
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("optional installed pi-subagents discovers six valid package agents", {
  skip: !process.env.PI_SUBAGENTS_ROOT && "set PI_SUBAGENTS_ROOT for real discovery",
}, async () => {
  const modulePath = join(resolve(process.env.PI_SUBAGENTS_ROOT), "src/agents/agents.js");
  const { discoverAgents } = await import(pathToFileURL(modulePath).href);
  const result = discoverAgents(root, "project");
  const discovered = result.agents.filter((a) => a.name.startsWith("pi-workflows."));
  assert.deepEqual(discovered.map((a) => a.name).sort(), roles.map((r) => `pi-workflows.${r}`));
  assert.deepEqual(result.agentDiagnostics, []);
  for (const agent of discovered) {
    assert.equal(agent.source, "package");
    assert.equal(agent.defaultAsync, true);
  }
  assert.deepEqual(discovered.find((a) => a.name.endsWith(".manager")).allowedAgents,
    ["pi-workflows.advisor", "pi-workflows.worker"]);
  assert.deepEqual(discovered.find((a) => a.name.endsWith(".researcher")).mcpDirectTools,
    ["linear", "gitea-mcp"]);
});
