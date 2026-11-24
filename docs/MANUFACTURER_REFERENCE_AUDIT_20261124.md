# Manufacturer-accurate 3D reference audit - 2026-11-24

This document records the **user-provided** reference files and the spoken video review. Do **not** upload these manufacturer photographs or proprietary connection PDFs into public GitHub. The app may use verified product dimensions and source-derived procedural rules. Dimensional geometry is authoritative only where called out; perspective aesthetic interpolation is not manufacturer-stamped CAD.

## Video: 20261124-0205-39.8724950.mp4 (2:33), transcribed from the actual audio

- **00:00-00:40 - PCA pet entry**: Existing dog-door kick panel stops on either side of flap, leaving a gap/stripe. User wants one **full-width solid panel** with a pet aperture; panel taller than pet-door **outside frame**, automatically chosen.
- **00:40-01:18 - stair fascia**: Finish looks correct on one face but the STRUCTURAL stringer is exposed beneath or through the finish on the other. The underlying renderer rotated a 1.5in-thick 2x12 stringer outward while positioning its centerline on the nominal extreme tread edge.
- **01:18-01:42 - perimeter border**: Previous 3/4in overhang of picture-frame beyond external fascia face regressed inward. Restore actual exterior overhang for every polygon and reveal corner miters in the 3D image.
- **01:42-02:15 - Fresco & Aria**: Need separate Flush Truss and Raised Truss installation styles, as drawn on Renaissance 2025 connection sheets (first two pages of each family).
- **02:15-end - post/header**: Posts extend to header crown and headers clip to post SIDES, not placed on top of a shortened column. View 3.875in outside SD/HD and 7x2.75in beams in post/beam sheets.

Video transcript project (internal Descript): https://web.descript.com/31a1497d-a9de-47e8-983f-2b37515f944a/05157

## Photo-by-photo source ledger
1. `3QB6PCFH3Y_004 Post and Beam Sample.jpg` - side-clipped beams with vertical full-height post and visible hardware, not vertical load-path invented from floating header.
2. `5JFSGX734U_035 Curved Vs Straight Truss End.jpg` - Fresco 3-stage curved S-tail compared against straight flat-cut cap. Aria-specific scalloped end is distinct; both supplied 2025 parts pages.
3. `AR2CW3R4H6_032 How Dolce Track Looks When Covered.jpg` - continuous snap-cover top appearance, hidden screw-bearing cavity; keep manufacturer member cross-section rather than solid square generic cylinder.
4. `ENRTBE2AFK_017 Aria Section.jpg` - extruded tube with three hollow regions/ribbed face, Aria specific truss from manufacturer 6x2in envelope.
5. `NVCNM9469W_031 How Dolce Track Works.jpg` - close-up of interconnected track/snap cover and cooperating grooves.
6. `QM73VA2CQ4_028 Solid Insulated Kneewall.jpg` - foam-core insulated knee wall secured by opposed upper/lower channels; do not treat as a floating generic half wall.
7. `VV64T6PXTP_036 Renaissance VS Alumawood.jpg` - actual Renaissance profile/finish differs from generic aluminum patio extrusion; verified silhouettes and wall gauges determine realism.
8. `XBGGFZUC69_022 All Post Options Side by Side.jpg` - profile comparison Standard, HD, Wide and Wide+Insert; WD outside post 6x6in, SD/HD posts 3.875in, HD same outside as SD with thicker wall.
9. `XWWKT3ETA6_029 Integrated Picket Rail.jpg` - Dolce full upper screen integrated directly with lower picket section, not double guardrails.

## PDF-by-PDF manufacturer evidence
- `5JJ5X77FAS_Fresco Connection Details 2025.pdf` p1 Raised Truss and p2 Flush Truss; p3 snap-cap/terminating channel sealing; **p4** 6x2in truss beam, polycarbonate roof panel + fasteners, **straight + S-shaped curved end caps**; pp5-8 posts SD/HD/WD and beam clips. Note the connection drawings are expressly for *estimating* and require engineer sealing for construction.
- `DJCFUVEWW9_Aria Connection Details 2025.pdf` p1 Raised and p2 Flush Truss, shade tubes; **p3** 6x2in truss, 2x2in shade tubes, **scallop vs straight end caps**; pp4-7 SD/HD/WD connection details; engineering caveat.
- `DW2SCF76DD_Privacy Wall Connection Details 2026.pdf` p1 independent shade-tube/slat privacy wall with selectable 2/4/6in gap; p2 shade spacer + receiver groove; p3 precise fastener and 2in tube, 2.1in receiver, 4in spacers.
- `TZJJ6WZJJT_Dolce Screen Wall Connection Details 2026.pdf` pp1-4 OpenView post/track snap cover; pp5-9 ChairRail screen connector; pp10-11 KickPanel continuous lower solid face; pp12-13 Integrated Picket rail; pp14-15 door insert; pp16-17 Lumino windows/kneewall. Do not confuse Dolce wall kick panel with PCA pet door's independent measured kick plate.

## PCA official website verification (separate from attached Renaissance sources)
- PCA kick plate 8in standard without a pet, other options 12/14/24in.
- Magnador **small** outside 7 7/8 x 10 1/2in, saw cut 6 5/8 x 9 5/16in => automatic 12in kick; **medium** outside 13 x 15 5/8in, cut 11 7/16 x 14in => 24in kick; **large** outside 16 7/8 x 23 3/4in, cut 14 1/2 x 22 7/16in => 24in kick.
- A-500 only supports small; A-100 supports small, medium, large. Reconfirm exact purchased door compatibility with PCA before ordering.
- sources: https://www.pcaproducts.com/screen-door/accessories-hardware/heavy-aluminum-kick-plates ; https://www.pcaproducts.com/screen-door-solutions/pet-doors ; supplier: https://www.usbuildingproducts.com/aluminum-screen-doors/accessories/pet-doors/medium-pet-door

## Implementation boundary and planned next levels
- This pass adds 21st test suite, PCA continuous pet-panel perforation; actual frame/cut sizes; auto kick heights; stair stringer outer face alignment; 3/4in outside-fascia picture frame and clear miters; SIDE connected header segments with full-height posts; persistent raised/flush Aria/Fresco truss option; family-distinct curved/scallop/straight ends; estimator JSON includes mount and pet kick.
- These changes DO NOT mean exact attached PDF details have become approved structural BOM. Existing project-specific cover/door/screen engineering/takeoff blockers remain in Estimator bridge. The raised/flush gap is a reference geometry visualization, not a manufacturer-approved clip/fastener quantity. Individual physics/materials require engineering.
- Separate future high-fidelity 3D workstreams: manufacturer-correct parametric Dolce track cover/rail/decor trim, foam-core kneewall and privacy wall spacers with visible clips, Fresco snap panel seals and end closures, 3D photometric/UV calibration and actual camera-based WebGL screenshot regression. These must not be conflated with or represented as delivered by this branch.
- Never enable GitHub Actions push/PR jobs; Netlify strict 21-suite test + TS/Vite build gates are mandatory before PR merge. Validate published production SHA equals merged commit and do real-browser photo comparisons on a completed project before claiming visual perfection.
