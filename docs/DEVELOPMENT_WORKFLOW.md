# S&S EZTakeoff — source-and-build release workflow

## Permanent owner workflow

The owner requests grouped, thoroughly tested releases delivered as complete source-and-build ZIPs, with one ready-to-copy PowerShell block per release. Implement the authorized work, verify it, package it, then let PowerShell run normal Git/GitHub CLI synchronization and Netlify deployment on the owner's computer. A request to fix or build is authorization to implement and test; do not stop with a proposal or repeat already supplied questions.

Use the updated EZTakeoff Continuation skill. Resume from the newest ZIP's `START_HERE.md`, `CHECKPOINT.json` and the current `docs/PROJECT_CONTINUATION.md`. Establish current GitHub main and published Netlify deployment independently. Never recursively reload old chats or replace newer source with a stale package.

## Implementation and engineering

1. Study the current user video, photographs and referenced drawings. Trace defects through geometry, rendering, UI, ordering and saved state. Preserve unrelated behavior and user edits.
2. Keep one geometry authority for visible physical parts, cut lists, material quantities and CAD. Do not patch a visual gap with an arbitrary extra purchased board. Narrow perimeter rips belong in the ordinary deck layout. Continuous side-border/breaker nailers are actual flat pieces with stock cuts; remove upright framing volumes before placing them.
3. S&S estimating defaults are 18-inch diameter x 12-inch deep footings and a 4 x 4 foot x 4-inch stair pad. Standard bags are 3 per footing and 12 per pad, with yield and pad ordering allowance disclosed and editable. Existing explicit project dimensions must persist. Do not describe company defaults as universal code approval.
4. Preserve approved stock lengths, kerf/end trim, offcut reuse, material/finish distinctions, lower tiers, editable orders, Admin service tabs, customer privacy and external estimator price authority.
5. Keep manufacturer-specified sections separate from undimensioned visual details. The owner permits a reference-guided decorative S-curve approximation; do not label it factory-exact. True STEP/manufacturing work needs measured or supplier geometry and independent solid validation.
6. Construction drawings use exact model geometry, clear units/scale, title blocks, dimensions, member/connection keys and schedules. Export vector PDF and 1:1 inch DXF. Confirm native dimensions, independent round trips and print legibility. Symbolic hardware callouts do not invent bolt patterns or load capacity.
7. Quick actions open the relevant settings with clear feedback. Merely reopening unchanged options must preserve revisions and imported estimating responses. Studio-to-Takeoff creates a separate editable copy and preserves the original design and Admin draft.

## Verification

- Add meaningful regression checks for changed behavior and counterexamples. Preserve existing coverage; replace obsolete source-string expectations only when the behavior itself intentionally changes and real numerical/functional tests cover it.
- Canonical gate: `npm run assets:sync && npm test && npm run build`. Netlify is the only automatic CI provider. Existing GitHub workflows remain `workflow_dispatch` only. Do not bypass failed checks or publish partial source.
- Review actual exports with an independent reader and render PDFs. For geometry, inspect actual generated mesh coordinates and dimensions. Use browser/WebGL QA when available; explicitly disclose unavailable browser review instead of substituting source checks for it.
- Keep full logs and private fixtures outside published source. Summarize actual results in the archive. Never carry prior release QA forward as proof of a changed candidate.

## Packaging

Each release contains `source/`, `build/`, `Release-EZTakeoff.py`, `RELEASE.json`, `START_HERE.md`, `CHECKPOINT.json`, `FILE_MAP.md`, `VERIFICATION.md`, `RELEASE_NOTES.md` and `MANIFEST.sha256`. Include lockfiles, tests, required source assets and all built assets. Exclude dependencies, Git history, generated source caches, secrets, raw customer media, factory originals and private QA. Anonymized synthetic verification examples may accompany the archive without entering the public repository.

`RELEASE.json` records the exact expected main, repository/site identity, release branch/title, intended source paths, explicit deletions and completed QA command. The manifest covers every packaged file except itself. Check CRCs, manifest coverage, build references and the complete archive SHA-256 before delivery. Preserve the ZIP before publication. The older `package-build-checkpoint.py` can create a development checkpoint; it does not replace the release metadata/helper or establish production status.

## Owner-run synchronization

The one PowerShell block locates the downloaded versioned ZIP, verifies its stated SHA-256, extracts it and runs the included helper. Use existing Python, Git, GitHub CLI, Node and Netlify CLI sessions. The helper may use a pinned Netlify CLI fallback only if that CLI is absent; it must not reinstall an existing setup or print credentials.

The helper verifies package integrity before any write, clones an isolated checkout, requires the expected current main, stages only listed source paths/deletions, preserves unrelated tracked files, and uses a normal feature commit/push and PR. It never force-pushes, uses GitHub Create Tree, enables Actions, uploads manual deployments, changes the Netlify site or bypasses strict validation.

Before merge, require a Ready Git-built Deploy Preview for the PR's exact head and the configured Netlify gate. Recheck main and PR head and merge pinned to that head. Success requires the current published Ready production deployment to match merged main exactly. Record PR/head/merge/deploy IDs in `release-result.json`, then print `SYNC COMPLETE`. A safe repeat resumes the same release; stale main, different branch content, a failed preview or wrong deployment stops the release.

Do not claim the candidate is live until production verification succeeds. After the owner supplies completion output, independently recheck GitHub and Netlify and update the checkpoint. No approval is needed merely to inspect, edit, test or package the authorized work.

## Persistent visual safeguards

- Sunroom wall sections terminate at actual structural beam undersides. Preserve Elite 24-foot extrusion stock, physical window bays, independent transoms and Prime door appearance. Archived Lumino choices are not silently rebranded.
- Selected stair guards remain independent of enclosure suppression. Shift stair-top posts clear of actual enclosure planes and keep mounting on an appropriate tread. Do not add duplicate guards at the stair opening.
- Clip cover posts/caps beneath the lowest roof underside over their whole footprint. Decorative truss tails must stay connected to the body/header and within the configured roof extent.
- Keep the live scene and camera state while changing finishes. Evening is view state; fixture counts are design quantities. All enabled lenses must visibly glow while a bounded lighting pool preserves performance.
- Published railing reference photos are owner-authorized, cropped and stripped of metadata. Use generic asset names and keep names, addresses and original files private.

Keep the active checkpoint under 700 words. Keep routine output bounded; save full logs to files. ZIPs preserve source and evidence, without claiming any change to platform context limits.
