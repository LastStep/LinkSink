<!-- session-start.md: the workflow pack's always-on protocol, imported by the Bonsai block in CLAUDE.md; its docs: the pack's README.md. -->

# Session start

You are starting cold. Everything you need is in files. Spend the first minutes here and you will not need to ask the director
anything they have already answered.

## 1. Work out what you are

| Fact | Where it comes from |
|---|---|
| **Project** | The repository you are in. `bonsai status --json` names its packs, its document folders and its roles |
| **Role** | A session the director talks to is the **orchestrator**: when work starts, open the skill `workflow:orchestrate`; a quick question is answered as it is, and "do this one yourself" from the director is done in this session. A session started as a role (`claude --agent workflow:<role>`, or with `BONSAI_ROLE`) is that role. An agent started by a call reads its brief first: `bonsai message --show <id>`, the id in its prompt |
| **Task** | `BONSAI_TASK`, or `bonsai status --active --json`, or what the director just typed or your brief names |

If your work needs a task and you cannot name it, stop and say so. Do not guess a task.

## 2. Read, in this order

1. `.bonsai/STATE.md`: where the project stands right now. One page.
2. Your task file, in the folder `bonsai status --json` names for `task`. Its frontmatter is the contract: `lane`,
   `done_when`, `depends_on`, and its labels (`bonsai.allows`, `bonsai.ladder`, `bonsai.branch`).
3. Its plan (kind `plan`), if the task reads `approved` or later.
4. The one-pager it belongs to (kind `feature`): that is what "correct" means.
5. Only the design section the one-pager cites. Search for it; never read a whole design page.

Stop reading there. Do not read the roadmap, old run reports or unrelated specs "for context". If a file you did not
read turns out to matter, that is a gap in STATE: fix it at the end.

## 3. Check the lane before you touch anything

- **light**: build it, climb the ladder, land it. No approval first.
- **full**: an approved plan before code. With none, the work is the plan, which only the orchestrator writes.
- **director**: stop. Write the options (`workflow:options`) and nothing else. Code in this lane is the most expensive
  mistake there is.

If the task as written pushes you into the director lane and is not marked so, say so and write the options instead.
`workflow:lanes` says what lands in each lane.

## 4. Confirm the ground

```bash
git status --short          # clean? if not, whose changes are these?
git branch --show-current   # the task's bonsai.branch?
```

Uncommitted work you did not make is not yours to commit. Report it and leave it alone.

## 5. Open the run report before you write code

From the template `base:run`, in the folder `bonsai status --json` names for `run`, now, and append to it as you go.
It is a log, not a summary written at the end: if your session dies halfway, it is what survives.

## 6. Then work

`workflow:lanes` (what you may decide), `workflow:verification-ladder` (how you prove it), `workflow:reporting` (how
you tell the director, and report to your caller) and `workflow:reward-hacking-guards` (what counts as cheating).

## 7. Before you stop, set the task's status

`todo`, `plan`, `approved`, `running`, `verify`, `done`, or `blocked`. If a caller briefed you, your report's status
says it and your caller moves the task. Otherwise move it yourself: where `bonsai status --json` reads
`status_writes: command`, through its `status_command` (the guard refuses an edit of the status line there); else by
editing the status line, with the moves an agent may make (`base:task`).

A task's `bonsai.allows` grants its paths only while the task reads `running`, so a finished task left running keeps a
hole open in every later session.

Stop every process you started: servers, watchers, test harnesses, background runs. Then check none remain
(`ps -eo pid,etime,cmd`; on Windows `tasklist`). Anything you started that survives goes in the run report's
"Processes left running" with its ids; otherwise write "none", with how you checked. Never kill what you did not
start: another agent's run looks the same.

Then update STATE if what you did changed where the project stands, and make sure the run report says what is left.
If a caller briefed you, report to it through `bonsai message` (`workflow:reporting`).

## Never

- Ask the director something a file answers.
- Start over because reading felt slow.
- Carry knowledge only in your context. What the next agent needs goes in a file before you stop.
- Leave a process running after you stop.
