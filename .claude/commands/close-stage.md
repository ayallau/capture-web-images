---
description: Close the current build stage — commit, tag, and advance CLAUDE.md
---

Close out the stage that just finished. Steps:

1. Run `git status`. If the tree is dirty, show me what changed and
   wait for my confirmation before committing anything.

2. Read CLAUDE.md and find the line `**Current stage: N**`.

3. Commit with a message describing what stage N actually delivered —
   look at the diff, don't just repeat the stage title from the list.
   Format: `Stage N: <what was built>`

4. Tag it: `git tag -a stage-N-complete -m "<same summary>"`

5. In CLAUDE.md: mark stage N as `[x]` in the Build stages list, and
   change `**Current stage: N**` to `**Current stage: N+1**`.
   Change nothing else in that file.

6. Commit the CLAUDE.md change separately: `Advance to stage N+1`

7. Push: `git push origin master --tags`

8. Tell me what stage N+1 requires, from the Build stages list. Do not
   start implementing it.

Never skip step 1. Never edit any part of CLAUDE.md other than the two
lines in step 5.