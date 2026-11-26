# Live Design Studio catalog and Takeoff handoff

## Owner request

The November 25 reference video showed a live design with a compact horizontal material catalog immediately below it. The requested workflow is to change deck and outdoor-living finishes while the model remains visible, then inspect/export the current design's material list and drawings without redrawing it in Admin Takeoff.

The earlier narrated geometry repairs are already on main in `5847f65b9f2225bb18d781d19f39ee1d2e15fefb`. This feature continues from that release; it does not replace the established geometry or stock-planning engine.

## User-facing behavior

| Surface | Behavior |
| --- | --- |
| Choose finishes / Review & export | One live scene with horizontally scrollable part tabs and real catalog/reference cards. Swatch changes preserve the camera and Canvas. |
| Picture frames and breaker boards | Separate tabs for each actual course, up to three; inactive saved choices survive reducing and restoring the count. |
| Deck finishes | Main decking, stair treads, perimeter and stair fascia, risers and drink rail use existing material keys and takeoff rules. |
| Railing and cover | Direct style/color tabs, compatible infills, independent cover frame/roof/ceiling finishes, and independent Dolce/Elite color selection. |
| Detailed options | Existing structural, stair, railing, skirting, gate, enclosure and cover configuration remains accessible beside the scene. |
| Concrete | Choose an actual drawn area, its field pattern/color, border product/color and width. Other areas remain unchanged. |
| Add-ons | TimberTech post, post-cap, riser and in-deck fixtures; generic outdoor fans/can lights with counts and layout controls. Day/Evening does not increment the design revision. |
| Review materials | Current complete estimator handoff lines are visible within Studio. |
| Plans & materials | Open an isolated editable Admin Takeoff copy of this revision; review/export existing deck sheets plus concrete plan/sections and complete materials. Return to Studio opens the preserved original. |

Absent components are discoverable through **Add / edit**. Switching to a cover incompatible with an active Elite sunroom is disabled with an explanation, so browsing cannot silently remove the room or its material order. The main and lower tiers retain the preexisting shared finish contract rather than introducing unused independent lower-tier material fields.

## Single source of geometry and quantities

`ConsultationFinishDock` writes existing `ConsultationProject` fields. The only additive top-level finish is optional `coverScreenColor`, defaulting to the legacy cover-matched appearance. Concrete finishes and lighting selections are backward-compatible values; old designs remain valid.

`consultationTakeoffBridge` stores each copy under a distinct `sns-studio-takeoff-v1:<id>` key and carries the originating project revision and enclosure/cover context. Copy changes recalculate `createEstimateHandoff` with the copy's current values. The normal Admin draft, original consultation, original pricing response and IndexedDB photo are untouched. This is an explicit copy, not bidirectional editing.

Field/border concrete meshes partition the actual polygon; no second concrete volume is created. `siteConcreteBodyGeometry` emits the side walls and underside only, leaving the partitioned finishes as the sole slab top and removing the coplanar flicker cause. Invalid overlapping concrete drawings continue to withhold order quantities.

Lighting meshes and material counts share physical post, riser, board and roof placement planners. Riser compatibility follows its selected finish, including fascia-matched risers. A lit cap replaces that selected cap rather than stacking another accessory. Requested fixtures that cannot be placed remain explicit issues; electrical wiring, transformer circuits, vendor SKUs, prices and structural approval are not invented.

`materialExport` wraps all six material columns and drawing labels, retains fractional quantities and paginates complete order/scope notes. The shared PDF writer resolves the final page tree before calculating xref offsets and encodes Unicode metadata correctly. The printed stock note follows the same stock-family lengths as the estimator: composite/PVC 16/20 feet and the configured pressure-treated lengths.

## Manufacturer sources

- TimberTech's official lighting product pages and linked composite/metal installation guides are recorded in `src/data/lightingCatalog.ts`; eight products have actual source photographs and supported dimensions/compatibility. Examples: [IRE post-cap light](https://www.timbertech.com/product/irx-post-cap-light/), [recessed riser light](https://www.timbertech.com/product/recessed-led-riser-light/), [in-deck light](https://www.timbertech.com/product/in-deck-light/), and [reversible accent light](https://www.timbertech.com/product/reversible-led-accent-light/).
- Sika sources, nominal unit sizes, 21 selected field patterns, eight borders, 22 chart colors and surface-hardener quantity semantics are documented in [SIKA_CONCRETE_CATALOG_20261125.md](SIKA_CONCRETE_CATALOG_20261125.md). This is a reviewed selection set, not a claim to reproduce the complete manufacturer catalog.
- Sika reference bytes reconstruct from the reviewed source bundle with exact hashes; TimberTech first-party assets retain bounded delivery/cache behavior. Generated `public/manufacturer/` files are build output.
- Product photographs are references; concrete relief/screen colors and undimensioned fixture details remain identified visual approximations. Existing roof/screen fabrication and engineering review requirements are preserved in the material export.

## Acceptance evidence

The five additional regression suites cover independent course selections and retained scope, lighting compatibility/placement/material parity, concrete partitioning/source hashes, Takeoff-copy isolation/full export pagination/PDF structure, and real Three.js projection of tall/remote geometry into portrait and landscape viewports. Existing 33 suites remain in the canonical gate.

Actual local Chromium/WebGL checks completed on the continued work:

- Desktop 1440 px, tablet 1024 px and mobile 390 px layouts have no page overflow. Keyboard tab/swatches, carousel controls, Add / edit discovery, independent course shrink/restore, real selections and reload persistence were exercised.
- Tall-roof scene bounds fit at desktop and mobile sizes. Orbit direction survives resize; changing material and moving between finish/review retain the same Canvas, scene and camera. **Fit design** explicitly reframes the current content.
- Screen finish changes the actual kick/frame material independently from the cover. Day/Evening leaves the design revision unchanged. Detailed stair controls and the Studio material list remain accessible.
- Decorated concrete was inspected close, low, opposite and far. Field/border surfaces remained continuous without visible depth fighting; the body has zero upward-facing triangles. Browser page errors were zero.
- Actual Studio-to-Admin navigation preserves original Admin and Studio records, carries exact geometry/customer/finish context, and permits isolated copy edits/reloads. Concrete and combined drawing/material PDFs were downloaded and inspected, including a nine-area schedule.

Private browser fixtures, customer/reference media and QA captures remain outside the public repository. Release requires the unchanged Netlify command `npm run assets:sync && npm test && npm run build`, a Ready preview for the exact feature head, and a Ready/published production commit matching main. The associated PR records those final release identifiers; local verification alone is not production proof. GitHub Actions remains manual-only.
