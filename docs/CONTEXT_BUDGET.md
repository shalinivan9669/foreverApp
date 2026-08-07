# Context Budget

Use the smallest context that can produce a correct plan.

## Limits before plan

- Inspect no more than 12 source files.
- Inspect no more than 5 docs.
- Do not scan the whole repository unless the task explicitly asks for broad audit/refactor.
- Do not read generated folders: `.next`, `node_modules`, coverage, build output.
- Prefer `docs/TASK_PACKS.md` over browsing docs manually.

## Expanding scope

If more files are needed, state why before expanding scope:

- what decision cannot be made with current context;
- which files/docs will answer it;
- whether the task mode or risk classification changes.

Use `rg`/targeted file reads over broad tree dumps.

