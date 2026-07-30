# Veloran Agent Install Guide

This guide is the source of truth for coding agents asked to install Veloran in an existing repository.

## Goal

Set up a project-local Veloran harness by default, validate it, and then continue into the generated `init-harness` workflow when possible.

## Workflow

1. Work from the current repository root. If the user pasted the install prompt in a nested folder, detect the real repo root before running commands.
2. Inspect the repository briefly before changing anything. Reuse existing structure and avoid inventing a second workflow.
3. Prefer `npx -y veloran@latest`; do not require a global npm install unless the environment does. If the user asked for the magic installer, run `npx -y veloran@latest` or `npx -y veloran@latest magic` and answer its local/global/path prompts.
4. For deterministic local project setup, run:

   ```bash
   npx -y veloran@latest init --scope project --yes
   ```

   If the user named specific apps, pass them with `--apps`, for example:

   ```bash
   npx -y veloran@latest init --apps codex,claude,opencode,antigravity --scope project --yes
   ```

5. Avoid user-global writes unless the user explicitly requested them. Preview first:

   ```bash
   npx -y veloran@latest init --scope user --apps codex,claude,antigravity --dry-run
   ```

   For a real global install to a chosen path, use `--user-home <path> --yes`. Veloran appends managed prompt blocks to user prompt files under that path; it must preserve the user's existing prompt text.

   When Codex and a shared-skill target (`agents` or `opencode`) are selected together, Veloran installs the core skills once under `.agents/skills/`. Codex discovers that shared directory, so this avoids duplicate skill entries. Codex-only installs continue to use `.codex/skills/`.

6. After init succeeds, run:

   ```bash
   npx -y veloran@latest doctor --apps all --preset harness
   ```

7. Inspect the active knowledge bundle when repository behavior is unclear:

   ```bash
   npx -y veloran@latest knowledge print --path . --apps all
   ```

   Use `--touched <file>` to narrow path-specific rules and standards.

8. If `init-harness` is available in a generated skill directory, continue by following it. If the current app cannot discover skills, print the prompt:

   ```bash
   npx -y veloran@latest prompt init-harness
   ```

9. When wiring the harness, reuse the repository's real local dev, cluster, bootstrap, or test path. Wrap it locally if needed; do not replace production or deployment behavior.
10. Ask the user only for missing information that cannot be inferred safely, such as required credentials, secrets, external service endpoints, or an undocumented start command.
11. Finish with a short summary:
    - whether Veloran initialized successfully
    - whether `doctor` passed
    - which apps were targeted
    - whether `init-harness` completed
    - which prepared secret/config files still need human values
    - exact blockers, if any

## Guardrails

- Project scope is the default because files are reviewable and versioned.
- Default new rules, standards, facts, and docs to project-local `.agent/knowledge/`. Promote to user-global `.veloran/knowledge/` only when the user approves it or repeated cross-repository evidence proves it is reusable.
- Do not make production or deployment changes just to enable local observability.
- Prefer local-only wrappers, local-only environment variables, and reuse of existing startup scripts.
- Do not store secrets in `.agent/knowledge`, `.agent/memory`, `.agent/context`, plans, docs, prompts, transcripts, or validation logs.
- Do not use destructive git commands unless the user explicitly asks.
- Preserve existing user content in managed files when the tool supports it.
