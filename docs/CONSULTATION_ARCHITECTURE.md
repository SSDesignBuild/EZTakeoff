# EZTakeoff Consultation Architecture (v1 foundation)

## Two workflows, one geometry engine
- Entry `/`: choose **Admin Takeoff** (`/service/decks` and other existing services) or **Sales Consultation** (`/consultation`). These are UI modes, **not** authorization roles. Add real team auth/RBAC separately.
- Sales consultation four stages: photo/property → draw footprint → approved S&S product choices → actual Three.js/R3F interactive 3D + approximate house-photo overlay + estimator handoff.
- Sales data in `src/lib/consultationProject.ts` (v1 schema, revision, stale quote invalidation). Project records stored in localStorage; home images compressed and stored privately in IndexedDB via `consultationPhoto.ts`. **No cloud access or cross-device synchronization yet.**
- Designer reuses `DeckDesigner.tsx` and `buildDeckModel.ts` / `buildLowerTierDeckModel.ts`. Material engine remains `calculateEstimate('decks', values)`. Never make AI-generated images the source of material quantities.
- 3D implementation `src/components/Consultation3D.tsx`, dynamically loaded from `ConsultationStudio.tsx`, using React 18 + `@react-three/fiber@8`, `@react-three/drei@9` and `three`. Shapes are concept geometry with an orbit camera and preliminary board-color swatches.
- Moderno, Contempo, Classico, Fresco, Aria roof concepts are placeholder canopy massing only. **Not** Renaissance engineering, product-accurate 3D, or included patio-cover BOM. Screen rooms, sunrooms, standalone patios are not implemented in this first consultation release.
- The house photo overlay uses manual image alignment, **not photorealistic AI rendering**. Label it clearly. Later: use calibrated camera, masks/depth/segmentation, authenticated server-side AI generation with controllable geometry and per-user cost limits.
- Pricing remains ONLY in the **separate estimating app**. This app exports versioned dimensions, material takeoff and selections and imports returned tier/scope data. No invented price or automatic API integration without external app contract.

## Release safeguards
- Preserve production GitHub repo `SSDesignBuild/EZTakeoff` and existing Netlify site `eztakeoff.netlify.app` (site ID `afb809fb-cc3e-4b69-ae1a-1e8d5fd8c764`).
- Work on a feature branch, `npm ci && npm test && npm run build`, inspect Netlify preview, squash PR with expected head SHA; confirm production deploy is **ready** and its commit matches the merge.
- Keep existing precise stock-cut constraints (composite/PVC 16/20ft), beam/post/patio/deck/screen/sunroom takeoffs, removed material log, skirting, gates, stairs. Never replace the authoritative estimator with an LLM.
- Photograph uploads must not be embedded in exported pricing JSON, sent to public image services, or placed in localStorage. Client photo metadata is sensitive.
- Keep structural and connection warnings. Do not overstate accuracy of visual concepts as stamped drawings.
- Do not claim a Netlify production change without checking the deployment commit and Ready/Published status.

## Next priorities (not yet delivered)
1. Real authentication + per-salesperson workspace permissions; durable project/document/object storage, privacy/retention. Connector Supabase skill required before Supabase changes.
2. Shared admin-managed S&S product catalog: actual manufacturer textures, 3D assets, constraints, versions/SKUs, costs, availability, sample accuracy, takeoff mappings.
3. Accurate house photo calibration, surface segmentation, orientation/scale, photo-composite preview from matched camera; then explicitly opt-in AI polish with verified constraints.
4. Composable patio covers, screened enclosures, Eze-Breeze/sunroom modules with independent and combined takeoffs.
5. Connect the user’s actual estimating app after obtaining its supported API, authentication, and tier response schema. Handoff JSON is already defined as a transport-neutral first version.
6. Real browser smoke tests and visual snapshots on iPad/desktop; automated WebGL screenshot tests, non-rectangular polygon tests; QA against real-built reference photos.


## Manufacturer catalog-driven visuals (2026-11-18)
- 36 TimberTech board photographs are registered to actual collection/name/product image URLs and cached by Netlify build for first-party 3D texturing, not generated swatch hues.
- Rail catalog contains metal IRE Classic/Modern/Drink, PVC Statement/Pinnacle, vinyl Reliance, composite Classic profiles and S&S wood pickets/black round balusters. IRE takeoffs remain coordinated; non-IRE variants explicitly blocked/flagged until verified kit BOM.
- Renaissance families have visually distinct solid roof, truss ends, full trusses, translucent polycarbonate, lattice and pivoting louver models; palette White/Bronze/Sandstone/Black. Family geometry does not assert exact manufacturer extrusions, approved roof load spans, or cover takeoff.
- Render chain: ConsultationVisualPickers -> consultation values -> visualCatalog -> Consultation3D -> modular manufacturer family 3D with custom-polygon-clipped deck board strips.
- Build pipeline: Netlify runs manufacturer asset sync, tests and Vite. GitHub workflow is manual-only; do not turn on scheduled/push/PR GitHub Actions without permission.
- Keep house-photo overlay manual and no AI-generated dimensional promises. Commercial image reuse rights should be reviewed.
