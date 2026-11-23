# S&S Estimator × EZTakeoff design-storage integration plan (not deployed)

## Evidence from Estimator repository
- Repo: `SSDesignBuild/S-S-Estimator`; current client uses `supabase.auth`, `quotes`, `quote_lines`, and `profiles`.
- `quotes.quote_data` carries pricing snapshot; owner currently appears in `quotes.created_by`. The UI offers admin/team scope but does not establish per-quote collaborator membership in the checked source.
- Estimator already connects job photos to Google Drive using `job_photos` records, Drive folder IDs/URLs and server-side upload function.
- Estimator's exact Supabase project is `ytiqdahvbymuswoyzalc`, not currently listed under connected tool accounts. Do not perform database writes to a different project.
- Treat Estimator quote-price calculation as authoritative, never import stale sell prices into EZTakeoff as defaults.

## Recommended storage responsibilities
1. **PostgreSQL in existing Estimator Supabase project:** quote-linked project design identity, editable JSON parameter set, revisions, access membership, selected estimate pricing tier, audit log, immutable accepted revision pointer. No anonymous access.
2. **Private Supabase Storage bucket:** exported WebGL thumbnails, optional calibrated reference images, revision snapshots; signed short-lived URLs only after authorization. Never use a public bucket for client home images.
3. **Google Drive:** original homeowner/site photos, job files, plans and contracts; preserve Drive folder IDs/URLs in quote metadata and restrict project folder sharing to authorized team. Drive is not the transactional source of editable design geometry.
4. **UI:** authenticated Estimator quote opens assigned design via `/consultation/:designId?quoteId=...`; deep link verifies session, quote owner/collaborator role and version before loading. Both applications use one Supabase Auth identity project.

## Design architecture for review (NOT automatically apply without schema inspection)
- Reuse any existing quote membership ACL. If none exists, add explicit `quote_collaborators(quote_id,user_id,permission,added_by,...)` with member-validated RLS and approved admin privileges. Never allow arbitrary authenticated user selection of a quote solely by knowing an ID.
- Design record: `quote_designs(id,quote_id,created_by,current_revision,design_json,updated_at,...)` with RLS restricted to quote owner, approved collaborators and sanctioned administrators. Quotes without ID may use private draft designs owned by a rep; bind to quote on save.
- Append-only `quote_design_revisions(design_id,revision,design_json,created_by,created_at,...)` and `quote_design_files(design_id,revision,storage_path,kind,...)` with owner/collaborator or authorized admin restrictions.
- Use optimistic revision conditions to prevent colleague overwriting. Sold quotes preserve frozen selected design revision and a fixed preview snapshot.
- Restrict quote editing privileges; note the current Estimator client rebuilds `created_by` during `saveQuote` updates, which may inadvertently reassign an existing quote in a future collaborator workflow. Fix only after auditing real RLS and tests.
- Ensure meaningful order-of-operations failure handling: failure to save a design must not silently update the quote design version, and failure to save quote must not orphan permanent image claims.
- The server/API, not the browser, decides whether design price can be quoted. Verify quote item mapping against actual Estimator pricing catalog and return formal errors for unmapped options. Never fabricate prices.

## Access required to implement safely
Connect the Supabase account that owns `ytiqdahvbymuswoyzalc` to the ChatGPT Supabase integration with permission to inspect schema, verify RLS, add carefully scoped tables/storage policies and edge functions, then run read/write ownership/collaborator tests. Confirm correct account/project in tools before any migration. Do not collect a service role secret in chat.

## Release gates
Review current `quotes` RLS and any already-existing collaboration tables first; choose additive migration, no disruptive rewrite. Test owner, invited teammate, unrelated salesperson, and admin. Test deleted/revoked collaborator and sold quote revision freeze. Keep Netlify builds as the only automated CI; GitHub Actions stay manual-only.
