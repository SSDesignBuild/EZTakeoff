# November 23 recorded visual review — controlled follow-up
Three uploaded customer-free screen recordings were inspected as visual footage; no video or homeowner photograph is committed to this public repository.

## Visual inspection
- Clip 1 (2m21s): long rotating deck/cover walkthrough. The skirting access leaf appears as an unbroken flat rectangle even though surrounding skirting has horizontal courses; steps show exposed dark framing at the riser board face when the model is viewed obliquely. The stair-stringer fascia is pale relative to selected decking; color grading and manufacturer photo-map quality still need true browser screenshot QA.
- Clip 2 (41s): close views of Dolce screen wall/3068 door/independent deck guard. Wall mullions, gate opening, roof-bearing intersections and railing offsets need QA across 4 elevation sides and both integrated/independent modes. No guardrail should disappear merely because a screen door exists; maintain this already-shipped safety invariant.
- Clip 3 (4m54s): roof projection tails, screen wall/top connections, interior views, deck skirting from underneath and Fresco standing-seam roof seen from several camera angles. Existing Renaissance end tails are aesthetic approximations, **not** certified extrusion cut shapes. Keep structural vendor signoff blockers until verified.
- The speaker's audio narration was not transcribed in this inspection environment. These are **visual observations**, not a quotation or exhaustive interpretation of the spoken instructions. Keep unverified issues open rather than making unrelated guesswork changes.

## Implemented in follow-up branch
- Create one shared exact skirting-gate finish-board layout used by stock takeoff and 3D. Each leaf and fixed upper panel draws separate planks, with matching vertical/horizontal reveal, symmetrical edge rip cuts, and chosen texture. Gate frame still remains behind face boards.
- Align leaf bottom and fixed infill to *minimum* measured grade across its two jambs on sloping edges (previously the 3D center grade and cut schedule maximum grade disagreed).
- Move riser fascia slightly in front of 2x12 stringer plumb cuts, closer to the underside of the tread, preserving 0.5in / 1in nosing selection. This prevents stringer cross-section bleeding through the customer-facing riser.
- Add material/visual plan regressions. This branch must pass strict Netlify preview before release.

## Not verified or not closed
- Independent screen door/railing placement versus stair/gate geometry on all irregular deck polygons.
- Manufacturer-certified Contempo/Classico/Aria/Fresco end-tail profiles and Fresco snap trims.
- Actual color correspondence for riser and stair-side fascia manufacturer textures; WebGL screenshot check on phones and desktop.
- Automatic voice/audio-derived issue list: requires an accurate transcript or timestamps. Do not claim the footage narrations have all been addressed.
