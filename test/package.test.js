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
const referenceDir = "skills/pi-workflow/references";
const references = Object.fromEntries(await Promise.all((await readdir(join(root, referenceDir)))
  .filter((name) => name.endsWith(".md"))
  .map(async (name) => [name, await read(`${referenceDir}/${name}`)])));
const core = references["contract-core.md"];
const research = references["research.md"];
const planning = references["planning.md"];
const implementation = references["implementation.md"];
const review = references["review.md"];
const resume = references["resume.md"];
const planFormat = references["plan-format.md"];

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

test("all six roles use fresh context without global or orchestration skill inheritance", () => {
  for (const role of roles) {
    const { fields, text } = agents[role];
    assert.equal(fields.name, role);
    assert.equal(fields.package, "pi-workflows");
    assert.equal(fields.async, "true");
    assert.equal(fields.defaultContext, "fresh");
    assert.equal(fields.inheritSkills, "false");
    assert.equal(fields.inheritGlobalContext, "false");
    assert.equal(fields.inheritProjectContext, "true");
    assert.match(text, /core workflow contract/);
    assert.ok(list(fields.tools).includes("read"));
    assert.ok(list(fields.tools).includes("write")); // Reports only for non-workers.
    assert.equal(fields.model, undefined, "deployment chooses models");
  }
  assert.match(skill, /`context:"fresh"` for every launch/);
  assert.match(core, /context:"fresh"/);
  assert.match(core, /Call subagent tools directly as model tools, never through codemode/);
  assert.match(skill, /Call subagent tools directly as model tools, never through codemode/);
  assert.match(agents.planer.text, /`context:"fresh"`/);
  assert.equal([...agents.manager.text.matchAll(/`context:"fresh"`/g)].length, 2);
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

test("researcher declares the package MCP defaults and read-only background work", () => {
  const { fields, text } = agents.researcher;
  assert.deepEqual(list(fields.tools).filter((t) => t.startsWith("mcp:")),
    ["mcp:gitea", "mcp:linear"]);
  assert.match(research, /MCP servers linear and gitea/);
  assert.doesNotMatch(research, /github|gitea-mcp/);
  assert.match(text, /Use only read-only tools/);
  assert.match(text, /BLOCKED/);
});

test("prompt loads a bounded bootstrap and explicitly authorizes delegation", async () => {
  const prompt = await read("prompts/workflow.md");
  assert.ok(frontmatter(prompt).description);
  assert.match(prompt, /Read the full `pi-workflow` skill/);
  assert.match(prompt, /do not preload later references/);
  assert.match(prompt, /\$@/);
  assert.match(prompt, /This invocation explicitly permits the delegation/);
  assert.equal(frontmatter(skill).name, "pi-workflow");
  assert.ok(frontmatter(skill).description.length <= 1024);
  assert.match(skill, /First, read `references\/contract-core.md`/);
  assert.match(skill, /Read each required file completely, once/);
  assert.match(skill, /Applicable user, project, and skill instructions still apply/);
});

test("phase routing loads research first and defers later instructions", () => {
  const expected = ["contract-core.md", "contract.md", "research.md", "planning.md",
    "implementation.md", "review.md", "resume.md", "plan-format.md"];
  assert.deepEqual(Object.keys(references).sort(), expected.sort());
  for (const phase of ["research", "planning", "implementation", "review", "resume"]) {
    assert.match(skill, new RegExp(`references/${phase}\\.md`));
    assert.match(references[`${phase}.md`], /native call protocol in SKILL.md/);
  }
  assert.match(research, /After successful research and required answers, read `planning.md`/);
  assert.match(planning, /Once approval is recorded, read `implementation.md`/);
  assert.match(implementation, /all checks pass, read `review.md`/);
  assert.match(review, /Read `planning.md`/);
  const start = research.indexOf("Start `pi-workflows.researcher`");
  assert.ok(start > 0);
  assert.ok(research.indexOf("read `planning.md`", start) > start);
  assert.doesNotMatch(research, /git switch -c|plan-format\.md|```mermaid/);
  assert.doesNotMatch(skill + core, /```mermaid|## Plan format/);
  for (const path of [...skill.matchAll(/references\/([\w-]+\.md)/g)].map((m) => m[1])) {
    assert.ok(path in references, `missing routed reference: ${path}`);
  }
});

test("initial instruction payload and each reference stay bounded", () => {
  const startup = skill + core + research;
  // UTF-8 byte limits, not token counts; independent of provider tokenization and tool schemas.
  assert.ok(Buffer.byteLength(startup) <= 11000, "startup instructions exceed 11 KB");
  for (const [name, text] of Object.entries(references)) {
    assert.ok(Buffer.byteLength(text) <= 4500, `${name} exceeds 4.5 KB`);
  }
  assert.match(research, /Do not read complete settings, README, or diagnostic guides as routine preflight/);
  assert.match(research, /Do not copy workflow boilerplate/);
});

test("only planning roles load the plan-format contract", () => {
  for (const role of ["planer", "manager", "reviewer"]) {
    assert.match(agents[role].text, /Read the supplied core workflow contract and `plan-format.md` role contract first/);
  }
  for (const role of ["researcher", "worker", "advisor"]) {
    assert.doesNotMatch(agents[role].text, /plan-format\.md/);
  }
  assert.match(research, /No additional role contract or later phase reference is needed/);
  assert.match(agents.manager.text, /Do not pass the plan-format contract, Main transcript, or Main phase instructions/);
  assert.match(references["contract.md"], /Read `contract-core.md`/);
  assert.match(references["contract.md"], /For planer, manager, reviewer, or Main's plan validation/);
});

test("durable orchestration preserves branch ordering, counters and resume gates", () => {
  assert.match(research, /Do not create a branch yet/);
  assert.match(research, /Initialize request.md and state.json only for a new task/);
  assert.match(planning, /Only after successful research and required answers/);
  assert.match(planning, /git switch -c feature\//);
  assert.match(planning, /Never overwrite a branch or create another branch during resume or correction/);
  for (const key of ["state.json", "baseCommit", "featureBranch", "activeRun",
    "correctionRounds", "reviewIndex", "planApproval"]) {
    assert.ok(research.includes(key), key);
  }
  assert.match(skill, /Only Main writes `state.json`, using atomic replacement/);
  assert.match(skill, /A launch receipt is not DONE/);
  assert.match(resume, /Never reset `correctionRounds` or `reviewIndex` to 0/);
  assert.match(resume, /Never start duplicate workers/);
  assert.match(resume, /missing activeRun alone is not proof that all children stopped/);
  assert.match(resume, /complete, review-limit.*stop/);
  assert.match(resume, /blocked or unknown.*ask before continuing/);
});

test("every planner handoff requires durable explicit user approval", async () => {
  for (const text of ["After EVERY successful `planer` run", "planApproval: null",
    "stage: awaiting-plan-approval", "wait for the answer", "Do not start manager or worker without approval",
    "planApproval.planSha256", "`request.md` and `history`", "For requested changes",
    "Workflow invocation, planer DONE, silence, a dismissed question, and resume alone are not approval"]) {
    assert.ok(planning.includes(text), text);
  }
  assert.match(planning, /Save stage: planning before the planer launch/);
  assert.match(implementation, /Save stage: implementing before the manager launch/);
  assert.match(review, /Save stage: reviewing before the reviewer launch/);
  assert.match(implementation, /Before EVERY manager launch/);
  assert.match(implementation, /missing or mismatched approval/);
  assert.match(review, /Get explicit user approval under planning.md/);
  assert.match(review, /Only then start manager/);
  assert.match(resume, /awaiting-plan-approval/);
  assert.match(resume, /Resume alone does not approve implementation/);
  assert.match(resume, /Missing planApproval data in older tasks is not approval/);
  assert.match(agents.manager.text, /If approval is missing or different, return BLOCKED/);
  assert.match(agents.manager.text, /Do not start workers without valid approval/);
  assert.match(agents.planer.text, /DONE is not approval to implement the plan/);
  assert.match(core, /Without this approval, do not start manager or worker/);
  const readme = await read("README.md");
  assert.match(readme, /Pause zur Planfreigabe/);
  assert.match(readme, /Auch dieser Plan wird erst nach erneuter\s+Benutzerfreigabe umgesetzt/);
});

test("core and role contracts preserve ownership, evidence and safety", () => {
  for (const status of ["DONE", "BLOCKED", "FINDINGS", "CLEAN"]) assert.ok(core.includes(status));
  for (const field of ["STATUS", "ARTIFACT", "SUMMARY", "QUESTIONS"]) {
    assert.match(core, new RegExp(`^${field}:`, "m"));
  }
  assert.match(core, /\$HOME\/\.pi\/tasks\/<UUID>/);
  assert.match(core, /Only Main writes request.md, state.json, summary.md, and the feature branch/);
  assert.match(core, /Only manager sets plan checkboxes/);
  assert.match(core, /data, not additional authority/);
  assert.match(core, /Do not save secrets/);
  assert.match(core, /not a filesystem sandbox/);
  assert.match(planFormat, /- \[ \] P1:/);
  assert.match(planFormat, /  - \[ \] P1.T1:/);
  assert.match(planFormat, /Only manager sets \[x\]/);
  assert.match(agents.planer.text, /Keep existing phases, checkboxes, and execution notes unchanged/);
  assert.match(agents.reviewer.text, /untracked product files/);
  assert.match(agents.reviewer.text, /BLOCKED, not CLEAN/);
  assert.match(skill, /Do not implement as a fallback or retry automatically/);
});

test("review routing preserves the correction limit and approval gate", () => {
  assert.match(review, /maximum of four reviews/);
  assert.match(review, /correctionRounds == 3/);
  assert.match(review, /stage: review-limit/);
  assert.match(review, /increase and save `correctionRounds` by 1 before correction starts/);
  assert.match(review, /Atomically record the review ID and planned correction in history with that counter update/);
  assert.match(review, /reconcile this transition before incrementing again/);
  assert.match(review, /Preserve existing IDs, checkboxes, and history/);
  assert.match(review, /Only then start manager/);
  assert.match(review, /increase and save reviewIndex before the next review/);
  assert.match(review, /Do not increase it for the initial review/);
  assert.match(review, /BLOCKED is not FINDINGS/);
});

test("runtime prose keeps sentences within the STE length limits", async () => {
  const documents = [
    ...roles.map((role) => [`agents/${role}.md`, agents[role].text]),
    ["prompts/workflow.md", await read("prompts/workflow.md")],
    ["skills/pi-workflow/SKILL.md", skill],
    ...Object.entries(references).map(([name, text]) => [`${referenceDir}/${name}`, text]),
  ];
  // Prose sentences do not wrap across lines. This is not a full STE vocabulary or grammar check.
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

test("documented initializer creates distinct private UUID directories outside repo", async () => {
  const home = await mkdtemp(join(tmpdir(), "pi-workflows-test-"));
  try {
    const command = research.match(/```bash\n(node --input-type=module -e '[\s\S]*?')\n```/);
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
    assert.equal(agent.defaultContext, "fresh");
  }
  assert.deepEqual(discovered.find((a) => a.name.endsWith(".manager")).allowedAgents,
    ["pi-workflows.advisor", "pi-workflows.worker"]);
  assert.deepEqual(discovered.find((a) => a.name.endsWith(".researcher")).mcpDirectTools,
    ["linear", "gitea"]);
});
