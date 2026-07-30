import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { createInterface } from "node:readline/promises";

import { APP_REGISTRY, validAppList } from "../core/apps";
import { CORE_SKILL_NAMES, CoreSkillName } from "../core/appAdapters";
import { CommonOptions, resolveConfig } from "../core/config";
import {
  ActionContext,
  applyTemplateEntries,
  ensureDirectory,
  removeFileIfMatches,
  TemplateCopyEntry,
  writeIfMissingOrForce,
  writeManagedFile,
} from "../core/fsPlan";
import { scopeIncludesProject, scopeIncludesUser } from "../core/installScope";
import { presetTemplateDirectory } from "../core/presets";
import { resolveRoot } from "../core/root";
import { listTemplateFiles, readTemplate } from "../core/templates";

export interface InitIo {
  log: (line: string) => void;
  prompt?: (question: string) => Promise<string>;
  select?: (question: string, choices: Choice[], defaultValue: string) => Promise<string>;
  multiselect?: (question: string, choices: Choice[], defaultValues: string[]) => Promise<string[]>;
}

interface Choice {
  label: string;
  value: string;
  hint?: string;
  aliases?: string[];
}

const defaultIo: InitIo = {
  log: (line: string) => {
    console.log(line);
  },
};

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  inverse: "\x1b[7m",
};

function canUseColor(): boolean {
  return Boolean(
    process.stdout.isTTY
    && process.env.NO_COLOR === undefined
    && process.env.TERM !== "dumb",
  );
}

function color(code: string, text: string): string {
  return canUseColor() ? `${code}${text}${ansi.reset}` : text;
}

function bold(text: string): string {
  return color(ansi.bold, text);
}

function dim(text: string): string {
  return color(ansi.dim, text);
}

function cyan(text: string): string {
  return color(ansi.cyan, text);
}

function green(text: string): string {
  return color(ansi.green, text);
}

function selected(text: string): string {
  return color(ansi.inverse, text);
}

function getPackageVersion(): string {
  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version as string;
}

function canUseTerminalMenu(): boolean {
  return Boolean(
    process.stdin.isTTY
    && process.stdout.isTTY
    && typeof process.stdin.setRawMode === "function",
  );
}

function eraseRenderedMenu(lineCount: number): void {
  if (lineCount === 0) {
    return;
  }

  process.stdout.write(`\x1b[${lineCount}F\x1b[0J`);
}

interface WizardStep {
  label: string;
  title: string;
  description: string;
  help: string;
}

function wizardStep(question: string, multi = false): WizardStep {
  if (question === "Install Veloran where?") {
    return {
      label: "Step 1",
      title: "Install location",
      description: "Choose whether Veloran writes project-local files, user-global files, or both.",
      help: "Use Up/Down or j/k, then Enter.",
    };
  }

  if (question === "Which vendor/apps should Veloran support?") {
    return {
      label: "Step 2",
      title: "App targets",
      description: "Pick the coding agents and harnesses that should discover Veloran skills.",
      help: multi ? "Use Up/Down or j/k, Space to toggle, then Enter." : "Use Up/Down or j/k, then Enter.",
    };
  }

  if (question === "Overwrite existing managed files when needed?") {
    return {
      label: "Step 3",
      title: "Overwrite policy",
      description: "Keep custom work safe unless you explicitly want generated files refreshed.",
      help: "Use Up/Down or j/k, then Enter.",
    };
  }

  if (question === "User-scope install can affect all repositories for this user. Continue?") {
    return {
      label: "Confirm",
      title: "User-global install",
      description: "This writes skills and prompts under your selected user install home.",
      help: "Press Enter to continue, or choose No to cancel.",
    };
  }

  return {
    label: multi ? "Select" : "Choose",
    title: question,
    description: "",
    help: multi ? "Use Up/Down or j/k, Space to toggle, then Enter." : "Use Up/Down or j/k, then Enter.",
  };
}

function wizardHeaderLines(step: WizardStep): string[] {
  const lines = [
    `${cyan(bold(step.label))} ${bold(step.title)}`,
  ];

  if (step.description) {
    lines.push(dim(step.description));
  }

  lines.push(dim(step.help));
  lines.push("");
  return lines;
}

function renderChoiceLine(choice: Choice, isSelected: boolean, checked?: boolean): string {
  const marker = isSelected ? ">" : " ";
  const checkbox = checked === undefined ? "" : `${checked ? "[x]" : "[ ]"} `;
  const label = `${marker} ${checkbox}${choice.label}`;
  const hint = choice.hint ? `  ${choice.hint}` : "";
  return isSelected ? selected(`${label}${hint}`) : `${label}${hint ? dim(hint) : ""}`;
}

function printInteractiveIntro(): void {
  if (!canUseTerminalMenu()) {
    return;
  }

  const lines = [
    cyan(bold("Veloran setup")),
    dim("Multi-app coding-agent harness installer"),
    dim("Use Enter to accept defaults. Press Ctrl+C to cancel."),
    "",
  ];

  process.stdout.write(`${lines.join("\n")}\n`);
}

function terminalTextQuestion(label: string, defaultValue: string): string {
  if (!canUseTerminalMenu()) {
    return `${label} [${defaultValue}]: `;
  }

  return [
    `${cyan(bold("Path"))} ${bold(label)}`,
    dim("Press Enter to use the default."),
    dim(defaultValue),
    "> ",
  ].join("\n");
}

async function terminalSelect(question: string, choices: Choice[], defaultValue: string): Promise<string> {
  if (!canUseTerminalMenu()) {
    return defaultValue;
  }

  const step = wizardStep(question);
  let selectedIndex = Math.max(
    0,
    choices.findIndex((choice) => choice.value === defaultValue),
  );
  let renderedLines = 0;

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
    };

    const render = (): void => {
      eraseRenderedMenu(renderedLines);
      const lines = [
        ...wizardHeaderLines(step),
        ...choices.map((choice, index) => renderChoiceLine(choice, index === selectedIndex)),
      ];
      renderedLines = lines.length;
      output.write(`${lines.join("\n")}\n`);
    };

    const onKeypress = (_value: string, key: readline.Key): void => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Interactive install cancelled."));
        return;
      }

      if (key.name === "up" || key.name === "k") {
        selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
        render();
        return;
      }

      if (key.name === "down" || key.name === "j") {
        selectedIndex = (selectedIndex + 1) % choices.length;
        render();
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        const selected = choices[selectedIndex];
        cleanup();
        eraseRenderedMenu(renderedLines);
        output.write(`${green("[ok]")} ${step.title}: ${selected.label}\n`);
        resolve(selected.value);
      }
    };

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKeypress);
    render();
  });
}

async function terminalMultiSelect(
  question: string,
  choices: Choice[],
  defaultValues: string[],
): Promise<string[]> {
  if (!canUseTerminalMenu()) {
    return defaultValues;
  }

  const step = wizardStep(question, true);
  let selectedIndex = 0;
  let selectedValues = new Set(defaultValues);
  let renderedLines = 0;

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;

    const cleanup = (): void => {
      input.off("keypress", onKeypress);
      input.setRawMode(false);
      input.pause();
    };

    const toggleCurrent = (): void => {
      const current = choices[selectedIndex];
      if (current.value === "all") {
        selectedValues = selectedValues.has("all") ? new Set() : new Set(["all"]);
        return;
      }

      selectedValues.delete("all");
      if (selectedValues.has(current.value)) {
        selectedValues.delete(current.value);
      } else {
        selectedValues.add(current.value);
      }
    };

    const render = (): void => {
      eraseRenderedMenu(renderedLines);
      const lines = [
        ...wizardHeaderLines(step),
        ...choices.map((choice, index) =>
          renderChoiceLine(choice, index === selectedIndex, selectedValues.has(choice.value)),
        ),
      ];
      renderedLines = lines.length;
      output.write(`${lines.join("\n")}\n`);
    };

    const onKeypress = (_value: string, key: readline.Key): void => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Interactive install cancelled."));
        return;
      }

      if (key.name === "up" || key.name === "k") {
        selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
        render();
        return;
      }

      if (key.name === "down" || key.name === "j") {
        selectedIndex = (selectedIndex + 1) % choices.length;
        render();
        return;
      }

      if (key.name === "space") {
        toggleCurrent();
        render();
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        cleanup();
        eraseRenderedMenu(renderedLines);
        const values = selectedValues.size === 0 ? ["all"] : Array.from(selectedValues);
        const labels = choices
          .filter((choice) => values.includes(choice.value))
          .map((choice) => choice.label)
          .join(", ");
        output.write(`${green("[ok]")} ${step.title}: ${labels}\n`);
        resolve(values);
      }
    };

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on("keypress", onKeypress);
    render();
  });
}

async function promptLine(io: InitIo, question: string): Promise<string> {
  if (io.prompt) {
    return io.prompt(question);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function canPrompt(io: InitIo): boolean {
  return Boolean(io.prompt) || Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function chooseOne(
  io: InitIo,
  question: string,
  choices: Choice[],
  defaultValue: string,
  fallbackQuestion: string,
): Promise<string> {
  if (io.select) {
    return io.select(question, choices, defaultValue);
  }

  if (!io.prompt && canUseTerminalMenu()) {
    return terminalSelect(question, choices, defaultValue);
  }

  const answer = (await promptLine(io, fallbackQuestion)).trim();
  if (answer.length === 0) {
    return defaultValue;
  }

  const normalized = answer.toLowerCase();
  const match = choices.find((choice) =>
    choice.value.toLowerCase() === normalized
    || choice.label.toLowerCase() === normalized
    || (choice.aliases ?? []).some((alias) => alias.toLowerCase() === normalized),
  );

  return match?.value ?? answer;
}

async function chooseMany(
  io: InitIo,
  question: string,
  choices: Choice[],
  defaultValues: string[],
  fallbackQuestion: string,
): Promise<string[]> {
  if (io.multiselect) {
    return io.multiselect(question, choices, defaultValues);
  }

  if (!io.prompt && canUseTerminalMenu()) {
    return terminalMultiSelect(question, choices, defaultValues);
  }

  const answer = (await promptLine(io, fallbackQuestion)).trim();
  if (answer.length === 0) {
    return defaultValues;
  }

  return answer.split(",").map((value) => value.trim()).filter(Boolean);
}

async function resolveInteractiveOptions(options: CommonOptions, io: InitIo): Promise<CommonOptions> {
  const hasAppSelection = Boolean(options.apps || options.assistants);
  const hasScopeSelection = Boolean(options.scope);
  const hasInstallPath = Boolean(options.root || options.installPath || options.path);
  const hasUserHome = Boolean(options.userHome || process.env.VELORAN_HOME);
  const shouldPrompt =
    canPrompt(io)
    && !options.yes
    && (Boolean(options.magic) || !hasAppSelection || !hasScopeSelection);

  if (!shouldPrompt) {
    return options;
  }

  const next: CommonOptions = { ...options };

  if (!io.prompt && !io.select && !io.multiselect) {
    printInteractiveIntro();
  }

  if (!hasScopeSelection) {
    next.scope = await chooseOne(
      io,
      "Install Veloran where?",
      [
        { label: "Global user", value: "user", hint: "recommended; write user-global skills, prompts, and knowledge", aliases: ["global"] },
        { label: "Local project", value: "project", hint: "write repository-local harness files", aliases: ["local"] },
        { label: "Both", value: "both", hint: "install project and user-global files" },
      ],
      "user",
      "Install Veloran where? global user, local project, or both [global]: ",
    );
  }

  const chosenScope = (next.scope ?? "project").trim().toLowerCase();
  const includesProject = chosenScope === "project" || chosenScope === "both" || chosenScope === "local";
  const includesUser = chosenScope === "user" || chosenScope === "both" || chosenScope === "global";

  if (includesProject && !hasInstallPath) {
    const defaultRoot = resolveRoot(undefined, process.cwd());
    const answer = (await promptLine(
      io,
      terminalTextQuestion("Local project path", defaultRoot),
    )).trim();
    if (answer.length > 0) {
      next.root = answer;
    }
  }

  if (includesUser && !hasUserHome) {
    const defaultHome = process.env.VELORAN_HOME ?? process.env.HOME ?? "~";
    const answer = (await promptLine(
      io,
      terminalTextQuestion("User install home", defaultHome),
    )).trim();
    if (answer.length > 0) {
      next.userHome = answer;
    }
  }

  if (!hasAppSelection) {
    const apps = await chooseMany(
      io,
      "Which vendor/apps should Veloran support?",
      [
        { label: "All supported apps", value: "all", hint: "recommended" },
        { label: "Generic AGENTS", value: "agents", aliases: ["common"] },
        { label: "Codex", value: "codex" },
        { label: "Claude Code", value: "claude" },
        { label: "OpenCode", value: "opencode" },
        { label: "Google Antigravity", value: "antigravity" },
        { label: "Augment", value: "augment" },
      ],
      ["all"],
      `Which vendor/apps should Veloran support? ${validAppList()} [all]: `,
    );
    next.apps = apps.includes("all") ? "all" : apps.join(",");
  }

  if (next.force === undefined) {
    const answer = await chooseOne(
      io,
      "Overwrite existing managed files when needed?",
      [
        { label: "No", value: "no", hint: "preserve existing files unless managed block update is safe", aliases: ["n"] },
        { label: "Yes", value: "yes", hint: "overwrite generated templates when needed", aliases: ["y"] },
      ],
      "no",
      "Overwrite existing managed files when needed? y/N: ",
    );
    next.force = answer === "yes";
  }

  const scope = (next.scope ?? "project").trim().toLowerCase();
  if ((scope === "user" || scope === "both" || scope === "global") && !next.dryRun) {
    const answer = await chooseOne(
      io,
      "User-scope install can affect all repositories for this user. Continue?",
      [
        { label: "Yes", value: "yes", hint: "continue with user-global install", aliases: ["y"] },
        { label: "No", value: "no", hint: "cancel before writing user-global files", aliases: ["n"] },
      ],
      "yes",
      "User-scope install can affect all repositories for this user. Continue? Y/n: ",
    );
    if (answer !== "yes") {
      throw new Error("User-scope install cancelled.");
    }
    next.yes = true;
  }

  return next;
}

function printAppList(io: InitIo): void {
  io.log("Vendor/app targets:");
  for (const app of Object.values(APP_REGISTRY)) {
    io.log(`  ${app.id}: ${app.label}`);
  }
  io.log("  common: alias for agents");
  io.log("  all: all supported targets");
}

function printScopeList(io: InitIo): void {
  io.log("Install scopes:");
  io.log("  project: write repository-local harness files");
  io.log("  user: write user-global skills only");
  io.log("  both: write project files and user-global skills");
}

function printHarnessNextSteps(io: InitIo): void {
  io.log("");
  io.log(green(bold("Veloran is ready.")));
  io.log("");
  io.log("Core skills installed:");
  for (const skillName of CORE_SKILL_NAMES) {
    io.log(`  ${skillName}`);
  }
  io.log("");
  io.log("Next step:");
  io.log("  Open your coding agent and mention @init-harness.");
  io.log("  Then use @execplan-create and @execplan-execute for planned work.");
  io.log("");
  io.log("The init-harness workflow will reuse real project start paths when they are discoverable.");
  io.log("If secrets, database URLs, or service endpoints are missing, it will prepare the config files and ask only for those values.");
  io.log("Run `veloran --help` for advanced commands.");
}

function printUserNextSteps(io: InitIo, userHomePath: string): void {
  io.log("");
  io.log(green(bold("Veloran user skills are ready.")));
  io.log(`Install home: ${userHomePath}`);
  io.log("");
  io.log("Next step:");
  io.log("  Open your coding agent and mention @init-harness.");
  io.log("  Then use @execplan-create and @execplan-execute for planned work.");
  io.log("");
  io.log("Run `veloran --help` for advanced commands.");
}

function shouldIncludePresetDestination(destinationRelativePath: string, config: ReturnType<typeof resolveConfig>): boolean {
  if (destinationRelativePath.startsWith(".codex/")) {
    return config.apps.needsCodexFiles;
  }

  if (destinationRelativePath.startsWith(".claude/") || destinationRelativePath === ".mcp.json") {
    return config.apps.needsClaudeNativeFiles;
  }

  if (destinationRelativePath.startsWith(".opencode/") || destinationRelativePath === "opencode.json") {
    return config.apps.needsOpenCodeFiles;
  }

  if (destinationRelativePath.startsWith(".agents/skills/")) {
    return config.apps.needsSharedSkills;
  }

  return true;
}

function buildPresetTemplateEntries(config: ReturnType<typeof resolveConfig>): TemplateCopyEntry[] {
  const presetDirectory = presetTemplateDirectory(config.preset);
  const presetPrefix = `presets/${presetDirectory}/`;
  const templateFiles = listTemplateFiles(`presets/${presetDirectory}`);

  return templateFiles.map((templateRelativePath) => {
    if (!templateRelativePath.startsWith(presetPrefix)) {
      throw new Error(
        `Preset template path "${templateRelativePath}" is outside "${presetPrefix}".`,
      );
    }

    const templateDestinationPath = templateRelativePath.slice(presetPrefix.length);
    const destinationRelativePath = templateDestinationPath.endsWith(".npmignore")
      ? `${templateDestinationPath.slice(0, -".npmignore".length)}.gitignore`
      : templateDestinationPath;
    return {
      templateRelativePath,
      destinationAbsolutePath: path.resolve(config.root, destinationRelativePath),
      executable: destinationRelativePath.endsWith(".sh"),
    };
  }).filter((entry) =>
    shouldIncludePresetDestination(path.relative(config.root, entry.destinationAbsolutePath), config),
  );
}

function skillTemplateName(skillName: CoreSkillName): "skills/init-harness.SKILL.md" | "skills/execplan-create.SKILL.md" | "skills/execplan-execute.SKILL.md" {
  return `skills/${skillName}.SKILL.md` as
    | "skills/init-harness.SKILL.md"
    | "skills/execplan-create.SKILL.md"
    | "skills/execplan-execute.SKILL.md";
}

function writeCoreSkillsToDirectory(
  skillDirectoryPath: string,
  actionContext: ActionContext,
  force: boolean,
): void {
  ensureDirectory(skillDirectoryPath, actionContext);
  for (const skillName of CORE_SKILL_NAMES) {
    const skillPath = path.join(skillDirectoryPath, skillName, "SKILL.md");
    ensureDirectory(path.dirname(skillPath), actionContext);
    writeIfMissingOrForce(skillPath, readTemplate(skillTemplateName(skillName)), actionContext, force);
  }
}

function buildKnowledgeTemplateEntries(
  config: ReturnType<typeof resolveConfig>,
  scope: "project" | "user",
): TemplateCopyEntry[] {
  const templateRoot = `knowledge/${scope}`;
  const templatePrefix = `${templateRoot}/`;
  const destinationRoot =
    scope === "project" ? config.projectKnowledgeDirPath : config.userKnowledgeDirPath;

  return listTemplateFiles(templateRoot).map((templateRelativePath) => {
    if (!templateRelativePath.startsWith(templatePrefix)) {
      throw new Error(
        `Knowledge template path "${templateRelativePath}" is outside "${templatePrefix}".`,
      );
    }

    return {
      templateRelativePath,
      destinationAbsolutePath: path.join(
        destinationRoot,
        templateRelativePath.slice(templatePrefix.length),
      ),
    };
  });
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths));
}

function projectSkillDirectories(config: ReturnType<typeof resolveConfig>): string[] {
  const directories: string[] = [];

  if (config.apps.needsSharedSkills) {
    directories.push(config.skillsDirPath);
  }

  if (config.apps.needsClaudeSkills) {
    directories.push(config.claudeSkillsDirPath);
  }

  if (config.apps.needsAntigravitySkills) {
    directories.push(config.antigravitySkillsDirPath);
  }

  return uniquePaths(directories);
}

function userSkillDirectories(config: ReturnType<typeof resolveConfig>): string[] {
  const directories: string[] = [];
  const usesSharedSkillDirectory = config.apps.values.some(
    (app) => app === "agents" || app === "opencode",
  );

  if (usesSharedSkillDirectory) {
    directories.push(config.userSkillsDirPath);
  }

  if (config.apps.values.includes("codex") && !usesSharedSkillDirectory) {
    directories.push(config.codexUserSkillsDirPath);
  }

  if (config.apps.values.includes("claude")) {
    directories.push(config.claudeUserSkillsDirPath);
  }

  if (config.apps.values.includes("antigravity")) {
    directories.push(config.antigravityUserSkillsDirPath);
  }

  return uniquePaths(directories);
}

function removeDuplicateCodexSkills(
  config: ReturnType<typeof resolveConfig>,
  actionContext: ActionContext,
): void {
  const usesSharedSkillDirectory = config.apps.values.some(
    (app) => app === "agents" || app === "opencode",
  );
  const shouldUseSharedCopy =
    config.apps.values.includes("codex")
    && usesSharedSkillDirectory
    && config.codexUserSkillsDirPath !== config.userSkillsDirPath;

  if (!shouldUseSharedCopy) {
    return;
  }

  for (const skillName of CORE_SKILL_NAMES) {
    removeFileIfMatches(
      path.join(config.codexUserSkillsDirPath, skillName, "SKILL.md"),
      readTemplate(skillTemplateName(skillName)),
      actionContext,
    );
  }
}

function buildManifest(config: ReturnType<typeof resolveConfig>, scope: "project" | "user"): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      package: "veloran",
      version: getPackageVersion(),
      preset: config.preset,
      templatePreset: presetTemplateDirectory(config.preset),
      apps: config.apps.values,
      installScope: scope,
      generatedFileFamilies: [
        "instructions",
        "skills",
        "execplans",
        "context",
        "memory",
        "knowledge",
        "harness",
        "docs",
        "mcp-config",
      ],
      secretsPolicy:
        "Do not store secrets in .agent/memory, .agent/context, plans, docs, prompts, transcripts, or validation logs.",
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`;
}

function writeProjectInstall(config: ReturnType<typeof resolveConfig>, actionContext: ActionContext): void {
  ensureDirectory(config.planDirPath, actionContext);
  ensureDirectory(config.execplansDirPath, actionContext);

  writeIfMissingOrForce(config.plansFilePath, readTemplate("PLANS.md"), actionContext, config.force);
  writeIfMissingOrForce(
    path.join(config.execplansDirPath, "README.md"),
    readTemplate("execplans_README.md"),
    actionContext,
    config.force,
  );

  if (config.apps.needsAgentsFile) {
    writeManagedFile(
      config.agentsFilePath,
      readTemplate("AGENTS.managed.md"),
      actionContext,
      config.force,
    );
  }

  if (config.apps.needsClaudeFile) {
    writeManagedFile(
      config.claudeFilePath,
      readTemplate("CLAUDE.managed.md"),
      actionContext,
      config.force,
    );
  }

  if (config.apps.needsGeminiFile) {
    writeManagedFile(
      config.geminiFilePath,
      readTemplate("GEMINI.managed.md"),
      actionContext,
      config.force,
    );
  }

  const presetEntries = buildPresetTemplateEntries(config);
  applyTemplateEntries(presetEntries, actionContext, config.force);

  for (const skillDirectory of projectSkillDirectories(config)) {
    writeCoreSkillsToDirectory(skillDirectory, actionContext, config.force);
  }

  if (config.knowledgeEnabled && config.preset === "harness") {
    applyTemplateEntries(buildKnowledgeTemplateEntries(config, "project"), actionContext, config.force);
  }

  writeIfMissingOrForce(
    config.manifestPath,
    buildManifest(config, "project"),
    actionContext,
    config.force,
  );
}

function writeUserInstall(config: ReturnType<typeof resolveConfig>, actionContext: ActionContext, io: InitIo): void {
  if (config.dryRun || config.verbose) {
    io.log(`User install home: ${config.userHomePath}`);
  }

  for (const skillDirectory of userSkillDirectories(config)) {
    writeCoreSkillsToDirectory(skillDirectory, actionContext, config.force);
  }
  removeDuplicateCodexSkills(config, actionContext);

  if (config.apps.needsAgentsFile) {
    writeManagedFile(
      config.userAgentsFilePath,
      readTemplate("AGENTS.managed.md"),
      actionContext,
      false,
    );
  }

  if (config.apps.needsClaudeFile) {
    writeManagedFile(
      config.userClaudeFilePath,
      readTemplate("CLAUDE.managed.md"),
      actionContext,
      false,
    );
  }

  if (config.apps.needsGeminiFile) {
    writeManagedFile(
      config.userGeminiFilePath,
      readTemplate("GEMINI.managed.md"),
      actionContext,
      false,
    );
  }

  if (config.knowledgeEnabled && config.preset === "harness") {
    applyTemplateEntries(buildKnowledgeTemplateEntries(config, "user"), actionContext, config.force);
  }

  const manifest = buildManifest(config, "user");
  if (config.dryRun) {
    io.log("Planned user-scope manifest:");
    io.log(manifest.trimEnd());
  }

  writeIfMissingOrForce(config.userManifestPath, manifest, actionContext, config.force);
}

export async function runInit(options: CommonOptions, io: InitIo = defaultIo): Promise<number> {
  const interactiveOptions = await resolveInteractiveOptions(options, io);

  if (interactiveOptions.listApps) {
    printAppList(io);
    return 0;
  }

  if (interactiveOptions.listScopes) {
    printScopeList(io);
    return 0;
  }

  const config = resolveConfig(interactiveOptions);

  if (scopeIncludesUser(config.installScope) && !config.dryRun && !config.yes) {
    throw new Error(
      "User-scope install requires --yes or interactive confirmation. Run with --dry-run first to preview global writes.",
    );
  }

  const shouldLogActions = config.dryRun || config.verbose;

  const projectActionContext: ActionContext = {
    dryRun: config.dryRun,
    root: config.root,
    log: shouldLogActions ? io.log : () => {},
  };

  if (scopeIncludesProject(config.installScope)) {
    writeProjectInstall(config, projectActionContext);
  }

  if (scopeIncludesUser(config.installScope)) {
    const userActionContext: ActionContext = {
      dryRun: config.dryRun,
      root: config.userHomePath,
      log: shouldLogActions ? io.log : () => {},
    };
    writeUserInstall(config, userActionContext, io);
  }

  if (!config.dryRun) {
    if (scopeIncludesProject(config.installScope)) {
      printHarnessNextSteps(io);
    } else {
      printUserNextSteps(io, config.userHomePath);
    }
  }

  return 0;
}
