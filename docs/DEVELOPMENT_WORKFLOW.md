# S&S EZTakeoff — mandatory implementation and deployment workflow

## User requests are work orders, not drafting exercises

**Effective November 24, 2026:** When the owner says **fix, change, add, update, continue, build, or deploy EZTakeoff**, the assistant/developer MUST **perform the actual requested source-code changes, tests, and verified Netlify deployment**. Do **not** substitute an explanation, task list, developer prompt, generic recommendations, or request for another conversation. A planning message is permissible only as a short progress notice while the actual work is already underway. Do not ask for confirmation of requirements already supplied.

## Execution steps
1. Inspect the live GitHub `SSDesignBuild/EZTakeoff` `main` HEAD and the published commit on Netlify site `afb809fb-cc3e-4b69-ae1a-1e8d5fd8c764`. Read current `docs/PROJECT_CONTINUATION.md` and affected source modules before editing.
2. Study the exact owner video, images, manufacturer drawings and source supplied with the request. Trace each reported defect to the geometry, renderer, UI, material order and state, not only the visible screenshot. Don't skip referenced evidence or substitute generic forms for authentic products.
3. Create a feature branch at the verified HEAD. Implement the changes, including preservation of existing designs, original Admin material takeoff, supplier stock cuts, customer photo privacy and external Estimator price authority. A single geometry source must serve 3D and takeoff; no unapproved engineering claims.
4. Add executable regression checks for the reported defects, including relevant counterexamples, layout and cross-module material parity. Run **Netlify as the sole automatic CI/build system** with exactly `npm run assets:sync && npm test && npm run build`. GitHub Actions must remain `workflow_dispatch` **manual-only**; do not consume GitHub Actions quota. Do not hide failed tests, switch off validation, remove old test cases or publish temporary diagnostics.
5. Examine the exact feature-branch Netlify Deploy Preview and fix all errors. For visual changes, compare actual rendered browser/WebGL imagery on representative deck/screen/sunroom cases whenever capable; explicitly distinguish source/automated verification from unperformed hands-on screenshot review.
6. Merge via PR pinned to expected HEAD only after strict preview is Ready. Confirm the final production Netlify deploy is **published/Ready** and its commit exactly matches the merged GitHub `main` SHA before calling the change live.
7. Update `docs/PROJECT_CONTINUATION.md` and this workflow when decisions change. Final response: concise **implemented/deployed result**, live link, PR/commit and any genuine outstanding unverified issues. Do not end with an unsolicited prompt for another assistant to build it.

## Latest scope safeguards
- Sunroom wall **section** means one full physical opening between Renaissance posts; internal uprights divide glass bays. Front/rear Elite walls must terminate at the actual **underside of the structural main beam**, not the roof soffit; geometry and 24-ft extrusion stock both follow measured beam elevations.
- Do not offer discontinued **Lumino sunroom** in Sales or render its old conceptual assembly; old selections are archived/safely handled, not silently rebranded as Elite.
- Window/Elite Prime 32/36-in full-view entrance should visually match owner-supplied actual white aluminum field photos while preserving gross-window, independent transom, door and manufacturer shop-dimension review blockers.
- Access skirting gates must have uninterrupted upper horizontal courses and no see-through strip. For a short gate, model the single full-wall ripped header course and keep the gate aligned to its bottom. Material order must match the renderer.
- Renaissance SD/HD 3-7/8-in outside posts have a **3-3/8-in central flat span with 1/4-in projecting corner ribs**, as shown by the supplied manufacturer SD drawing. Preserve actual outside envelope and gauge; undimensioned groove details are design references, not exact factory dies.
- Do not automatically draw duplicate independent railing across stair access or inside an enclosure. Preserve required guardrail safety checks and user-selected independent rail conditions, and flag cases needing approved guard/egress solutions.

## Owner screenshot corrections — persisted rules
- User-selected left/right **stair railing is independent of enclosure-level deck edge rail suppression**. Any sunroom or screen room at the landing must NOT remove the chosen stair rail down the flight. The stair railing style, color, balusters and post rules must match the main deck railing selection.
- Actual Elite Prime door is not a frameless full-height sheet of glass; preserve photo-derived opaque aluminum stiles, top/bottom rails, visible round knob and independent deadbolt on both sides. Factory hardware specs still need supplier confirmation.
- A Renaissance post and trim cap must not protrude above an insulated roof panel. Clip visible post top to the real roof-panel underside at the post's seated location without rewriting manufacturer stock dimensions.
- An Elite sunroom requires completed deck finish boards immediately INSIDE the wall receiver. Use one coordinate authority for visual geometry and supplemental, stocked material takeoff rather than leaving a dark substrate strip or rendering a free painted patch.
