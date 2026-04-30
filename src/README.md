# PolicyLens Source Split Scaffold

PolicyLens still deploys as a self-contained `index.html`. The deploy artifact is now generated from `src/index.babel.html` so production does not run Babel in the browser.

This folder is a staging area for moving toward internal modules without losing single-file deployment simplicity.

## Current Workflow

- Edit `src/index.babel.html`, then run `npm run build:precompile` to write the deployable root `index.html`.
- `npm run split:preview` lists the existing `// MODULE:` boundaries inside `src/index.babel.html`.
- `node tools/extract-index-modules.mjs --write` writes generated preview fragments to `src/generated/`.
- Generated fragments are for review and migration planning only. Do not edit them as source of truth yet.

## Migration Rule

When a module is eventually made canonical, keep the build step reassembling the single-file deploy output and keep regression tests passing with `npm run test:golden`.
