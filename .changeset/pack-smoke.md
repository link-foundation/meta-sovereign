---
'meta-sovereign': patch
---

The package is tested as npm would ship it, without publishing: `npm run test:pack` packs it, runs it with `npx` and checks the server it starts; CI runs it with `npm publish --dry-run` before every release (R-Y61).
