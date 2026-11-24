/* S&S Estimator cloud integration regression contracts. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const api=read('src/lib/consultationCloud.ts');
const ui=read('src/components/ConsultationCloudPanel.tsx');
const studio=read('src/components/ConsultationStudio.tsx');
const bridge=read('src/lib/estimatingBridge.ts');
assert.ok(api.includes('VITE_SUPABASE_URL')&&api.includes('VITE_SUPABASE_PUBLISHABLE_KEY'),
 'Use the scoped Estimator connection, not private credentials');
assert.ok(!/service[_-]?role|SUPABASE_SERVICE|apikey:\\s*['"]eyJ/i.test(api),
 'Never ship privileged service role credentials');
assert.ok(api.includes('sessionStorage')&&api.includes('grant_type=password')&&
 api.includes('grant_type=refresh_token'), 'Use Estimator Supabase Auth session refresh');
assert.ok(api.includes('return=representation')&&
 api.includes('current_revision=eq.')&&api.includes('cloudRevision+1'),
 'Optimistic concurrency must prevent cross-device edits from overwriting');
assert.ok(api.includes('estimatingResponse:null,photoPresent:false'),
 'Cloud cannot carry stale estimator price or homeowner photo metadata');
assert.ok(ui.includes('An existing cloud design already has this ID. Load its current revision')&&
 ui.includes('accepted_revision')&&ui.includes('signInEstimator'),
 'Cloud UI must prevent blind overwrite and accepted-design editing');
assert.ok(ui.includes('Quote ID must be an Estimator quote UUID.')&&
 ui.includes('onOpen('), 'Estimator quote IDs and explicit cloud restoration required');
assert.ok(studio.includes('ConsultationCloudPanel')&&
 studio.includes("navigate('/consultation/'+remote.id)"),
 'Cloud library must be integrated into the sales consultation route');
assert.ok(bridge.includes('photoAttachedToThisPayload:false'),
 'Prices and geometry handoff must not contain house photographs');
assert.ok(api.includes("const PHOTO_BUCKET='sns-design-private'")&&
  api.includes('uploadEstimatorHousePhoto')&&api.includes('downloadEstimatorHousePhoto')&&
  api.includes('/storage/v1/object/authenticated/'),
 'Optional house-photo sync must use the private Estimator bucket and authenticated routes');
assert.ok(ui.includes('Upload home photo privately')&&
  ui.includes('Restore private cloud photo')&&
  ui.includes('readHousePhoto')&&ui.includes('saveHousePhoto'),
 'Home photos must sync separately from public design JSON only when requested');
assert.ok(studio.includes('onPhotoRestored')&&studio.includes('prior?.photoPresent??false'),
 'Cross-device photo restoration should not accidentally clear existing local media');
console.log('PASS Estimator Auth, quote-linked private design JSON, conflict and security guards');
