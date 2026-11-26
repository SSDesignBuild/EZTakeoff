# Sika decorative concrete catalog and measured finishes

## Verified source scope

Reviewed November 25, 2026. The implemented selection set contains 21 field stamps/textures, eight border products, and the 22 named swatches printed on the official SikaColor-200 chart, plus plain concrete, natural concrete color and no-border choices. These are selected real manufacturer products, not a claim to include every Sika stamp or chemical system.

Primary sources:

- [Sika Patterns & Textures](https://usa.sika.com/en/construction/concrete/decorative-concrete/patterns-textures.html) identifies the stamping system and current pattern guide.
- [SikaStamp Pattern Selection Guide](https://usa.sika.com/dam/dms/us01/l/sikastamp-pattern-selection-guide.pdf), particularly pages 6–47 for field patterns and 48–49 for borders, confirms the catalog names and reference appearances.
- [SikaColor-200 Color Hardener chart](https://usa.sika.com/dam/dms/us01/t/SikaColor-200-Color-Hardener-Color-Chart.pdf), page 1, supplies the exact color codes and names. RGB values are sampled from its rendered chart, not invented color names. The chart prints 22 swatches; no missing swatch is fabricated to reconcile the PDS's stated number of available colors.
- [SikaColor-200 Product Data Sheet](https://usa.sika.com/dam/dms/us01/9/sikacolor-200-colorhardener.pdf) identifies this as a surface color hardener compatible with SikaStamp tools. It is not an integral-color dose. Its stated broadcast rates vary for lighter colors, so the app exports measured coverage area rather than guessing pail counts.
- Each option links its specific [Butterfield manufacturer tool page](https://www.butterfieldcolor.com/tool-category/stamp-patterns-accessories/), which supplies the original sample photograph, product code where published, and nominal unit dimensions where provided. Sika confirms the relationship in its [Butterfield acquisition notice](https://www.sika.com/en/media/media-releases/archive/2017/sika-acquires-butterfield-color-in-the-us.html).

`src/data/sikaConcreteCatalog.json` records each product page, guide page, original photo/thumbnail URL, source code, preview scale basis and color provenance. Official sample photographs are displayed as product references. They are not recolored to masquerade as a photograph of the selected design.

## What the preview represents

Regular slate and bluestone units, brick units and plank widths use the published nominal sizes. The actual saved slab footprint, thickness, top elevation and selected perimeter-course width drive the mesh. Border faces are mitered, clipped to the actual slab, and partitioned without overlapping corners. Field and border texture coordinates use feet and local edge direction; changing the slab size does not stretch all the bricks to fill it.

The 3D stamped surface is an explicitly approximate drawing material. Irregular mat arrangements, microtexture, grout relief, antiquing and screen color are not factory CAD or final physical color matches. The catalog's `scaleBasis` distinguishes a published unit size from an approximate texture repeat. Roman Rope uses a relative chain/loop contour traced from its published sample; its selectable course width is a design input, not an asserted mold dimension. Seamless textures do not receive a fabricated tile-joint grid. The official reference photo remains available beside the selection.

The field and border can use independent SikaColor-200 selections. A border set to **Match concrete color** follows the field. The bulk slab remains one pour: a decorative border adds no duplicate concrete volume. The side of the bulk slab is left natural because the selected product is a surface hardener; this does not claim integral coloring through its depth.

## Saved state and quantity contract

Each existing `values.siteConcreteAreas` entry accepts these backward-compatible optional fields:

| Field | Meaning |
| --- | --- |
| `stampId` | Field stamp/texture, default `plain` |
| `colorId` | Field SikaColor-200 selection, default `natural` |
| `borderStampId` | Perimeter stamp, default `none` |
| `borderWidthIn` | Course width in inches; zero disables the course |
| `borderColorId` | Separate border surface color, or `match` |

`readSiteConcreteAreas`, `serializeSiteConcreteAreas` and `updateSiteConcreteArea` preserve the selections with the polygon. Invalid editable thickness/shape inputs do not delete the stored finish. Unknown catalog IDs are retained and reported for repair; they do not silently become a different named product.

`planSiteConcrete` adds disjoint field and border square footage, border length, resolved finish identities and source URLs to each exported area. `siteConcreteFinishMaterials` exports stamping and hardener coverage in square feet. It does not invent tool purchases, rental quantities, chemical doses, installed prices, or additional slab volume. Invalid overlapping slab drawings still withhold their order quantities.

For example, a 12 × 10-foot slab with a 12-inch perimeter course has 80 square feet of field, 40 square feet of border and 44 feet of exterior perimeter. Its 4-inch slab remains 40 cubic feet before the existing 5% allowance. A 20-square-foot L-shaped slab with a 6-inch course has 9 square feet of field and 11 square feet of border; its empty recess stays empty.

## Reproducible source assets

The reviewed original thumbnail and color-chart bytes live in `src/data/sikaConcreteAssetBundle.json`, with SHA-256 provenance in `src/data/sikaConcreteAssets.json`. `scripts/sync-sika-assets.mjs` reconstructs generated `public/manufacturer/sika/` outputs from that source bundle and checks their exact hashes. Generated public files do not need to be committed.

A cold isolated copy containing only the two scripts, manifest and source bundle, with no public assets or cache and `SIKA_ASSETS_OFFLINE=1`, reconstructed **30 of 30 assets from the source bundle, with zero network fetches**, in 31 ms. Optional recovery fetching accepts only the recorded Sika/Butterfield HTTPS hosts, verifies the reviewed bytes, uses per-request deadlines and a 30-second overall budget, and never replaces a missing official reference with a generic photograph.

## Verification

`test-sika-concrete-finishes-20261125.cjs` passes: source-byte hashes, real catalog references, per-area save/reload and independent color selection, published nominal units, rectangular/concave/angled border clipping, reversed winding, disjoint face quantities and estimator parity. The existing arbitrary site-concrete regression also passes. A real-browser texture contact sheet was reviewed; this exposed and corrected the initial herringbone layout and overly periodic surface noise before acceptance.

The live dock browser run exercises actual style/color/border selections and persistence. Close WebGL acceptance and the combined material/drawing PDF inspection are recorded with the Studio-to-Admin handoff verification before release. Release still requires the final canonical tests/build and exact-head Netlify verification.

### Continued-chat concrete acceptance

The recovered overlap correction is retained: `siteConcreteBodyGeometry` emits only the slab sides and underside. The partitioned field and border meshes are the sole top surface, eliminating the duplicate coplanar cap rather than offsetting another surface above it. Numeric checks verify that the underside still equals the footprint area, wall area still equals perimeter times thickness, and no body triangle faces upward.

The current source passed the Sika finish, arbitrary site-concrete and stair-landing regression suites. Fresh Chromium/WebGL captures of the actual decorated slab were reviewed from close overhead, low oblique, opposite and distant camera positions. The selected dark field and contrasting brick border stayed continuous without visible depth-fighting artifacts in all four views; the browser reported zero page errors and zero upward body vertices. Private QA captures remain outside the public source repository. These are local acceptance results; production status must still be verified through the release workflow.
