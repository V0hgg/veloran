import fs from "node:fs";
import path from "node:path";

import { upsertManagedBlock } from "./managedBlock";
import { readTemplateRelative } from "./templates";

export type ActionType = "Create" | "Update" | "Remove" | "Skip";

export interface ActionResult {
  type: ActionType;
  path: string;
  reason?: string;
}

export interface ActionContext {
  dryRun: boolean;
  root: string;
  log: (line: string) => void;
}

export interface TemplateCopyEntry {
  templateRelativePath: string;
  destinationAbsolutePath: string;
  executable?: boolean;
  managed?: boolean;
}

function displayPath(root: string, absolutePath: string): string {
  const relative = path.relative(root, absolutePath);
  return relative === "" ? "." : relative;
}

export function printAction(context: ActionContext, action: ActionResult): void {
  const prefix = context.dryRun ? "Would " : "";
  const reason = action.reason ? ` (${action.reason})` : "";
  context.log(`${prefix}${action.type}: ${displayPath(context.root, action.path)}${reason}`);
}

export function ensureDirectory(directoryPath: string, context: ActionContext): ActionResult {
  const exists = fs.existsSync(directoryPath);

  if (exists) {
    const result: ActionResult = {
      type: "Skip",
      path: directoryPath,
      reason: "already exists",
    };
    printAction(context, result);
    return result;
  }

  if (!context.dryRun) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }

  const result: ActionResult = {
    type: "Create",
    path: directoryPath,
  };
  printAction(context, result);
  return result;
}

function writeFile(directoryPath: string, filePath: string, content: string, context: ActionContext): void {
  if (context.dryRun) {
    return;
  }

  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

export function writeIfMissingOrForce(
  filePath: string,
  content: string,
  context: ActionContext,
  force: boolean,
): ActionResult {
  const exists = fs.existsSync(filePath);

  if (!exists) {
    writeFile(path.dirname(filePath), filePath, content, context);
    const result: ActionResult = { type: "Create", path: filePath };
    printAction(context, result);
    return result;
  }

  const current = fs.readFileSync(filePath, "utf8");

  if (!force) {
    const result: ActionResult = {
      type: "Skip",
      path: filePath,
      reason: "already exists",
    };
    printAction(context, result);
    return result;
  }

  if (current === content) {
    const result: ActionResult = {
      type: "Skip",
      path: filePath,
      reason: "already up to date",
    };
    printAction(context, result);
    return result;
  }

  writeFile(path.dirname(filePath), filePath, content, context);
  const result: ActionResult = { type: "Update", path: filePath };
  printAction(context, result);
  return result;
}

export function writeManagedFile(
  filePath: string,
  managedBlock: string,
  context: ActionContext,
  force: boolean,
): ActionResult {
  const exists = fs.existsSync(filePath);

  if (!exists) {
    writeFile(path.dirname(filePath), filePath, managedBlock, context);
    const result: ActionResult = { type: "Create", path: filePath };
    printAction(context, result);
    return result;
  }

  const current = fs.readFileSync(filePath, "utf8");
  const next = force ? managedBlock : upsertManagedBlock(current, managedBlock);

  if (current === next) {
    const result: ActionResult = {
      type: "Skip",
      path: filePath,
      reason: "already up to date",
    };
    printAction(context, result);
    return result;
  }

  writeFile(path.dirname(filePath), filePath, next, context);
  const result: ActionResult = { type: "Update", path: filePath };
  printAction(context, result);
  return result;
}

export function removeFileIfMatches(
  filePath: string,
  content: string,
  context: ActionContext,
): ActionResult {
  if (!fs.existsSync(filePath)) {
    const result: ActionResult = {
      type: "Skip",
      path: filePath,
      reason: "not found",
    };
    printAction(context, result);
    return result;
  }

  if (fs.readFileSync(filePath, "utf8") !== content) {
    const result: ActionResult = {
      type: "Skip",
      path: filePath,
      reason: "content differs",
    };
    printAction(context, result);
    return result;
  }

  if (!context.dryRun) {
    fs.unlinkSync(filePath);
  }

  const result: ActionResult = {
    type: "Remove",
    path: filePath,
    reason: "duplicate Veloran skill",
  };
  printAction(context, result);
  return result;
}

export function applyTemplateEntries(
  entries: TemplateCopyEntry[],
  context: ActionContext,
  force: boolean,
): ActionResult[] {
  const results: ActionResult[] = [];

  for (const entry of entries) {
    const content = readTemplateRelative(entry.templateRelativePath);
    const action = entry.managed
      ? writeManagedFile(entry.destinationAbsolutePath, content, context, force)
      : writeIfMissingOrForce(entry.destinationAbsolutePath, content, context, force);

    if (entry.executable && !context.dryRun && action.type !== "Skip") {
      fs.chmodSync(entry.destinationAbsolutePath, 0o755);
    }

    results.push(action);
  }

  return results;
}
