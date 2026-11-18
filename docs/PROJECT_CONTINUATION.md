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

## Manufacturer asset delivery timeout fix (November 18, 2026)
- Netlify uses scripts/sync-manufacturer-assets.mjs plus scripts/assetFetch.mjs to fetch official images with a 45-second aggregate network budget, 5.5-second per-request deadline **covering headers AND response body**, max two attempts, concurrency nine, image MIME and magic validation, and bounded image bytes. Optional local Netlify node_modules cache avoids repeat downloads when restored. Fail safely only when a required official photo cannot be delivered; nonrequired photos show an explicit unavailable state, never made-up colors.
- Netlify writes public/manufacturer/timbertech/asset-status.json with actual delivered/undelivered availability and elapsed time. scripts/test-asset-delivery-timeout.cjs simulates a hanging image body and verifies cancellation. GitHub remains source-control only; Netlify runs build/test/publish.

## Production deployment trigger safety (Nov 18, 2026)
- GitHub Actions remains manual-only; routine validation and publication use Netlify exclusively.
- GitHub squash-merge commit messages may include every feature-branch commit subject. A build-suppression token in any included subject can prevent Netlify from building the new main commit even if its title looks normal.
- Do not add build-suppression directives to GitHub commit subjects/bodies on branches intended for a Netlify-connected squash merge.
- Before announcing a production release, compare main HEAD to the Netlify production deploy commit and confirm that deploy is ready/published. A ready PR preview alone is not proof of production publication.

## Premium sales consultation / Renaissance drawing references (November 18, 2026)
The user supplied seven confidential Renaissance engineer-style PDFs and a live UI video. DO NOT commit or publish these drawings, screenshots with personal info or raw customer data.
Aria HD example: 12ft width x 14ft projection, 9ft posts, HD beam and posts, shade tubes about 4in apart and 2ft truss spacing.
Contempo SD lean-to: 8ft frame x11ft projection, 9ft posts, extruded main beam SD.
Fresco WD freestanding: 12ft x10ft, 9ft posts, four-post roof frame and sealed polycarbonate panels.
Fresco WD attached: 18ft x14ft, 10ft posts with WD main beam.
Moderno HD gable: 14ft total frame, 7ft each slope, higher ridge, HD beam/post and structural insulated roof.
Moderno SD lean-to: 18ft x10ft, 9ft posts, 20ft x11ft roof, 3 posts in example at 9ft bays.
Moderno SD + Dolce Open View: 12ft x10ft, 10ft posts, screen enclosure joined to structural roof.
All sample drawings say ESTIMATE ONLY; field verify and obtain signed engineering for permits/construction; do not treat example spans as manufacturer-approved span tables.
Style system: midnight navy and emerald/pearl + restrained champagne; real manufacturer product photographs instead of cartoon art, exact TimberTech swatch RGB on 3D top surfaces, expanded skirting incl sidedness/openings/slope/stairs/lower tier, hide technical structural defaults behind settings.
New files: src/components/ConsultationSkirtingOptions.tsx, ConsultationTechnicalSettings.tsx, src/data/consultationPhotos.ts, src/components/visual3d/DeckStructure3D.tsx, DeckStairAssembly3D.tsx, DeckSkirting3D.tsx. Modified ManufacturerDeck3D, RenaissanceCover3D, consultation data and external estimate bridge.
Renaissance render implements SD/HD/WD/Wide+Insert envelope, lean-to/gable roof family, freestanding layout, independent roof overhangs, Dolce-like screen assemblies and Fresco standing seams. Exact extrusion wall thickness/span schedules/roof BOM remain unverified, do not claim certified engineering.
Only GitHub as repository; Netlify handles build/test/deploy; automatic paid GitHub Actions remains off.

## November 18, 2026 — client consultation release hardening
- Manufacturer photo cards now cap waiting at 12 seconds when a lazy-loaded image enters/approaches the viewport. An unavailable remote gallery photo yields an explicit fallback and manufacturer link instead of an indefinitely empty image; off-screen cards are not incorrectly timed out.
- Netlify routine builds remain authoritative; temporary success-shaped diagnostic preview commands and helper file have been removed before merging. Strict preview must execute the same `npm run assets:sync && npm test && npm run build` command as production.
- Netlify first-party TimberTech swatches retain the end-to-end manufacturer image delivery deadline and asset-status manifest. If official photos are missing, do not substitute unverified wood colors.


## November 18, 2026 — design-accuracy continuation
- User preference: complete design and construction/material accuracy BEFORE adding S&S Estimator account/API integration or shared logins. S&S Estimator repo discovered at SSDesignBuild/S-S-Estimator; do not modify it until the design engine is ready.
- User will attach authoritative Renaissance SD, HD, Wide, Wide+Insert span tables. Do NOT infer approved roof member spans, wind/snow loads, post footing specs or BOM from seven preliminary drawing examples. Store no confidential drawings in public GitHub.
- Sales 3D now takes its deck-board face width and 1/8-inch installation spacing directly from buildDeckModel rather than drawing a different 3/16-inch gap. Stock segmentation is shared with the estimator so no unbroken 3D board exceeds a 20-ft physical stock cut; selected breaker stations create real visual joints. A conservative boundary clip avoids drawing deck board corners outside L/angled footprint boundaries.
- 3D perimeter band shows two separately positioned 1.5-inch actual-width plies instead of superimposed beams; actual 6x6 and 8x8 post cross-sections use dressed 5.5/7.5 inches. This corrects visual dimensions, not code-stamped structure.
- Lower-deck skirting now reads lowerSkirting* settings independently, rather than applying main-tier skirting automatically. Lower-grade bottom 2x4 rails follow each side's end-to-end grade. Check geometry before supplier ordering.
- Regression gate scripts/test-consultation-design-accuracy.cjs covers decking spacing, breaker and 20-ft seam layout, polygon-contained board corners, rim winding/ply separation, dressed posts, lower-tier and sloped grade options.
- Preserve all Admin Takeoff service tabs, stock planners, pricing boundary, photos privacy and Netlify-only automatic build/test workflow. Manufacturer-span validation, verified rail/cover BOM, automatic photo calibration, and browser WebGL QA are still pending.


## Renaissance PDF guidance, Nov 18, 2026
- User supplied a 21-page Florida Engineering LLC span-table reference for Moderno, Contempo, Classico, Fresco and Aria. Its contents are proprietary and labeled ESTIMATING ONLY, with site-specific engineering recommended. Do not store the source PDF or full tabulations in public GitHub or Netlify.
- Applicable chart notes show 1-ft maximum roof overhang, 15-ft maximum post height, 1/4-in-per-ft minimum roof slope and 20-psf minimum live load. New limited envelope validation only constrains roof overhangs, flags unsafe saved overrides and confirms post-height review. It does not select approved spans or footings automatically.
- Solé is not covered by this reference; do not invent Solé structural approval. Obtain written rights before reproducing engineer-owned tables and obtain project-specific structural signoff before BOM approval.


## Renaissance manufacturing reference-driven 3D (November 18, 2026)
- **Original development rules reconfirmed:** top-tier premium real-product, dimensionally faithful 3D required; do not ask to reattach files already provided; reuse source documents; verify in source and tests before claiming release. Sales Consultation design accuracy comes before login, external S&S Estimator integration or new prices.
- Original seven confidential Renaissance drawing sets re-reviewed at their profile pages, not merely first-page visual silhouettes. **Do not commit PDFs or customer names/addresses**. Shared external member dimensions extracted into \`src/lib/renaissanceManufacturer.ts\`; anonymous cases validate the actual geometry as reference inputs.
- Verified profiles (outside, inches): SD post 3.875-square x .090 wall; HD post 3.875-square x .188 wall; WD post 6-square x .125 wall. SD header 7 tall x 2.75 deep x .080 wall; HD header SAME outside 7x2.75 with .125 wall; WD header 7x4.875 with .125 wall; wide-insert has WD OUTER envelope with concealed internal support, not an enlarged fantasy cross-section. Exact exterior wall gauges remain reference-specific; no PE approval claimed.
- Other drawing-backed sizes: Aria open-air projection trusses 6x2 in at 2ft O.C.; 2x2 shade tubes, 4-in clear default gap; typical solid roof insulated panel 3-in thick, 48-in standard module; structural gutter outside 5x5 in with .072 wall. Distinct model choices now affect geometry, not only labels or colors.
- Standard sample gable 14ft wide with 3.43-in/ft hip-to-ridge pitch produces ~2ft ridge elevation; standard attached roof back+front .5-in/ft pitch; freestanding Fresco has 1-ft rear AND front overhang; frontend post spacing preview follows anonymous supplied reference (18-ft SD -> 3 front posts; 18-ft WD -> 2). These reflect source examples only, not generic site wind engineering.
- The following remain unverified: actual fastener counts and torque, inner reinforcements, site wind/exposure and soil, engineered roof/footing BOM, field conditions, installed structural approvals, real-browser WebGL snapshot comparison. Keep preview as a client estimate.
- New regression gate \`scripts/test-renaissance-manufacturer.cjs\`; Netlify must pass asset sync + all tests + TS/Vite build before merge. Preserve Admin Takeoff and pricing boundary.


## Nov 18, 2026 — Actions storage audit and sculpted Renaissance detail geometry
- Github Actions storage reached 100% by account report. GitHub connector confirmed **930 historical workflow runs in SSDesignBuild/arc-control-gspro**; sample successful Windows Desktop workflow artifacts are 3.0 to 8.6 MB EACH and retained until early Feb 2027 (90 days). Golf Sim Buddy currently has NO .github/workflows on main, but historical artifacts continue to consume storage. Household-Finance has 198 runs, EZTakeoff 34 runs; sampled successful runs in those two repos had zero artifacts. Account-level billing gauge was not available via connected API, so 930 runs alone do not prove exact GB quota consumption.
- Preserve EZTakeoff \`.github/workflows/eztakeoff-validation.yml\` as workflow_dispatch manual-only. **All routine build/tests and previews run at Netlify**, with npm run assets:sync && npm test && npm run build. Never re-enable push, PR, or scheduled GitHub Actions without user's explicit approval.
- One-time Windows PowerShell utility delivered in conversation supports dry-run and opt-in deletion of older Golf Sim Buddy Actions artifacts while keeping 3 recent archives per name; no credentials are embedded and no remote deletion was performed by assistant. Existing billed storage accrual may lag after cleanup.
- Classico/Contempo Renaissance model improvements: Classico's full visible trusses are now front-to-back at width stations beneath the canopy (correct orientation) rather than generic sideways circular-rod triangles. Both Classico and Contempo have sculpted 3D truss ends; contour curves are **visually referenced**, not manufacturer-dimensioned CAD.
- Dolce Open View/standard screen walls render a polygonal screen surface and true sloping top rails on studio side walls. Previously flat top exposed a ~5-inch wedge gap on 10-foot projection at 1/2-in/ft pitch. A shared pure geometry function validates actual slope and mullion locations. Gable triangular screen infill is not yet geometrically certified.
- Regression gate \`scripts/test-renaissance-detail-geometry.cjs\` checks slope, open/standard panel bay behavior, gable elevation, wrong orientation regression, no cylinder proxy trusses and no private documents in code. Do not claim browser WebGL photo-comparison QA until run.
