import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const profile = JSON.parse(await readFile(join(root, "profiles/lean-project.settings.json"), "utf8"));

test("lean profile excludes only the general orchestration skill without replacing global resources", async () => {
  assert.deepEqual(profile, {
    packages: [{
      source: "npm:pi-subagents",
      autoload: false,
      skills: ["!skills/pi-subagents/**"],
    }],
  });
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.ok(manifest.files.includes("profiles"));
});

test("optional Pi loader applies the project filter and preserves extension, council skill, and prompts", {
  skip: !process.env.PI_BINARY && "set PI_BINARY for real Pi resource-loader verification",
}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-workflows-profile-"));
  try {
    const agentDir = join(dir, "agent");
    const project = join(dir, "project");
    const pkg = join(agentDir, "npm/node_modules/pi-subagents");
    const otherProject = join(dir, "other-project");
    await mkdir(otherProject);
    const put = async (path, content) => {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, content);
    };
    const json = (value) => JSON.stringify(value, null, 2) + "\n";
    // An offline cached fixture, not the installed package or real user settings.
    await put(join(pkg, "package.json"), json({
      name: "pi-subagents", version: "0.80.0", type: "module",
      pi: { extensions: ["index.js"], skills: ["skills"], prompts: ["prompts"] },
    }));
    await put(join(pkg, "index.js"), "export default function () {}\n");
    for (const name of ["pi-subagents", "council-mode"]) {
      await put(join(pkg, "skills", name, "SKILL.md"),
        "---\nname: " + name + "\ndescription: Offline test skill.\n---\nTest.\n");
    }
    await put(join(pkg, "prompts/council.md"), "---\ndescription: Offline prompt.\n---\nTest.\n");
    await put(join(agentDir, "settings.json"), json({ packages: ["npm:pi-subagents"] }));
    await put(join(project, ".pi/settings.json"), json(profile));
    await put(join(project, ".pi/skills/project-skill/SKILL.md"),
      "---\nname: project-skill\ndescription: Project test skill.\n---\nTest.\n");

    // The standalone host supplies its real SDK to this test-only extension.
    // It exits during resource loading, before any session, model, or MCP request.
    const harness = join(dir, "verify.ts");
    await put(harness, `
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

export default async function () {
  try {
    const cwd = ${JSON.stringify(project)};
    const agentDir = ${JSON.stringify(agentDir)};
    const loader = new DefaultResourceLoader({
      cwd, agentDir,
      settingsManager: SettingsManager.create(cwd, agentDir),
    });
    await loader.reload();
    const unfiltered = new DefaultResourceLoader({
      cwd: ${JSON.stringify(otherProject)}, agentDir,
      settingsManager: SettingsManager.create(${JSON.stringify(otherProject)}, agentDir),
    });
    await unfiltered.reload();
    console.log("PROFILE_RESULT:" + JSON.stringify({
      unfilteredSkills: unfiltered.getSkills().skills.map((s) => s.name),
      skills: loader.getSkills(),
      extensions: loader.getExtensions().extensions.map((e) => e.path),
      prompts: loader.getPrompts().prompts.map((p) => p.name),
    }));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
`);
    const output = execFileSync(process.env.PI_BINARY, [
      "--offline", "--no-extensions", "--no-mcp", "--no-skills", "--no-context-files",
      "--no-prompt-templates", "--no-themes", "--no-session", "--approve",
      "-e", harness, "-p", "UNUSED: the verification exits before prompting",
    ], {
      cwd: project, timeout: 30000, encoding: "utf8",
      env: { ...process.env, HOME: dir, PI_CODING_AGENT_DIR: join(dir, "host"), PI_OFFLINE: "1", PI_TELEMETRY: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const line = output.split("\n").find((line) => line.startsWith("PROFILE_RESULT:"));
    assert.ok(line, output);
    const result = JSON.parse(line.slice("PROFILE_RESULT:".length));
    assert.deepEqual(result.skills.skills.map((s) => s.name).sort(), ["council-mode", "project-skill"]);
    assert.deepEqual(result.skills.diagnostics, []);
    assert.deepEqual(result.unfilteredSkills.sort(), ["council-mode", "pi-subagents"]);
    assert.ok(result.extensions.some((path) => path === join(pkg, "index.js")));
    assert.ok(result.prompts.includes("council"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
