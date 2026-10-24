<!-- bonsai:block start: written by bonsai init and update from bonsai.yaml and each pack's bonsai/block.md (its docs); edit those, not this block. -->
This project is linked to Bonsai as workspace linksink; its packs: base 0.1.0, workflow 0.1.0.
Always-on protocols, read in full: @work/protocols/session-start.md
Project memory, an index of notes kept in work/memory: @work/memory/INDEX.md
Labels a document may carry under its labels: field (name: the value it takes; the documents it goes on; who sets it):
- bonsai.allows: a list of text; on task; agents set it; it grants a right. Protected paths this task may change, as globs. A path on the person-only list counts only if a person granted it.
- bonsai.wants: a list of text; on task; agents set it. Person-only paths this task asks for. A person's approval or grant copies them into bonsai.allows.
- bonsai.ladder: a list of number; on task; agents set it. The rungs this task climbs. It adds rungs to the workspace's floor and never drops one.
- bonsai.branch: text matching ^[A-Za-z0-9._/-]{1,100}$; on task; agents set it. The branch the task is built on; empty means the base branch.
- workflow.owner: one of orchestrator, builder, verifier, researcher, auditor, runner; on task; agents set it. The role that owns the task's work.
- workflow.model: one of opus, sonnet, haiku, fable; on task, run; agents set it. The Claude Code model the work runs on, or ran on (Claude Code only).
- workflow.feature: text matching ^F-[a-z0-9-]+$; on task, plan; agents set it. The one-pager (kind feature) this belongs to, by its id.
- workflow.milestone: text, at most 60 characters; on task, state, feature; agents set it. The milestone this counts toward, by the project's own name for it.
- workflow.spec: text matching ^SPEC-[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+$; on task; agents set it. The spec (kind spec) this task carries out, by its id.
- workflow.estimate_h: a number; on task; agents set it. The task's estimate in hours, written with the task.
Bonsai's documents have their templates in base's skills; open the one you need before writing or checking such a file: base:task, base:run (a run report), base:memory (a memory note and its index), base:message (a brief or a report, written with bonsai message), base:state (.bonsai/STATE.md), base:workspace (bonsai.yaml), base:ci (a CI workflow that runs bonsai check).
What Bonsai generates in this project, and how long it keeps each kind: base:generated-files.
Open base:operating-bonsai before you run any bonsai command, and whenever Bonsai or its guard refuses something.
Open base:operating-setup before you link or update a project, edit bonsai.yaml or change a pack's version.
Roles (workflow): the session the person talks to is the orchestrator and opens `workflow:orchestrate` when work starts; builder and verifier (leads) and researcher, auditor and runner (helpers) are called with their brief, or started as `claude --agent workflow:<role>`.
Lanes light, full and director, each with its pipeline: `workflow:lanes`. Document templates: `workflow:plan`, `workflow:feature`, `workflow:decision`, `workflow:options`, `workflow:spec`, `workflow:playtest`, `workflow:bugs`, and the daily brief's in `workflow:brief`.
<!-- bonsai:block end -->
