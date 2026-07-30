import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runInit } from "../src/commands/init";
import { readTemplate } from "../src/core/templates";
import { captureIo, createTempWorkspace, initGitMarker, readFile, snapshotFileTree, writeFile } from "./helpers";

describe("init", () => {
  it("creates expected structure in empty folder for assistants=all with codex-max defaults", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    const io = captureIo();
    const code = await runInit({ root }, io.io);

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "GEMINI.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".codex", "config.toml"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "harness", "observability", "docker-compose.yml"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "context", "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "memory", "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "knowledge", "INDEX.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "knowledge", "rules", "coding-agent-workflow.md"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(root, ".agent", "knowledge", "standards", "validation.md"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(root, ".agent", "prompts", "validate-readiness.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "prompts", "integrate-local-telemetry.md"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(root, ".agent", "PLANS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "execplans", "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "veloran-manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "docs", "LOCAL_TELEMETRY_SETUP.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "docs", "HARNESS_SETUP.md"))).toBe(true);
    expect(
      fs.existsSync(
        path.join(root, ".agent", "harness", "observability", "local", "service-topology.example.yaml"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".agents", "skills", "init-harness", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".agents", "skills", "execplan-create", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".agents", "skills", "execplan-execute", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".claude", "skills", "init-harness", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".claude", "skills", "execplan-create", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".claude", "skills", "execplan-execute", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".agent", "skills", "init-harness", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".agent", "skills", "execplan-create", "SKILL.md")),
    ).toBe(true);

    const agents = readFile(root, "AGENTS.md");
    expect(agents).toContain("<!-- execplans:begin -->");
    expect(agents).toContain("<!-- execplans:end -->");
    expect(agents).toContain(".agent/context/");
    expect(agents).toContain(".agent/memory/");
    expect(agents).toContain(".agent/knowledge/");
    expect(agents).toContain(".agent/prompts/");

    const skill = readFile(root, ".agents/skills/execplan-create/SKILL.md");
    expect(skill).toContain("name: execplan-create");
    expect(skill).toContain("description:");
    const claudeSkill = readFile(root, ".claude/skills/execplan-create/SKILL.md");
    expect(claudeSkill).toContain("name: execplan-create");
    expect(claudeSkill).toContain("description:");

    expect(io.lines.some((line) => line.startsWith("Create:"))).toBe(false);
    expect(io.lines.some((line) => line.includes("Veloran is ready."))).toBe(true);
    expect(io.lines.some((line) => line.includes("Core skills installed:"))).toBe(true);
    expect(io.lines.some((line) => line.includes("init-harness"))).toBe(true);
    expect(io.lines.some((line) => line.includes("@init-harness"))).toBe(true);
    expect(io.lines.some((line) => line.includes("@execplan-create"))).toBe(true);
    expect(io.lines.some((line) => line.includes("real project start paths"))).toBe(true);
    expect(io.lines.some((line) => line.includes("veloran --help"))).toBe(true);
    expect(io.lines.some((line) => line.includes("doctor --apps"))).toBe(false);
  });

  it("supports opting into the minimal standard preset explicitly", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    await runInit({ root, preset: "standard" });

    expect(fs.existsSync(path.join(root, ".codex", "config.toml"))).toBe(false);
    expect(fs.existsSync(path.join(root, "ARCHITECTURE.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, "docs"))).toBe(false);
  });

  it("scaffolds opencode with AGENTS.md and shared skills, but not CLAUDE.md", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    await runInit({ root, assistants: "opencode" });

    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(false);
    expect(
      fs.existsSync(path.join(root, ".agents", "skills", "execplan-create", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".agents", "skills", "execplan-execute", "SKILL.md")),
    ).toBe(true);
  });

  it("scaffolds claude with CLAUDE.md and native Claude Code skills", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    await runInit({ root, assistants: "claude" });

    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(false);
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".claude", "skills", "execplan-create", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".claude", "skills", "execplan-execute", "SKILL.md")),
    ).toBe(true);
  });

  it("scaffolds project-scope apps with Antigravity workspace skills", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    await runInit({
      root,
      preset: "harness",
      apps: "codex,claude,opencode,antigravity",
      scope: "project",
      yes: true,
    });

    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "GEMINI.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".codex", "config.toml"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".claude", "settings.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "opencode.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "skills", "init-harness", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agents", "skills", "init-harness", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".claude", "skills", "init-harness", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "memory", "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "docs", "ANTIGRAVITY_SETUP.md"))).toBe(true);
  });

  it("filters native app files to selected project apps", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    await runInit({ root, apps: "antigravity", scope: "project", yes: true });

    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "GEMINI.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "skills", "init-harness", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".codex"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".claude"))).toBe(false);
    expect(fs.existsSync(path.join(root, ".opencode"))).toBe(false);
    expect(fs.existsSync(path.join(root, "opencode.json"))).toBe(false);
  });

  it("scaffolds a generic AGENTS target with shared core skills", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    await runInit({ root, assistants: "agents" });

    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "CLAUDE.md"))).toBe(false);
    expect(
      fs.existsSync(path.join(root, ".agents", "skills", "execplan-create", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".agents", "skills", "execplan-execute", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(root, ".agents", "skills", "init-harness", "SKILL.md")),
    ).toBe(true);
  });

  it("is idempotent on rerun without force", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    await runInit({ root });
    const before = snapshotFileTree(root);

    await runInit({ root });
    const after = snapshotFileTree(root);

    expect(after).toEqual(before);
  });

  it("preserves AGENTS custom text while appending/updating managed block", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    writeFile(root, "AGENTS.md", "# Team Rules\n\nDo not remove this line.\n");

    await runInit({ root, assistants: "codex" });
    const first = readFile(root, "AGENTS.md");

    expect(first).toContain("Do not remove this line.");
    expect(first).toContain("<!-- execplans:begin -->");
    expect(first).toContain("<!-- execplans:end -->");

    await runInit({ root, assistants: "codex" });
    const second = readFile(root, "AGENTS.md");

    expect(second).toContain("Do not remove this line.");
    expect(second.match(/<!-- execplans:begin -->/g)?.length).toBe(1);
  });

  it("updates only the managed region when markers already exist", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    writeFile(
      root,
      "AGENTS.md",
      [
        "# Custom Header",
        "",
        "<!-- execplans:begin -->",
        "old block",
        "<!-- execplans:end -->",
        "",
        "Footer note",
        "",
      ].join("\n"),
    );

    await runInit({ root, assistants: "codex" });

    const content = readFile(root, "AGENTS.md");
    expect(content.startsWith("# Custom Header")).toBe(true);
    expect(content).toContain("Footer note");
    expect(content).toContain(
      "When writing complex features or significant refactors, use an ExecPlan",
    );
    expect(content).not.toContain("old block");
  });

  it("leaves existing PLANS unchanged unless force", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    writeFile(root, ".agent/PLANS.md", "# Custom Plans\n");

    await runInit({ root });
    const withoutForce = readFile(root, ".agent/PLANS.md");
    expect(withoutForce).toBe("# Custom Plans\n");

    await runInit({ root, force: true });
    const withForce = readFile(root, ".agent/PLANS.md");
    expect(withForce).toBe(readTemplate("PLANS.md"));
  });

  it("supports dry-run without writing files", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    const io = captureIo();
    await runInit({ root, dryRun: true }, io.io);

    expect(io.lines.some((line) => line.startsWith("Would Create:"))).toBe(true);
    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(false);
  });

  it("previews user-scope installs without writing into the user home", async () => {
    const userHome = createTempWorkspace("veloran-home-");
    const previousHome = process.env.VELORAN_HOME;
    process.env.VELORAN_HOME = userHome;

    try {
      const io = captureIo();
      await runInit(
        {
          apps: "codex,claude,antigravity",
          scope: "user",
          yes: true,
          dryRun: true,
        },
        io.io,
      );

      expect(io.lines.some((line) => line.includes("User install home:"))).toBe(true);
      expect(io.lines.some((line) => line.includes(".codex/skills"))).toBe(true);
      expect(io.lines.some((line) => line.includes(".claude/skills"))).toBe(true);
      expect(io.lines.some((line) => line.includes(".gemini/antigravity/skills"))).toBe(true);
      expect(io.lines.some((line) => line.includes("Planned user-scope manifest"))).toBe(true);
      expect(fs.existsSync(path.join(userHome, ".codex"))).toBe(false);
      expect(fs.existsSync(path.join(userHome, ".claude"))).toBe(false);
      expect(fs.existsSync(path.join(userHome, ".gemini"))).toBe(false);
    } finally {
      if (previousHome === undefined) {
        delete process.env.VELORAN_HOME;
      } else {
        process.env.VELORAN_HOME = previousHome;
      }
    }
  });

  it("installs one shared skill copy when Codex and OpenCode are selected", async () => {
    const userHome = createTempWorkspace("veloran-home-");

    await runInit({
      apps: "codex,opencode",
      scope: "user",
      userHome,
      yes: true,
    });

    for (const skillName of ["init-harness", "execplan-create", "execplan-execute"]) {
      expect(
        fs.existsSync(path.join(userHome, ".agents", "skills", skillName, "SKILL.md")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(userHome, ".codex", "skills", skillName, "SKILL.md")),
      ).toBe(false);
    }
  });

  it("removes obsolete Codex copies that still match Veloran templates", async () => {
    const userHome = createTempWorkspace("veloran-home-");

    for (const skillName of ["init-harness", "execplan-create", "execplan-execute"] as const) {
      writeFile(
        userHome,
        `.codex/skills/${skillName}/SKILL.md`,
        readTemplate(`skills/${skillName}.SKILL.md`),
      );
    }

    await runInit({
      apps: "all",
      scope: "user",
      userHome,
      yes: true,
    });

    for (const skillName of ["init-harness", "execplan-create", "execplan-execute"]) {
      expect(
        fs.existsSync(path.join(userHome, ".agents", "skills", skillName, "SKILL.md")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(userHome, ".codex", "skills", skillName, "SKILL.md")),
      ).toBe(false);
    }
  });

  it("preserves a customized Codex skill while deduplicating user installs", async () => {
    const userHome = createTempWorkspace("veloran-home-");
    const customSkill = [
      "---",
      "name: execplan-create",
      "description: My customized skill",
      "---",
      "Keep this content.",
      "",
    ].join("\n");
    writeFile(userHome, ".codex/skills/execplan-create/SKILL.md", customSkill);

    await runInit({
      apps: "codex,agents",
      scope: "user",
      userHome,
      yes: true,
    });

    expect(readFile(userHome, ".codex/skills/execplan-create/SKILL.md")).toBe(customSkill);
  });

  it("appends user-scope prompt blocks without overwriting user prompt text", async () => {
    const userHome = createTempWorkspace("veloran-home-");
    writeFile(userHome, ".veloran/prompts/AGENTS.md", "# My existing user prompt\n\nKeep this.\n");

    await runInit({
      apps: "agents",
      scope: "user",
      userHome,
      yes: true,
    });

    const first = readFile(userHome, ".veloran/prompts/AGENTS.md");
    expect(first).toContain("# My existing user prompt");
    expect(first).toContain("Keep this.");
    expect(first).toContain("<!-- execplans:begin -->");
    expect(first).toContain("<!-- execplans:end -->");
    expect(fs.existsSync(path.join(userHome, ".veloran", "knowledge", "INDEX.md"))).toBe(true);
    expect(
      fs.existsSync(path.join(userHome, ".veloran", "knowledge", "rules", "personal-agent-defaults.md")),
    ).toBe(true);

    await runInit({
      apps: "agents",
      scope: "user",
      userHome,
      yes: true,
      force: true,
    });

    const second = readFile(userHome, ".veloran/prompts/AGENTS.md");
    expect(second).toContain("# My existing user prompt");
    expect(second.match(/<!-- execplans:begin -->/g)?.length).toBe(1);
  });

  it("runs the magic installer with local path and app prompts", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);
    const answers = ["local", root, "antigravity", "n"];
    const lines: string[] = [];
    const io = {
      log(line: string) {
        lines.push(line);
      },
      async prompt() {
        const answer = answers.shift();
        if (answer === undefined) {
          throw new Error("Unexpected prompt");
        }

        return answer;
      },
    };

    await runInit({ magic: true }, io);

    expect(answers).toEqual([]);
    expect(fs.existsSync(path.join(root, "GEMINI.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".agent", "skills", "init-harness", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".codex"))).toBe(false);
  });

  it("uses menu selectors for magic installer choices when available", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);
    const selectQuestions: string[] = [];
    const multiselectQuestions: string[] = [];
    const answers = [root];
    const io = {
      log() {},
      async prompt() {
        const answer = answers.shift();
        if (answer === undefined) {
          throw new Error("Unexpected prompt");
        }

        return answer;
      },
      async select(question: string) {
        selectQuestions.push(question);
        return question.includes("Overwrite") ? "no" : "project";
      },
      async multiselect(question: string) {
        multiselectQuestions.push(question);
        return ["codex", "antigravity"];
      },
    };

    await runInit({ magic: true }, io);

    expect(answers).toEqual([]);
    expect(selectQuestions).toEqual([
      "Install Veloran where?",
      "Overwrite existing managed files when needed?",
    ]);
    expect(multiselectQuestions).toEqual(["Which vendor/apps should Veloran support?"]);
    expect(fs.existsSync(path.join(root, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "GEMINI.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".codex", "config.toml"))).toBe(true);
    expect(fs.existsSync(path.join(root, ".claude"))).toBe(false);
  });

  it("defaults magic installer location to user and confirmation to yes", async () => {
    const userHome = createTempWorkspace();
    const selectDefaults = new Map<string, string>();
    const io = {
      log() {},
      async prompt() {
        throw new Error("Unexpected prompt");
      },
      async select(question: string, _choices: unknown[], defaultValue: string) {
        selectDefaults.set(question, defaultValue);
        if (question === "Install Veloran where?") {
          return defaultValue;
        }
        if (question === "User-scope install can affect all repositories for this user. Continue?") {
          return defaultValue;
        }
        return "no";
      },
      async multiselect() {
        return ["codex"];
      },
    };

    await runInit({ magic: true, userHome }, io);

    expect(selectDefaults.get("Install Veloran where?")).toBe("user");
    expect(selectDefaults.get("User-scope install can affect all repositories for this user. Continue?")).toBe(
      "yes",
    );
    expect(fs.existsSync(path.join(userHome, ".veloran", "manifest.json"))).toBe(true);
  });

  it("treats empty text confirmation as yes for user-scope installs", async () => {
    const userHome = createTempWorkspace();
    const answers = ["global", "codex", "n", ""];
    const io = {
      log() {},
      async prompt() {
        const answer = answers.shift();
        if (answer === undefined) {
          throw new Error("Unexpected prompt");
        }

        return answer;
      },
    };

    await runInit({ magic: true, userHome }, io);

    expect(answers).toEqual([]);
    expect(fs.existsSync(path.join(userHome, ".veloran", "manifest.json"))).toBe(true);
  });

  it("keeps user-scope install output quiet by default", async () => {
    const userHome = createTempWorkspace();
    const io = captureIo();

    await runInit({ apps: "codex", scope: "user", yes: true, userHome }, io.io);

    expect(io.lines.some((line) => line.startsWith("Create:"))).toBe(false);
    expect(io.lines.some((line) => line.includes("Veloran user skills are ready."))).toBe(true);
    expect(io.lines.some((line) => line.includes("Install home:"))).toBe(true);
    expect(
      fs.existsSync(path.join(userHome, ".codex", "skills", "init-harness", "SKILL.md")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(userHome, ".agents", "skills", "init-harness", "SKILL.md")),
    ).toBe(false);
  });

  it("requires explicit confirmation before real user-scope writes", async () => {
    await expect(runInit({ apps: "codex", scope: "user" })).rejects.toThrow(
      "User-scope install requires --yes",
    );
  });

  it("shows file-by-file actions when verbose is enabled", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    const io = captureIo();
    await runInit({ root, verbose: true }, io.io);

    expect(io.lines.some((line) => line.startsWith("Create:"))).toBe(true);
    expect(io.lines.some((line) => line.includes("Veloran is ready."))).toBe(true);
    expect(
      io.lines.some((line) => line.includes(".agent/prompts/integrate-local-telemetry.md")),
    ).toBe(true);
  });

  it("applies codex-max preset templates", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    await runInit({ root, preset: "codex-max" });

    expect(fs.existsSync(path.join(root, ".codex", "config.toml"))).toBe(true);
    expect(fs.existsSync(path.join(root, "ARCHITECTURE.md"))).toBe(true);

    const expectedCodexMaxPaths = [
      "docs/design-docs/index.md",
      "docs/design-docs/core-beliefs.md",
      "docs/exec-plans/active/.gitkeep",
      "docs/exec-plans/completed/.gitkeep",
      "docs/exec-plans/tech-debt-tracker.md",
      "docs/generated/db-schema.md",
      "docs/generated/observability-validation.md",
      "docs/generated/harness-validation.md",
      "docs/HARNESS_SETUP.md",
      "docs/APP_TARGETS.md",
      "docs/SKILLS.md",
      "docs/MEMORY.md",
      "docs/ANTIGRAVITY_SETUP.md",
      "docs/OBSERVABILITY_RUNBOOK.md",
      "docs/product-specs/index.md",
      "docs/product-specs/new-user-onboarding.md",
      "docs/references/design-system-reference-llms.txt",
      "docs/references/nixpacks-llms.txt",
      "docs/references/uv-llms.txt",
      "docs/DESIGN.md",
      "docs/FRONTEND.md",
      "docs/PLANS.md",
      "docs/PRODUCT_SENSE.md",
      "docs/QUALITY_SCORE.md",
      "docs/RELIABILITY.md",
      "docs/SECURITY.md",
      ".agent/harness/worktree/common.sh",
      ".agent/harness/worktree/up.sh",
      ".agent/harness/worktree/down.sh",
      ".agent/harness/worktree/status.sh",
      ".agent/harness/worktree/app-start.sh",
      ".agent/harness/state/.gitkeep",
      ".agent/context/README.md",
      ".agent/memory/README.md",
      ".agent/memory/INDEX.md",
      ".agent/knowledge/INDEX.md",
      ".agent/knowledge/README.md",
      ".agent/knowledge/rules/coding-agent-workflow.md",
      ".agent/knowledge/rules/safety-and-secrets.md",
      ".agent/knowledge/standards/validation.md",
      ".agent/knowledge/standards/documentation.md",
      ".agent/knowledge/facts/README.md",
      ".agent/knowledge/docs/README.md",
      ".agent/context/repo-overview.md",
      ".agent/context/commands.md",
      ".agent/context/testing.md",
      ".agent/context/architecture-notes.md",
      ".agent/prompts/onboard-repository.md",
      ".agent/prompts/validate-readiness.md",
      ".agent/prompts/debugging-handoff.md",
      ".agent/prompts/release-checks.md",
      ".agent/prompts/integrate-local-telemetry.md",
      ".agent/veloran-manifest.json",
      ".claude/settings.json",
      ".claude/agents/browser-debugger.md",
      ".claude/agents/code-mapper.md",
      ".claude/agents/docs-researcher.md",
      ".claude/agents/reviewer.md",
      ".claude/rules/context-cache.md",
      ".claude/rules/verification.md",
      ".claude/skills/init-harness/SKILL.md",
      ".claude/skills/ui-legibility/SKILL.md",
      ".codex/agents/browser-debugger.toml",
      ".codex/agents/code-mapper.toml",
      ".codex/agents/docs-researcher.toml",
      ".codex/agents/reviewer.toml",
      ".mcp.json",
      ".opencode/agents/browser-debugger.md",
      ".opencode/agents/code-mapper.md",
      ".opencode/agents/docs-researcher.md",
      ".opencode/agents/reviewer.md",
      ".opencode/commands/implementation-plan.md",
      ".opencode/commands/review-changes.md",
      ".opencode/commands/validate-readiness.md",
      ".agent/skills/init-harness/SKILL.md",
      ".agent/skills/execplan-create/SKILL.md",
      ".agent/skills/execplan-execute/SKILL.md",
      ".agent/harness/observability/docker-compose.yml",
      ".agent/harness/observability/fixture/emit-local-telemetry.py",
      ".agent/harness/observability/local/.gitignore",
      ".agent/harness/observability/local/README.md",
      ".agent/harness/observability/local/service-topology.example.yaml",
      ".agent/harness/observability/local/cluster-up.example.sh",
      ".agent/harness/observability/local/cluster-down.example.sh",
      ".agent/harness/observability/local/env.local.example",
      ".agent/harness/observability/runtime/.gitignore",
      ".agent/harness/observability/runtime/logs/.gitignore",
      ".agent/harness/observability/vector/vector.yaml",
      ".agent/harness/observability/smoke.sh",
      ".agent/harness/mcp/observability-server/package.json",
      ".agent/harness/mcp/observability-server/README.md",
      ".agent/harness/mcp/observability-server/server.mjs",
      ".agents/skills/init-harness/SKILL.md",
      ".agents/skills/execplan-create/SKILL.md",
      ".agents/skills/execplan-execute/SKILL.md",
      ".agents/skills/ui-legibility/SKILL.md",
      "GEMINI.md",
      "docs/LOCAL_TELEMETRY_SETUP.md",
      "opencode.json",
    ];

    for (const relativePath of expectedCodexMaxPaths) {
      expect(fs.existsSync(path.join(root, relativePath))).toBe(true);
    }

    const codexConfig = readFile(root, ".codex/config.toml");
    expect(codexConfig).toContain("project_doc_fallback_filenames");
    expect(codexConfig).toContain("project_doc_max_bytes");
    expect(codexConfig).toContain("[agents]");
    expect(codexConfig).toContain("[mcp_servers.chrome_devtools]");
    expect(codexConfig).toContain("[mcp_servers.observability]");
    expect(codexConfig).toContain("command = \"npx\"");

    const reviewerAgent = readFile(root, ".codex/agents/reviewer.toml");
    expect(reviewerAgent).toContain("name = \"reviewer\"");
    expect(reviewerAgent).toContain("developer_instructions");

    const claudeSettings = JSON.parse(readFile(root, ".claude/settings.json")) as {
      plansDirectory: string;
      enabledMcpjsonServers: string[];
    };
    expect(claudeSettings.plansDirectory).toBe(".agent/execplans");
    expect(claudeSettings.enabledMcpjsonServers).toContain("chrome-devtools");

    const claudeMcp = JSON.parse(readFile(root, ".mcp.json")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(claudeMcp.mcpServers)).toContain("observability");

    const claudeReviewer = readFile(root, ".claude/agents/reviewer.md");
    expect(claudeReviewer).toContain("name: reviewer");
    expect(claudeReviewer).toContain("correctness-first review");
    const claudeUiSkill = readFile(root, ".claude/skills/ui-legibility/SKILL.md");
    expect(claudeUiSkill).toContain("DOM snapshots");
    expect(claudeUiSkill).toContain("screenshots");

    const openCodeConfig = JSON.parse(readFile(root, "opencode.json")) as {
      instructions: string[];
    };
    expect(openCodeConfig.instructions).toContain(".agent/context/*.md");
    expect(openCodeConfig.instructions).toContain(".agent/memory/*.md");
    expect(openCodeConfig.instructions).toContain(".agent/prompts/*.md");
    expect(openCodeConfig.instructions).toContain(".agent/knowledge/INDEX.md");
    expect(openCodeConfig.instructions).toContain(".agent/knowledge/rules/*.md");
    expect(openCodeConfig.instructions).toContain(".agent/knowledge/standards/*.md");

    const openCodeReviewer = readFile(root, ".opencode/agents/reviewer.md");
    expect(openCodeReviewer).toContain("description: Review changes for correctness");
    expect(openCodeReviewer).toContain("mode: subagent");

    const openCodeValidate = readFile(root, ".opencode/commands/validate-readiness.md");
    expect(openCodeValidate).toContain("description: Validate whether the current work is ready to land");
    expect(openCodeValidate).toContain("agent: reviewer");

    const uiSkill = readFile(root, ".agents/skills/ui-legibility/SKILL.md");
    expect(uiSkill).toContain("DOM snapshots");
    expect(uiSkill).toContain("screenshots");

    const claude = readFile(root, "CLAUDE.md");
    expect(claude).toContain(".agent/context/");
    expect(claude).toContain(".agent/memory/");
    expect(claude).toContain(".agent/knowledge/");
    expect(claude).toContain(".agent/prompts/");

    const gemini = readFile(root, "GEMINI.md");
    expect(gemini).toContain("init-harness");
    expect(gemini).toContain(".agent/memory/");
    expect(gemini).toContain(".agent/knowledge/");

    const upStat = fs.statSync(path.join(root, ".agent/harness/worktree/up.sh"));
    expect((upStat.mode & 0o111) !== 0).toBe(true);

    const smokeStat = fs.statSync(path.join(root, ".agent/harness/observability/smoke.sh"));
    expect((smokeStat.mode & 0o111) !== 0).toBe(true);

    const observabilityServer = readFile(root, ".agent/harness/mcp/observability-server/server.mjs");
    expect(observabilityServer).toContain("query_logs");
    expect(observabilityServer).toContain("query_metrics");
    expect(observabilityServer).toContain("summarize_service_metrics");
    expect(observabilityServer).toContain("query_traces");
    expect(observabilityServer).toContain("list_trace_services");
    expect(observabilityServer).toContain("list_trace_operations");
    expect(observabilityServer).toContain("find_traces");
  });

  it("shows codex-max preset actions in dry-run", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    const io = captureIo();
    await runInit({ root, preset: "codex-max", dryRun: true }, io.io);

    expect(io.lines.some((line) => line.includes(".codex/config.toml"))).toBe(true);
  });

  it("is idempotent for codex-max on rerun without force", async () => {
    const root = createTempWorkspace();
    initGitMarker(root);

    await runInit({ root, preset: "codex-max" });
    const before = snapshotFileTree(root);

    await runInit({ root, preset: "codex-max" });
    const after = snapshotFileTree(root);

    expect(after).toEqual(before);
  });
});
