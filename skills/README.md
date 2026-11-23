# Skills

Agent skills for curating the gallery. Each folder is a self-contained skill in the
open [Agent Skills](https://agentskills.io) format: a `SKILL.md` with `name` and
`description` front matter, plus the scripts and references it uses. The scripts are
plain Node (18+) with no dependencies, so any agent that can run a shell command can
use them.

| Skill | For |
|---|---|
| [`smk-explore-sculptures`](smk-explore-sculptures/SKILL.md) | Searching SMK Open's 3D-scanned sculptures and checking whether a piece can be used |
| [`smk-design-exhibit`](smk-design-exhibit/SKILL.md) | Curating rooms, writing `config/sculptures.json`, checking the fit, building and reviewing |

## Using them with an agent

`skills/` is the one copy. The folders agents look in are symlinks to it:

| Harness | Picks them up from |
|---|---|
| Claude Code | `.claude/skills` (symlink) |
| Codex CLI and others following the `.agents` convention | `.agents/skills` (symlink) |
| Anything else | Point it at `skills/<name>/SKILL.md`, or link `skills/` into its own skills folder |

On Windows without symlink support, copy `skills/` into the harness's folder instead.

## Using them without an agent

The scripts work on their own:

```bash
node skills/smk-explore-sculptures/scripts/smk.mjs help
node skills/smk-explore-sculptures/scripts/smk.mjs search --usable --free-standing --unused
node skills/smk-design-exhibit/scripts/check-exhibit.mjs
```
