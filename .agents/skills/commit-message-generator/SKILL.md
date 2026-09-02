---
name: commit-message-generator
description: Generates a git commit message based only on the staged files.
---

# AI Commit Message Generator

Use this skill whenever the user types `/commit-message-generator` or asks to generate a commit message for staged files.

## Workflow

1. Run the command `git diff --staged` to view the currently staged files and changes.
2. If the output is empty, inform the user that there are no staged changes and suggest they run `git add` first.
3. If there are staged changes, analyze them and generate a concise, descriptive Git commit message in English.
4. **Important**: Output ONLY the raw commit message text. Do NOT wrap it in markdown code blocks, do NOT add conversational text before or after, and do NOT include unstaged changes.
