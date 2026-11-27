# R2 CAD and reference decisions — November 26, 2026

## Implemented architecture

The existing deck model remains authoritative. A shared vector scene now produces the construction preview, 17 x 11-inch vector PDF and AC1027 DXF. DXF coordinates are 1:1 inches with layers, reusable post/footing blocks and native dimensions whose live measurement placeholder is retained. The PDF uses selectable text and vector paths. No new runtime dependency or wholesale viewer replacement was needed.

The release covers deck setout, footings, framing and flat supports, deck/stair outlines, elevations, footing/stair/landing details, connection keys and material/member/hardware schedules. Material order edits remain in the schedules. It does not claim complete engineered roof/enclosure shop drawings, verified connector holes, paper-space DXF layouts, DWG/IFC support, or application STEP export. Existing subfloor and other specialized sheets remain available through the established layout export.

## Evaluated tools

| Tool | Recommended role | Decision for this release |
| --- | --- | --- |
| Replicad | High-level browser solid modeling and STEP through OpenCascade.js; tessellate into the existing Three.js viewer | Future isolated part pilot. Its official integration guide recommends a worker for kernel computation. Do not load a large kernel into every sales session merely for 2D sheets. |
| OpenCascade.js / OCCT | Exact boundary-representation curves, surfaces, booleans and exchange | Use beneath Replicad when exact manufactured parts are supported by evidence. Pin a tested build, measure startup/memory/disposal and review licensing before adoption. The OpenCascade.js site explicitly distinguishes beta documentation from its stable release. |
| CadQuery / OCP | Python parametric reference solids and independent STEP round-trip validation | Available for offline engineering validation. It is not a browser dependency and does not automatically make an approximate manufacturer part exact. |
| ezdxf | Independent parsing, dimension measurement, audit, save/reopen verification | Used on both R2 sample and complex DXF fixtures. Zero audit errors or fixes; native measurements match the source model. |

Primary references reviewed for this decision:
- https://replicad.pages.dev/docs/use-as-a-library/
- https://ocjs.org/docs/about
- https://cadquery.readthedocs.io/en/latest/intro.html
- https://ezdxf.readthedocs.io/en/stable/

## S-curve reference interpretation

The curved-versus-straight part photograph, Classico reference and Fresco/Aria 2025 connection illustrations were inspected privately. Rotating the upright sample to its installed orientation reveals a straight top and an ogee cut on the underside. The prior model bent the complete section and its grooves. The new mesh terminates a constant formed section at a smooth underside cut, retaining straight longitudinal grooves and a thin cap.

The normalized contour and representative wall/cap detail are a visual approximation authorized by the owner, not measured factory tooling or supplier-certified STEP. Approximate details do not add speculative purchased components. No original factory drawings or photographs are redistributed in source. Numerical manifold/fit checks and offline renders use the actual mesh exported by the application geometry function.

## Railing photo provenance

The owner supplied completed S&S project photographs and explicitly requested using them in the railing selector. Only the following cropped, resized, metadata-free WebP derivatives are published:

- `public/assets/ss-railing/ss-wood-picket-railing.webp`: PT wood posts, rails and square wood pickets.
- `public/assets/ss-railing/ss-wood-round-baluster-railing.webp`: PT wood frame and round black balusters.

Generic filenames and S&S credit replace private job names/addresses. The original images, their EXIF and unrelated footage remain outside the release source. No image generation was used for engineering geometry or these reference photographs.
