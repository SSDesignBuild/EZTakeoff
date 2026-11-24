# S&S Estimator cloud-linked EZTakeoff designs — Nov 23, 2026

This is a **separate opt-in cloud save** feature; the original Admin Takeoff, local consultation records and IndexedDB client photographs remain intact.

## Connection
- Correct Estimator Supabase project ID: `ytiqdahvbymuswoyzalc`.
- EZTakeoff Netlify build env: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (public frontend key, never a service-role credential).
- User authenticates with the **same S&S Estimator Supabase Auth account** in the Sales Consultation Studio. Session stored only in browser sessionStorage and refreshed using Supabase Auth refresh token.
- Cloud operations use PostgREST with **user bearer JWT**, not privileged SQL. Server RLS decides which designs are visible/editable.
- Local consultation edits do not trigger automatic cloud overwrites. A user explicitly saves or opens a cloud design. Prior cloud revision must be loaded before editing an existing cloud record. PATCH requires `current_revision=eq.<previous>` and server trigger increments/archives it.

## Applied SQL migrations on the Estimator project
- `sns_quote_designs_revisioned_private_cloud`: `quote_designs`, `quote_design_revisions` append-only, audited revision/accepted/sold locks; RLS for owner, explicitly assigned team collaborators and managers; private `sns-design-private` bucket with design-scoped RLS.
- `sns_quote_design_preflight_security_and_updated_at`: BEFORE write validation of schema and JSON size, prevents Estimator pricing payloads/photo flags from being treated as saved design, restricts collaborator IDs to existing Estimator profiles sharing a quote location, and updates `updated_at`. Sold quotes cannot be linked to new editable designs.
- Database migrations **do not modify Estimator pricing tables**, `quotes` columns, quote total formulas or legacy branch/role policies.

## Known limits
- Separate Estimator price-tier JSON exchange remains until verified Estimator API contract is implemented. A saved design is not a priced quote or contract.
- There is **no automatic quote picker in Estimator** yet. Paste an existing quote UUID; server validates entitlement to link.
- Client photographs are **never uploaded automatically**. After saving a cloud design, a salesperson may explicitly upload/restore an image to/from the private Supabase bucket `sns-design-private`, guarded by the same design ownership, quote-sold, and accepted-revision policies. Estimator's existing Google Drive remains the source of its separate original job documents; there is no direct Google Drive sync from EZTakeoff.
- A salesperson's ability to save to a quote and read records follows Supabase's existing role and location policies. A cloud design is not the same thing as a shared quote permission.
- Cloud accepted revisions and sold jobs are immutable; changes need a new design revision stream/record. Sharing collaborator UI not yet implemented (backend membership guard exists).
- PR validation: strict Netlify build runs `npm run assets:sync && npm test && npm run build`; GitHub Actions remain manual-only; real mobile/tablet browser QA still required.

### Separate opt-in media sync
- Private storage object key: `sns-design-private/<design_uuid>/house-photo`; JPG, PNG or WebP only, maximum 10 MB.
- Upload/download requires the user's Estimator JWT. Database function `sns_design_media_write_allowed(text)` rejects modifications to accepted/sold jobs and outsiders. No public bucket or signed public access.
- Downloaded images are restored to this browser's IndexedDB. Deleting a local photo does **not** silently delete its separately synchronized cloud copy. A separate cloud deletion action is required for that.
