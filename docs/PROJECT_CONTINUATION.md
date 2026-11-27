# EZTakeoff current checkpoint

## November 26, 2026 — R3 installer CAD candidate

Repository: `SSDesignBuild/EZTakeoff`. Production: https://eztakeoff.netlify.app.
Netlify site: `afb809fb-cc3e-4b69-ae1a-1e8d5fd8c764`.

Verified starting main is `d1830c11ff31731547b4a0cbc4fb1e8b64792e8f`, merged through PR #40. Current published Ready Git deployment is `6b08ca7298e6795bc2077558`, published November 26 at 6:11 p.m. CST. All 210 portable R2 source files matched that Git tree. R3 is a new candidate; its ZIP/build do not establish publication.

## Permanent release workflow

Deliver grouped, thoroughly tested changes as a complete source-and-build ZIP with one owner-run PowerShell block. The included `Release-EZTakeoff.py` uses normal Git/GitHub CLI synchronization, exact Git-built Netlify preview verification, pinned PR merge, then published-main verification. No connector source writes, Create Tree, manual deployment, force push or automatic GitHub Actions. Proposed R3 branch: `release/installer-cad-20261126-r3`. Its expected main is the verified R2 commit above. A request to build/fix authorizes implementation and testing; do not repeat permission questions.

## R3 changes

- `ConstructionAssembly` records individual installed parts, dressed footprints, cut lengths, elevations, source IDs, connection anchors and hardware quantities. CAD consumes the shared physical planners used by 3D and takeoff.
- Joists now fit inside actual rim plies; finish surfaces rest on framing; beam plies have real dressed widths; fascia and picture frames use actual offsets. Manufacturer board dimensions determine courses, edge rips and stair tread/nosing fit. Explicit measured overrides remain available.
- Picture-frame/breaker intersections and bearing anchors were independently corrected. Hardware counts use actual board/support and joist/beam contacts. Purchasing allowances and saved order edits remain separate from installed geometry.
- Physical stairs, railing components, skirting, gate members and lower tiers have indexed plans, elevations/details and cut references. Representative kit profiles and unresolved post-end/notch details are explicitly marked; no manufacturer drilling pattern is invented.
- Scaled 17 x 11-inch vector PDF, native 1:1-inch DXF with named locked paper layouts, and a deck parts/connections CSV. Printed dimension labels round to 1/16 inch; CSV coordinates retain six decimal inch places and DXF values nine. DXF drawing groups are arranged by sheet; CSV retains assembly coordinates.
- Studio project context reaches CAD, so enclosed-deck plans suppress the same level rails as 3D and retain selected stair rails. Elite wall/cover/fixture setout sheets use actual clear post-face openings and sloped wall heads. They are not factory glazing/extrusion shop-cut certification.
- Video repairs: nonoverlapping Prime door joints; sloped, seated Elite receivers/H heads below the roof and outside cover posts; no painted-over glass or added floor patch. Concise material rows retain expandable cut references, optimizer assignments, kerf and offcuts.

R2 improvements remain: reference-guided S-curve, removal of the supplemental deck board, flat picture-frame/breaker support lumber, S&S concrete defaults, enclosure quick-action navigation, owner railing photos, symmetric/all-on evening lights and optional fan lights.

## Verification and continuation

Read this archive's `VERIFICATION.md`, `CHECKPOINT.json` and `source/docs/CAD_ENGINEERING_R3.md` for completed checks and limits. The canonical gate remains `npm run assets:sync && npm test && npm run build`. Independent ezdxf/PDF and CadQuery/OpenCascade checks validate synthetic exports and solids; actual Three.js mesh checks cover enclosure clearance. Local browser end-to-end/WebGL review was unavailable and must not be described as passed.

No browser CAD kernel or application STEP exporter is included. CadQuery STEP examples are offline QA only. Unknown manufacturer internals, structural spans, soil/footing design and post/beam connection engineering require the approved job details.

Resume from this checkpoint and the latest verified ZIP/Git main/published deployment. Do not recursively reload prior conversations. Keep Admin Takeoff, Studio, stock optimization, customer data and pricing intact. Raw customer videos and original manufacturer drawings remain outside source. After owner release, independently verify PR/head/main/published deploy, record `release-result.json`, and update this checkpoint. Keep this entry below 700 words.
