# November 25, 2026 — narrated deck review and verification

## Status at this checkpoint

The working branch implements the nine issues identified in the full 195-second deck recording. The narration was transcribed in full, the entire visual timeline was inspected, and selected frames were examined at full resolution. This document records the requirements, causes, shared implementation, and verification without reproducing the recording or customer information.

**Local visual and functional acceptance is complete for the nine video issues below.** The close railing follow-up confirms continuous level-to-stair board transitions and selected finish on both top and side faces. This source audit is written before merge; release identifiers and the exact-head preview / published production verification are recorded in the associated pull request and delivery report. A local check alone does not establish production status.

The recording concerns a deck with an eight-corner footprint, a narrower extension, one stair flight, selected perimeter railing, and contrasting decking finishes. An anonymous fixture with the same geometric features is used for testing. This audit does not make a new accuracy claim about Renaissance roof profiles or other manufacturer assemblies outside this recording.

## Complete issue register

Times refer to elapsed time in the recording. Repeated comments at 1:39–1:43 reinforce issues 1 and 3 rather than introduce another requirement.

| # | Time | Reported requirement | Cause and shared correction | UI location |
| --- | --- | --- | --- | --- |
| 1 | 0:02–0:28 | Each picture-frame board needs a visible, correctly placed corner miter; remove the unrelated diagonal lines. | The seam overlay reflected the plan Y coordinate in the wrong world-Z direction. Physical frame pieces now use the same plan-to-scene transform as their miter geometry, with real saw-cut gaps at shared corners. Split stock pieces preserve their end miters; individual board grain follows the board direction. | **Visualize & review**; picture-frame board selections remain in **Choose finishes**. |
| 2 | 0:28–0:46 | Miter drink-rail boards and allow a separate drink-board color selection. | Rail bay boxes had square ends and did not share a continuous board plan. The shared railing layout plans adjoining mitered or butted board faces and supported stock joints. The Sales selector now persists a distinct drink-board material and applies its manufacturer sample to level and stair runs. | **Choose finishes → railing → Drink rail board color**, visible for drink-rail styles. |
| 3 | 0:46–0:59 | Fill the missing field-board strip beside the picture frame, including notched portions of the footprint. | The earlier one-dimensional clipping discarded a complete board row when only part of its width intersected a parallel border. Two-dimensional face subtraction retains the actual remaining rip or notched piece, without overlapping the frame. Connected pieces are merged so internal clipping partitions do not become false seams. | **Visualize & review**; follows the drawn outline and selected picture-frame courses. |
| 4 | 1:10–1:26 | Seat deck and stair railings on their actual surfaces; posts must not hang outside the deck or tread edges. | Level posts were centered on the perimeter and stair posts were offset beyond the flight width. Shared inward layouts now account for the post base and drink-board width. Top landing posts are shared with the level run; stair bases use the real deck/tread elevations, and intermediate posts sit on tread centers. | Existing deck/stair rail choices; rendered positions update from the measured geometry. |
| 5 | 1:26–1:39 | Make drink boards meet cleanly and continue over posts, including the level-to-stair transition. | Separately rendered level/stair cap boxes left gaps, overlaps, and exposed post tops. Shared board endpoints, landing return pieces, and sloped cuts define the full cap path. Drink-rail selection uses flush post termination. Concealed stair-post tops follow the board underside across the full post footprint, including diagonal flights; close rendered transitions have been inspected. | **Choose finishes → railing** and **Visualize & review**. |
| 6 | 1:48–2:08 | Remove the unintended beam visible in the footprint and 3D. | Small endpoint skew on an otherwise nearly axial edge triggered the generic angled-beam generator. Near-axis deviation within the double-rim envelope no longer creates another beam/post assembly. The exact footprint is preserved. True diagonal edges still generate their intended support, using polygon winding and interior clipping instead of a centroid direction that can point outside a concave deck. | **Draw the design → Move beams / Edit posts**, and the same structure in 3D. |
| 7 | 2:09–2:31 | Show stairs extending from the footprint and choose either stair railing side from the existing railing-edge screen. | The plan displayed only an entry-edge marker. It now draws the measured outward flight, tread divisions, and two selectable rail sides. Stable stored flight identifiers prevent filtered/removed main or extra flights from updating the wrong controls. Main, additional, and lower-tier rail choices persist through undo/redo and feed the same takeoff and renderer. | **Draw the design → Pick railing edges** or **Place stairs**. Click a stair side or its labeled left/right button. |
| 8 | 2:36–2:47 | Draw concrete at arbitrary locations in the design and show it in 3D. | Concrete previously existed only as an automatic stair landing. Independent site polygons now carry shared feet coordinates, thickness, and top elevation through drawing, 3D, persistence, and estimator handoff. Invalid or overlapping scope has explicit issues and no order quantity. A drawn area can supply a stair landing without buying a duplicate automatic pad when it covers the required footprint. | **Draw the design → Draw concrete**. Edit the area name, position, corners, thickness, or elevation. Stair surface option: **Included in drawn concrete area**. |
| 9 | 3:02–3:09 | Restore the missing fascia on one side. | That side was marked as a house attachment, and fascia reused the exposed-edge filter. Finish coverage is now an independent selection. The same selected fascia segments drive both the renderer and the material quantity; house attachment, guard selection, and structural support keep their own meanings. Sales defaults and both local/cloud project-open migrations enable the finish while preserving an explicit saved opt-out. | **Choose finishes → Finish fascia on house-facing edges**. |

## Source of truth and saved selections

`deckModel.ts`, `deckMiterGeometry.ts`, `deckSurfaceClipping.ts`, and `visualGeometry.ts` supply the footprint, frame faces, field-board cuts, fascia segments, and structural support decisions. The renderers consume these shapes rather than cover defects with extra colored planes or detached line overlays.

`railingLayout.ts`, `stairRailVisualGeometry.ts`, and `stairPlanGeometry.ts` share level/post coordinates, stair orientation, rail-side state, cap joints, and actual sloped lengths. The IRE material plan uses the same runs and deduplicated posts. Composite/PVC board stock remains restricted to the existing 16- and 20-foot rules; long visible drink boards split at supported joints.

`values.siteConcreteAreas` stores independent polygons with `id`, `name`, `points`, `thicknessIn`, and `elevationFt`. `siteConcrete.ts` is the area/volume/validation authority. `SiteConcrete3D.tsx` extrudes those saved polygons. The scene bounds include the site areas instead of assuming everything lies inside the deck rectangle.

The estimator handoff adds `geometry.siteConcreteAreas` and `geometry.siteConcreteQuantitiesValid`. Valid site concrete produces a measured cubic-yard material line with the existing 5% allowance. Invalid polygons, overlapping concrete areas, and collisions with automatic stair pads block that site-concrete order. A `site-plan` stair landing must be fully covered by drawn concrete at the matching top elevation. Automatic landing counts include actual main- and lower-tier flights. Pricing remains in the external estimator.

Finite but temporarily invalid polygons remain available in the editor for repair. They do not silently disappear when a thickness field is zero or a dragged corner crosses another edge. They are excluded from valid rendered/ordered geometry until corrected, and the UI states that concrete quantities are unavailable.

## Numeric regression evidence

The four dedicated recording regressions are included in `npm test`:

| Regression | Assertions |
| --- | --- |
| `test-deck-video-finish-20261125.cjs` | Field-board rips survive both board directions and one/two/three frame courses; no field/frame face overlap; notched pieces merge without artificial partitions; miter positions and physical gaps agree on translated, reversed, and stepped polygons; the nearly axial fixture has no fabricated angled beam; legitimate diagonals retain support; fascia geometry and order change together; lower-tier and additional stair identities remain stable. |
| `test-railing-video-20261125.cjs` | Complete post bases fit the deck and tread widths; adjacent cap pieces share their intended joint faces; level and stair runs share landing posts; selected sides produce the correct run count; slopes use actual lengths; stock joints remain within purchasable lengths and are supported; material color and unique post quantities agree with the render plan; lower-tier quantities use the lower height. |
| `test-stair-plan-controls-20261125.cjs` | Flight width/run and tread count match the stair frame; reversed polygon winding preserves outward direction; main/additional/lower side flags remain independent; source identifiers survive disabled or invalid preceding flights; takeoff counts follow the selected sides. |
| `test-drawn-site-concrete-20261125.cjs` | Rectangular and concave polygon volume; edge-touching versus positive-area overlap; duplicate/nested/crossing polygons; malformed and self-intersecting input; remote scene bounds; editable invalid inputs; actual landing footprint coverage; no duplicate automatic pad; main/lower landing quantities; estimator geometry and quantity parity. |

Concrete numeric counterexamples include a 120-square-foot slab at 4 inches plus a 20-square-foot concave slab at 6 inches: 50 cubic feet before allowance and `50 / 27 × 1.05` cubic yards with allowance. A slab in the empty recess of the concave polygon has zero overlap. Identical polygons are blocked. Two separate 4 × 4-foot automatic stair pads at 5 inches retain the existing total of 24 nominal 80-pound bags; a drawn slab supplying a landing does not add those bags again.

## Actual browser and visual evidence

Chromium/WebGL testing uses an anonymous saved consultation rather than customer account or photo data. The tests exercise real application controls and saved state, not only source-text searches.

Completed independent concrete UI checks:

- Draw and name an area, change thickness, and move it to a negative X coordinate.
- Reload and confirm exact polygon coordinates and properties persist.
- Enter invalid thickness and a self-crossing corner edit, observe unavailable quantities, and repair both while retaining access to the area.
- Add a second, slanted 40-square-foot polygon alongside a 30-square-foot patio; confirm the 70-square-foot total and each area's own thickness.
- Remove an area, undo, redo, restore, reload both areas, and render both at their independent positions.
- Complete the sequence with no page errors.

Multi-angle WebGL images of the deck fixture have also been inspected. They show complete field-board coverage, no displaced diagonal overlay lines, stair posts seated on the treads, fascia on the previously bare house-facing edge, and independently placed concrete. The plan image shows the outward stair flight with tread divisions and both railing-side controls. The selected brown drink board is visible along the rail path and over posts.

Five subsequent close views were independently inspected at their full 2383 × 1109 resolution. On the one-course eight-corner fixture, both convex and concave picture-frame seams lie on the individual board faces; none extend across the field or beyond the deck. The partial field boards meet the border along the parallel sides and both notches without the former missing strip. The field has no false cross-board partition seams. Rotated views also confirm the finish on the previously bare house-facing edge. These observations pass the close-range board and fascia acceptance for that fixture. One-, two-, and three-course coverage in both board directions is additionally checked numerically; the close image set is not represented as a visual check of every course combination.

A subsequent close WebGL run after the final rail changes confirms both level-to-stair transitions meet continuously, the board covers the posts, and selected English Walnut finish appears on top and side faces. The earlier white side strip was an asynchronously loaded texture retaining the untextured side-material shader; recreating that material with the loaded texture corrects the actual render. Concealed stair posts now have pitch-cut tops seated against the board underside rather than a flat top penetrating it. The actual side-color selector was exercised and saved. Long-run board joints are checked numerically, including a 26-foot-high deck fixture: pieces stay within 20-foot stock, internal joins share matching faces, and cuts occur over real posts.

## Release completion requirements

The release gate remains exactly:

```sh
npm run assets:sync && npm test && npm run build
```

Netlify remains the sole automatic CI provider; GitHub Actions remains manual-only. The associated release must satisfy all of these checks:

1. Preserve the completed close-range board, rail, stair-post, and finish acceptance, plus actual plan/control/save/reload checks.
2. Run the full strict Netlify preview for the final branch head and verify it is Ready at that exact SHA.
3. Merge the PR with the expected head SHA.
4. Verify Netlify's published production deployment is Ready and its commit equals GitHub `main`.
5. Record the PR, tested head, production commit, deploy identifier, and completed visual acceptance in the pull request release evidence and delivery report.

This audit documents observed software behavior. It does not confer manufacturer fabrication or site-specific structural approval, and it does not establish an external pricing connection. Site concrete volume does not add unspecified reinforcement, subbase, excavation, or drainage scope.
