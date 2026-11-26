# EZTakeoff current checkpoint

## Active release — November 26, 2026

Repository: `SSDesignBuild/EZTakeoff`. Production: https://eztakeoff.netlify.app. Netlify site: `afb809fb-cc3e-4b69-ae1a-1e8d5fd8c764`.

The owner authorized completing the remaining Studio release and requires a downloadable source-and-build ZIP after each build. Candidate branch: `feat/studio-zip-release-20261126`, based on production/main `5847f65b9f2225bb18d781d19f39ee1d2e15fefb`. Recovered source commits `1b7802696fb6bc1f2b7c18c8b49ce319b6b14954` and `5b0b89868e515456d1e6f6b51f4eba684b29418b` are preserved locally. This release incorporates their source and the final cover-removal export correction. Use the PR's actual HEAD and Netlify published deployment to establish current status; do not infer publication from this document.

At reconciliation, main and published Ready deployment `6b0742429b45f7cb67b50ff1` both pointed at the baseline above. No feature PR existed. The isolated checkout is `/workspace/scratch/9d4c092ee58b/EZTakeoff`; original recovered work remains in `/workspace/scratch/59bc4f27c74e/EZTakeoff`.

## Implemented scope

- Horizontal bottom finish catalog changes main decking, individual picture-frame/breaker courses, stairs, fascia, risers, drink board, railing style/color, cover style/frame/roof/ceiling, screen/sunroom finishes, and independent concrete patterns/colors/borders while keeping the 3D scene visible. Inactive selections stay saved; camera and Day/Evening are view state.
- Compatible TimberTech post, cap, stair and in-deck lights share actual placement and quantities. Fans/can lights are generic design allowances. Removing a cover retains saved enclosure choices without suppressing open-deck rails/lights or exporting inactive enclosure/privacy/door materials. Unsupported drink-board previews are explained; legacy selections resolve consistently with the renderer.
- Studio exposes materials and opens an independent editable Admin Takeoff copy with exact geometry, customer, finishes, cover/enclosure, concrete and lighting context. Existing Admin drafts, original consultations, photos and imported pricing remain intact. Detailed selections are retained in exported scope notes.
- Concrete callouts avoid collisions; crowded edge dimensions remain complete in paginated slab schedules. Long names, stock notes, quantities, Unicode text and job/slab titles continue across export pages.
- `scripts/package-build-checkpoint.py` creates a source/build ZIP with `START_HERE.md`, `CHECKPOINT.json`, `FILE_MAP.md`, `VERIFICATION.md` and file hashes. Read the checkpoint first and only relevant files afterward. The archive records its own source and supplied release evidence.

## Verification and release gates

Prior recovered evidence: 39 regression suites plus TypeScript/Vite; actual concrete/material/combined PDFs (4/6/12 pages), all combined pages visually reviewed; browser finish, responsive, camera, lighting and persistence checks. Current focused regression additionally demonstrates that removing a cover suppresses stale Elite/Lumino/Dolce/privacy/door export scope while saved choices restore intact; it fails against the old bridge code.

The fresh final canonical gate passed all 39 suites plus TypeScript/Vite on November 26. The final built-app browser workflows passed finish controls, responsive layouts at 1440/1024/390 px, reload persistence, concrete finishes, independent Takeoff edits, original design/draft preservation and actual concrete/material/combined PDF downloads. Full QA is outside the repository under `/workspace/scratch/9d4c092ee58b/qa`; the ZIP includes the concise evidence, not private QA media.

**Publishing is blocked:** automatic approval review rejected the first attempted GitHub source-blob upload, interpreting the ZIP request as insufficient authorization to share source to the public repository. Zero uploads were verified; no remote branch, PR or deployment was changed. GitHub admin/push access is available, so reconnecting GitHub is not the remedy. Main and published Ready production were rechecked at `5847f65b9f2225bb18d781d19f39ee1d2e15fefb` / `6b0742429b45f7cb67b50ff1`.

Next: after explicit user authorization to publish this tested source to public `SSDesignBuild/EZTakeoff` and deploy production, upload programmatically from files without printing source/encoded assets; require a Ready Netlify preview for the exact remote head; merge pinned to that head; verify published Ready production equals merged main; update the ZIP. Do not retry the blocked upload through another route before authorization. The archive and this local checkpoint preserve all completed work.

## Persistent safeguards

Netlify alone runs automatic CI: `npm run assets:sync && npm test && npm run build`; GitHub Actions stays manual-only. Preserve Admin service tabs, shared geometry, cut optimization, customer privacy and approved stock lengths. Manufacturer acceptance: `LIVE_STUDIO_CATALOG_20261125.md` and `SIKA_CONCRETE_CATALOG_20261125.md`. Concrete relief, uncalibrated colors and undimensioned details remain illustrative; do not invent factory BOMs, engineering approval or prices.

Follow the revised `DEVELOPMENT_WORKFLOW.md`: no Create Tree; small individual text writes or authorized file-based Git; preserve the ZIP before publication. Do not reload old chats, full commits/logs or encoded asset bundles. This workflow-only archive refresh did not change application code, rebuild, publish, or re-run application QA. Keep this checkpoint under 700 words. Keep QA media and customer data out of source and ZIPs. Providing an archive reduces repeated retrieval; it does not change ChatGPT context limits or establish a platform repair.
