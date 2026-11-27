# EZTakeoff current checkpoint

## November 26, 2026 — R2 candidate

Repository: `SSDesignBuild/EZTakeoff`. Production: https://eztakeoff.netlify.app.
Netlify site: `afb809fb-cc3e-4b69-ae1a-1e8d5fd8c764`.

The verified starting source is main `68725e7f607ab4cbf81b5d29d6211f9fcf8c0a90`, published by Ready Git deployment `6b08aadd779e4240d73c1504`. All 191 source files in the supplied baseline matched that Git tree. This R2 package contains additional working-source changes; it is not that production commit and is not published merely because the ZIP exists.

The owner permanently uses complete source-and-build ZIP releases with one PowerShell block. `Release-EZTakeoff.py` in the archive performs normal Git/GitHub CLI synchronization and Netlify verification on the owner's computer. Do not use GitHub Create Tree, connector file writes, manual deployment uploads, or GitHub Actions. The proposed branch is `release/geometry-cad-lighting-20261126-r2`. Main must still equal the expected baseline before a new merge.

## Implemented batch

- Renaissance decorative ends now use a straight upper edge, an ogee-cut underside, and fixed-height longitudinal grooves. Original part illustrations and reference photography guide the visual approximation. This is not verified factory CAD. The exposed length respects the cover/header; post/trim clearance follows the whole footprint beneath the roof.
- Removed the supplemental sunroom floor patch and its takeoff. Shared physical deck strips, including narrow perimeter rips, determine visible boards and field cuts.
- Side picture-frame and breaker courses receive actual flat pressure-treated nailers, 1.5 inches thick, sized/ripped from 2x6/8/10/12 stock. Geometry, cut ordering and CAD use the same pieces, including multiple courses, reversed/concave/angled outlines and lower tiers.
- S&S defaults: 18-inch diameter x 12-inch deep footings, 3 eighty-pound bags per standard footing; stair landing 4 x 4 feet x 4 inches, 12 bags with an explicit editable 25% ordering allowance. Custom dimensions/yield remain editable and existing explicit values persist. These are company estimating defaults, not a statewide code claim.
- Screen/sunroom quick actions open and focus their settings with feedback. Reopening unchanged settings preserves revision/pricing. Added two owner-authorized, sanitized railing reference photos.
- Symmetric canopy lighting, all enabled fixture lenses illuminated in Evening, optional fan lights, and stair-top guard posts clear enclosure walls while preserving selected stair guards.
- Deck construction sheets share model geometry and edited material orders. New vector PDF and native inch-based DXF include dimensions, footing/setout, framing/nailers, decking/stairs, elevation/details, connection keys and schedules. Existing Admin exports and Studio handoff remain.

## Verification and next action

Read the archive's `VERIFICATION.md` and `CHECKPOINT.json` for the exact completed gate and evidence. Independent DXF audits and PDF rendering validate exported files. Actual S-curve triangle coordinates were rendered and numerically audited offline. Browser end-to-end/WebGL review was unavailable in this environment; do not describe it as passed. Production is unchanged until the owner runs the supplied PowerShell release block. The helper requires exact-head Ready preview, pinned PR merge and matching published Ready main, then writes `release-result.json` and prints `SYNC COMPLETE`.

Future exact solid/STEP work remains separate: evaluate Replicad/OpenCascade.js in a lazy worker with CadQuery reference solids. No browser solid engine or application STEP export is claimed in R2. Structural connections still require approved project details.

Resume from this checkpoint and the latest ZIP; compare live main/published state. Do not recursively load previous conversations. Preserve Admin Takeoff, Design Studio, shared geometry, stock optimization, customer data and external pricing. Keep this checkpoint below 700 words. Raw customer media, factory source drawings and private QA stay outside published source.
