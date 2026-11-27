# R3 construction CAD engineering basis

## Intended use and exact scope

The drawing package coordinates the configured installation geometry. It shows individual deck framing and finish members, stairs, guards, skirting, setout, modeled connection locations and the current material order. It also provides the configured cover/Elite wall openings and ceiling-fixture setout. It does not certify structural adequacy or convert an unknown manufacturer's part into a fabrication drawing.

Every modeled deck part has an ID, footprint, axis/endpoints, elevation, dressed size, cut length, material, purchase role and source basis. Connections reference their actual joined parts and a placement anchor. `holePattern` is deliberately absent/null unless a future verified product detail supplies it. An anchor is a connection location, not a drill-hole coordinate or an approved edge-distance/fastener schedule.

## Shared model and physical corrections

`constructionAssembly.ts` gathers the same planners used by the Studio and estimator. Feet are the internal model unit; the independent solid audit converts to millimetres. The CSV and DXF use inches. Calculations retain numeric model precision; CSV coordinates are serialized to six decimal inch places and DXF values to nine. Printed architectural dimensions are displayed to the nearest 1/16 inch, and catalog cross sections retain their decimal dimensions.

Framing uses real 1.5-inch plies and dressed joist depths. Joists terminate at the inner rim faces. Deck height means finished surface height; the actual board/subfloor thickness sets the framing datum. Fascia occupies its selected physical thickness outside the rim. Picture-frame and breaker courses are clipped into disjoint installed boards, with compatible flat support pieces below them. An independently checked connection anchor must fall on every linked footprint and on the actual common bearing elevation.

The stair planner supplies each tread, riser, stringer profile and fascia envelope. Two actual selected deck boards, their gap, the configured going and the closed-riser back face determine a feasible nosing and any rear-board rip. Narrow custom board faces add the actual number of courses. An arbitrary visual tread depth does not create or omit purchased boards.

Skirting planners supply physical boards and supporting members, including access/gate framing and stair-side slope profiles. The stock optimizer consumes those exact piece lengths, retaining kerf, end trim and unrounded residuals. Purchase bins are not installed pieces. An edited purchase quantity never silently rewrites the drawing geometry.

## Published material dimensions

`deckProductDimensions.ts` resolves known standard-width profiles and preserves positive explicit measured overrides. Unknown profiles are marked generic. These examples explain why a universal 5.5 x 1-inch board was insufficient:

| Profile | Published face x thickness, inches |
| --- | --- |
| TimberTech Legacy / Reserve / Terrain / Prime families, as mapped in the resolver | 5.36 x 0.94 |
| TimberTech Premier / Premier+ | 5.36 x 0.89 |
| TimberTech Vintage / Landmark / Harvest standard-width PVC | 5.5 x 1.0 |
| Trex Transcend / Signature / Enhance | 5.5 x 0.94 |
| Trex Select | 5.5 x 0.82 |

Fascia/riser thickness and width resolve separately. Wide/narrow PVC product options or changed supplier profiles must be entered through measured overrides. Mixing selected field and trim products with different thicknesses requires an approved leveling/rebate detail; the app records that unresolved condition instead of inventing blocking, shims or structural cuts.

Primary references are retained in the resolver, including:

- https://www.timbertech.com/product/pro-legacy-collection/
- https://www.timbertech.com/product/premier-plus-collection/
- https://www.timbertech.com/product/azek-vintage-collection/
- https://www.trex.com/products/decking/transcend/
- https://www.trex.com/products/decking/enhance/
- https://online.flippingbook.com/view/63974767/

## Drawing and exchange architecture

A single vector scene drives screen preview, PDF and DXF. Physical drawings precede the schedules; dense areas receive enlarged details. Member labels key to a compact part register. Repeated board/support contacts use dimensioned matrices. The CSV preserves individual source coordinates to six decimal inch places; DXF extended data preserves part/connection IDs, roles, sheets and revisions. DXF geometry is arranged by drawing sheet and is not a shared assembly-coordinate model. Pattern symbols identify connection locations; they do not imply a particular manufacturer's screw holes.

PDF sheets are true vector 17 x 11-inch ANSI B pages with selectable text, revision/title blocks, a scale bar and a minimum reviewed text size of 7.5 points. Print at Actual size / 100%, without page fitting, and check the scale bar.

DXF is AC1027, inch units, 1:1 model geometry. Each print sheet has a named paper-space layout and a locked viewport at its physical scale. Model-space sheet groups remain available. Dimension entities retain definition points and the live measurement placeholder. They are native non-associative dimensions: they are regenerated from the model on export, and an external CAD edit does not synchronize back into EZTakeoff. Layers distinguish rims, joists, beams, finish boards, hardware, sections, centers, hidden geometry and annotation. Part/connection/sheet/revision references survive in the `EZTAKEOFF` application data.

Primary exchange references:

- https://help.autodesk.com/cloudhelp/2025/ENU/AutoCAD-DXF/files/GUID-433D25BF-655D-4697-834E-C666EDFD956D.htm
- https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-2602B0FB-02E4-4B9A-B03C-B1D904753D34.htm
- https://ezdxf.readthedocs.io/en/stable/dxfinternals/layout_management.html

## Manufacturer envelopes and unresolved details

Elite wall extents follow the actual clear opening between seated cover posts. Outside receivers occur only at the two wall ends; internal sections share an H upright. Pitched member ends follow the roof slope across the complete profile face. The CAD elevations reproduce these outside envelopes, gross configured glazing openings and door position. Published outside extrusion dimensions are separated from illustrative sheet thickness, internal bosses, frame deductions and unverified connection clearances. Final glass/window orders and extrusion shop cuts require the supplier schedule.

The existing modeled deck post saddle now clears the full double beam. Its historical cheek/notch shape is representative, not an approved structural detail. Post rows are marked `FV` / representative: **post-to-beam connection detail is unresolved; final post end/notch cuts and drilling require the approved job detail.** The two-bolt quantity is retained as an allowance/assembly anchor; no unsupported hole spacing is drawn. The app does not silently change the job to a different notch/cap system.

Representative railing/gate profiles remain marked as such. Selected kit lengths/counts, configured run placement and guard/stair envelopes are modeled, but supplier-specific brackets, end deductions, hardware internals and hole patterns need approved product drawings. The PSL envelope likewise requires the actual approved section/grade/ply specification.

## CAD tool evaluation and implementation decision

| Tool | Role in this release | Next exact-part role |
| --- | --- | --- |
| Replicad | No runtime dependency added to the sales viewer | A lazy browser worker can author an isolated verified manufactured part and tessellate it into Three.js. Measure loading, memory, transfer and cleanup before broad integration. |
| OpenCascade.js / OCCT | OCCT is used through CadQuery for independent offline shape validity, boolean intersections, dimensions and volume checks | Exact boundary representations, curves, booleans and STEP exchange below the browser API, using a pinned tested build. |
| CadQuery 2.7.0 | Independent reference solids from exported part footprints; optional synthetic STEP export/reimport and volume/count validation | Supplier-dimensioned reference parts, independent implementation checks and STEP round trips using OCCT. |
| ezdxf 1.4.5 | Parse/audit/re-save/re-open native DXF; verify dimension measurements, source data, named layouts and locked scales | Continue as an independent exchange validator. |

Primary tool references: https://replicad.pages.dev/docs/use-as-a-library/ ; https://ocjs.org/docs/about ; https://cadquery.readthedocs.io/en/latest/intro.html ; https://ezdxf.readthedocs.io/en/stable/ .

The application exports PDF, DXF and the deck parts CSV. Any supplied STEP file is a synthetic offline QA artifact, not an application STEP-export feature or certified manufacturer geometry.

## Verification evidence

The package's `VERIFICATION.md`, audit JSON and build log record the exact final results. Regression checks reconstruct coordinates from the plotted physical outlines/connection markers rather than merely checking for text tokens. Independent OpenCascade checks use polygon intersections, anchor-to-face distances, valid solids and analytic volumes. The overlap checks cover joist/rim, nailer/framing and finish/finish pairs; contact-on-face checks cover deck-board-bearing and joist-to-beam anchors. Reported total connection counts describe each model, not all-class collision or structural certification. Independent DXF checks require zero repairs and preserved native measurements after a round trip. PDF checks cover every page's dimensions, text bounds, vector content and print layouts. Actual generated Three.js meshes test Elite roof/post clearance and door join separation.

Local browser end-to-end/WebGL review was unavailable in this environment. Offline mesh rendering and PDF inspection are documented as such; neither is presented as a browser test. The owner release helper still requires Netlify's canonical test/build gate and exact Git-built Ready preview before a pinned merge.
