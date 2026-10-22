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
    assert.match(text, /workflow contract/);
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
  assert.match(agents.manager.text, /exactly ONE/);
  assert.match(agents.manager.text, /terminal/);
  assert.match(agents.worker.text, /Never mark plan checkboxes yourself/);
});

test("researcher declares MCP selectors and background execution", () => {
  const { fields, text } = agents.researcher;
  assert.deepEqual(list(fields.tools).filter((t) => t.startsWith("mcp:")),
    ["mcp:gitea-mcp", "mcp:linear"]);
  assert.match(text, /Use only read-only tools/);
  assert.match(text, /BLOCKED/);
});

test("prompt loads skill and explicitly authorizes bounded delegation", async () => {
  const prompt = await read("prompts/workflow.md");
  assert.ok(frontmatter(prompt).description);
  assert.match(prompt, /Read the full `pi-workflow` skill/);
  assert.match(prompt, /\$@/);
  assert.match(prompt, /This invocation explicitly permits the delegation/);
  const fields = frontmatter(skill);
  assert.equal(fields.name, "pi-workflow");
  assert.ok(fields.description.length <= 1024);
});

test("durable orchestration includes branch ordering, counters and resume gates", () => {
  assert.match(skill, /references\/contract.md/);
  const researcherStart = skill.indexOf("Start `pi-workflows.researcher` with the original request");
  const branchCreation = skill.indexOf("git switch -c feature/");
  assert.ok(researcherStart >= 0 && branchCreation > researcherStart);
  for (const key of ["state.json", "baseCommit", "featureBranch", "activeRun",
    "correctionRounds", "reviewIndex", "review-limit", "summary.md"]) {
    assert.ok(skill.includes(key), key);
  }
  assert.match(skill, /correctionRounds == 3/);
  assert.match(skill, /increase and save `correctionRounds` by 1 before correction starts/);
  assert.match(skill, /maximum of four reviews/);
  assert.match(skill, /Never reset `correctionRounds` or `reviewIndex` to 0/);
  assert.match(skill, /Never start duplicate workers/);
  assert.match(skill, /launch receipt is not DONE/);
});

test("every planner handoff requires durable explicit user approval before implementation", async () => {
  const gateStart = skill.indexOf("## 4. Plan approval");
  const managerStart = skill.indexOf("Supply `plan.md` and all context paths to `pi-workflows.manager`");
  assert.ok(gateStart > 0 && managerStart > gateStart);
  const gate = skill.slice(gateStart, managerStart);
  for (const text of ["After EVERY successful `planer` run", "planApproval: null",
    "stage: awaiting-plan-approval", "wait for the answer", "Do not start manager or worker without approval",
    "planApproval.planSha256", "`request.md` and `history`", "For requested changes",
    "Workflow invocation, planer DONE, silence, a dismissed question, and resume alone are not approval"]) {
    assert.ok(gate.includes(text), text);
  }
  const review = skill.slice(skill.indexOf("## 5."), skill.indexOf("## 6."));
  assert.match(review, /Get plan approval under section 4/);
  assert.match(review, /Only then start manager/);
  const resume = skill.slice(skill.indexOf("## 6."));
  assert.match(resume, /awaiting-plan-approval/);
  assert.match(resume, /Resume alone does not approve implementation/);
  assert.match(resume, /Missing `planApproval` data in older tasks is not approval/);
  assert.match(agents.manager.text, /If approval is missing or different, return BLOCKED/);
  assert.match(agents.manager.text, /Do not start workers without valid approval/);
  assert.match(agents.planer.text, /DONE is not approval to implement the plan/);
  assert.match(contract, /Without this approval, do not start manager or worker/);
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
  assert.match(contract, /Only manager sets/);
  assert.match(agents.planer.text, /Keep existing phases, checkboxes, and execution notes unchanged/);
  assert.match(agents.reviewer.text, /untracked product files/);
  assert.match(agents.reviewer.text, /BLOCKED, not CLEAN/);
  assert.match(contract, /not a filesystem sandbox/);
});

test("runtime prose keeps sentences within the STE length limits", async () => {
  const documents = [
    ...roles.map((role) => [`agents/${role}.md`, agents[role].text]),
    ["prompts/workflow.md", await read("prompts/workflow.md")],
    ["skills/pi-workflow/SKILL.md", skill],
    ["skills/pi-workflow/references/contract.md", contract],
  ];
  // Prose sentences do not wrap across lines. This is not a complete STE vocabulary or grammar check.
  // Treat inline code as one technical term; exclude fenced code, headings, and tables.
  const sentences = (text) => text.replace(/`[^`\n]+`/g, "CODE")
    .split(/(?<=[.!?])\s+/).map((sentence) => sentence.match(/\S+/g) ?? []);
  for (const [path, text] of documents) {
    if (text.startsWith("---\n")) {
      for (const words of sentences(frontmatter(text).description)) {
        assert.ok(words.length <= 25, `${path}: description exceeds 25 words`);
      }
    }
    const prose = text.replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
    for (const line of prose.split("\n")) {
      if (/^\s*(?:#|\|)/.test(line)) continue;
      const instruction = line.replace(/^\s*(?:\d+\.|[-*])\s+/, "").trim();
      for (const words of sentences(instruction)) {
        assert.ok(words.length <= 20, `${path}: sentence exceeds 20 words: ${instruction}`);
      }
    }
  }
});

test("review diagram preserves the correction limit and approval gate", () => {
  const diagrams = [...skill.matchAll(/^```mermaid\n([\s\S]*?)^```/gm)];
  assert.equal(diagrams.length, 1);
  const diagram = diagrams[0][1];
  for (const edge of [
    'Result -->|CLEAN| Complete["Complete the workflow"]',
    'Result -->|BLOCKED| Stop["Record blocker and stop"]',
    'Result -->|FINDINGS| Limit{"correctionRounds == 3?"}',
    'Limit -->|Yes| ReviewLimit["Record review-limit and stop"]',
    'Limit -->|No| Count["Increase and save correctionRounds"]',
    'Count --> Plan["Planer appends correction phases"]',
    'Plan --> Approval["Get explicit user approval under section 4"]',
    'Approval --> Manager["Manager completes only open phases"]',
    'Manager --> Index["Increase reviewIndex"]',
    "Index --> Review",
  ]) {
    assert.ok(diagram.includes(edge), edge);
  }
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
