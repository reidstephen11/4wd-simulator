# Domain docs

How the engineering skills should read this repo's own documentation when exploring the code.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root: the game's terms. It is written as terms are settled (`/grill-with-docs` and `/domain-modeling` add to it), so it may not exist yet or may be short. If it is missing, carry on without comment.
- **`docs/DECISIONS.md`**: this repo's record of decisions, one section a version. Search it for the area you are about to work in and read those sections. It does the job the skills give to ADRs.
- **`docs/adr/`**: only for a decision that passes all three of `/domain-modeling`'s tests (hard to reverse, surprising without context, a real trade-off). Everything else goes in the version's section of `docs/DECISIONS.md`. The folder is created when the first such decision is recorded.

This is a single-context repo: one `GLOSSARY.md`, no `GLOSSARY-MAP.md`.

## Use the glossary's vocabulary

When your output names a concept from the game (in an issue title, a proposal, a hypothesis, a test name), use the term as `GLOSSARY.md` defines it. Don't drift to synonyms the glossary says to avoid.

If the concept you need isn't in the glossary yet, either you are inventing a word the project doesn't use (reconsider) or there is a real gap (note it for `/domain-modeling`).

## Say when you contradict a recorded decision

If your output goes against a section of `docs/DECISIONS.md` or an ADR, say so plainly, with the version or ADR number and why it is worth reopening. Do not override it silently.
