# EZTakeoff continuation contract for new ChatGPT conversations

**User**: S&S Design Build is upgrading EZTakeoff from an internal structural/material takeoff into a client-facing, four-step design + Three.js preview + external estimator exchange app while retaining admin takeoffs.
**Production**: GitHub `SSDesignBuild/EZTakeoff`; Netlify `https://eztakeoff.netlify.app`; Netlify ID `afb809fb-cc3e-4b69-ae1a-1e8d5fd8c764`.
**Always check main HEAD and current Netlify deploy first**. Read `docs/CONSULTATION_ARCHITECTURE.md` and `docs/ESTIMATOR_BRIDGE_V1.md`; inspect relevant code before edits.
**Modes**: `/` mode chooser; `/service/:slug` preserves detailed admin takeoffs; `/consultation` and `/consultation/:projectId` for sales.
**Current consultation sources**: `src/components/ConsultationStudio.tsx`, `Consultation3D.tsx`, `src/lib/consultationProject.ts`, `consultationPhoto.ts`, `estimatingBridge.ts`.
**Deck engine sources**: `src/lib/deckModel.ts`, `src/lib/estimate.ts`, `src/components/DeckDesigner.tsx`, `DeckWorkspaceFlow.tsx`; existing material planners, skirting and rail module code must stay intact.
**User preferences**: exceptional speed, accuracy, attractive client-friendly UI, rapid on-site revisions, true professional 3D + a realistic on-house mockup eventually, visual options from preloaded real S&S catalog, composable deck/cover/screen/sunroom/concrete/paver assemblies. UI should be guided with no needless technical jargon; admin takeoff remains fully featured. External estimating app exclusively calculates prices and returns sales-tier choices + final scope.
**Important caveats**: v1 sales mode stores projects locally and photos in IndexedDB, 3D uses parametric Three.js but photo overlay is manual/unverified and canopy is approximate; no live AI mockup, product-accurate textures, cross-device sync, role-based auth, external estimator API, patio cover BOM composition or screen/sunroom 3D yet. Never imply otherwise.
**Release procedure**: branch off latest main; edit source via GitHub connector; add regression test; verify npm ci, npm test, npm run build in GitHub Actions + Netlify preview; merge PR, verify main status and Netlify Ready/Published commit exact match. Do not modify original environment without preserving user changes. Do not claim visual interaction QA if not run.
**Active roadmap**: RBAC and cloud project media; product catalog admin/SKUs/material textures; photo calibration and geometry-constrained AI visualization; composite services and reliable cover/screen/sunroom takeoffs; secure external estimating app integration; saved design options and client proposal.
**Continuation Skill**: `eztakeoff-continuation` package attached to chat; user can install it in ChatGPT Skills for discovery in future conversations. Repository docs are persistent fallback.


## Manufacturer visual catalog release (2026-11-18)
- Manufacturer image registry: src/data/timbertechVisualAssets.json (36 official TimberTech product images, collection, grain); first-party Netlify build cache via scripts/sync-manufacturer-assets.mjs.
- Approved visual definition: src/data/visualCatalog.ts (13 metal/PVC/composite/vinyl/PT rail styles, 6 Renaissance cover styles and four official roof colors).
- Sales selectors: src/components/ConsultationVisualPickers.tsx; modular 3D rendering: src/components/visual3d/{Primitives,ManufacturerDeck3D,ManufacturerRailing3D,RenaissanceCover3D}.tsx. Concave deck floor row clipping: src/lib/visualGeometry.ts.
- Netlify runs asset download, npm test, npm run build and deploy; GitHub Actions workflow manual-only per user instruction to avoid paid CI builds.
- Visualized patio/railing assemblies are manufacturer family approximations, not verified extrusion/engineering. For precise model engineering use manufacturer drawings and approvals. Commercial license/reuse rights for manufacturer images should be verified.
- Preserve original Admin Takeoff and independent external estimator. New regression gate: scripts/test-visual-catalog.cjs.
