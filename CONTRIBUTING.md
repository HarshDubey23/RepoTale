# Contributing

Thanks for helping. A few things make reviews quick:

1. `npm ci`, then `node bin/reporeel.js setup` to check your machine.
2. `npm test` runs the unit tests and an end-to-end render of `examples/hello` (about a minute).
3. If you change how something looks, render this repository's own video (`node bin/reporeel.js video`) and attach `docs/reporeel/sheet.png` to the pull request.
4. New scene types need: the type in `src/storyboard.ts`, the schema in `schema/reporeel.schema.json`, a template in `src/templates.ts`, and a line in the README table.

The source runs directly with Node 22.18+ (type stripping), so there is no build step while developing. `npm run build` is only for publishing.
