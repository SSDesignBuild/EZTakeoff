from pathlib import Path
p=Path('/mnt/data/appv51/src/data/services.ts')
s=p.read_text()
# insert constants after imports if not already
insert = r'''
const DECK_BOARD_STYLE_OPTIONS = [
  { label: 'Pressure treated 5/4x6', value: 'Pressure treated 5/4x6' },
  { label: 'Trex Enhance Naturals - Foggy Wharf', value: 'Trex Enhance Naturals - Foggy Wharf' },
  { label: 'Trex Enhance Naturals - Rocky Harbor', value: 'Trex Enhance Naturals - Rocky Harbor' },
  { label: 'Trex Enhance Naturals - Toasted Sand', value: 'Trex Enhance Naturals - Toasted Sand' },
  { label: 'Trex Enhance Naturals - Coastal Bluff', value: 'Trex Enhance Naturals - Coastal Bluff' },
  { label: 'Trex Enhance Naturals - Sunset Cove', value: 'Trex Enhance Naturals - Sunset Cove' },
  { label: 'Trex Enhance Naturals - Honey Grove', value: 'Trex Enhance Naturals - Honey Grove' },
  { label: 'Trex Enhance Naturals - Pebble Beach', value: 'Trex Enhance Naturals - Pebble Beach' },
  { label: 'Trex Enhance Basics - Clam Shell', value: 'Trex Enhance Basics - Clam Shell' },
  { label: 'Trex Enhance Basics - Beach Dune', value: 'Trex Enhance Basics - Beach Dune' },
  { label: 'Trex Enhance Basics - Saddle', value: 'Trex Enhance Basics - Saddle' },
  { label: 'Trex Enhance Basics - Tide Pool', value: 'Trex Enhance Basics - Tide Pool' },
  { label: 'Trex Enhance Basics - Golden Hour', value: 'Trex Enhance Basics - Golden Hour' },
  { label: 'TimberTech Premier+ - Natural Oak', value: 'TimberTech Premier+ - Natural Oak' },
  { label: 'TimberTech Premier+ - Dark Oak', value: 'TimberTech Premier+ - Dark Oak' },
  { label: 'TimberTech Premier+ - Weathered Oak', value: 'TimberTech Premier+ - Weathered Oak' },
  { label: 'TimberTech Vintage - Coastline', value: 'TimberTech Vintage - Coastline' },
  { label: 'TimberTech Vintage - Weathered Teak', value: 'TimberTech Vintage - Weathered Teak' },
  { label: 'TimberTech Vintage - Cypress', value: 'TimberTech Vintage - Cypress' },
  { label: 'TimberTech Vintage - Mahogany', value: 'TimberTech Vintage - Mahogany' },
  { label: 'TimberTech Vintage - English Walnut', value: 'TimberTech Vintage - English Walnut' },
  { label: 'TimberTech Vintage - Dark Hickory', value: 'TimberTech Vintage - Dark Hickory' },
  { label: 'TimberTech Landmark - Boardwalk', value: 'TimberTech Landmark - Boardwalk' },
  { label: 'TimberTech Landmark - French White Oak', value: 'TimberTech Landmark - French White Oak' },
  { label: 'TimberTech Landmark - Castle Gate', value: 'TimberTech Landmark - Castle Gate' },
  { label: 'TimberTech Landmark - American Walnut', value: 'TimberTech Landmark - American Walnut' },
  { label: 'TimberTech Harvest - Slate Gray', value: 'TimberTech Harvest - Slate Gray' },
  { label: 'TimberTech Harvest - Brownstone', value: 'TimberTech Harvest - Brownstone' },
  { label: 'TimberTech Harvest - Kona', value: 'TimberTech Harvest - Kona' },
  { label: 'TimberTech Harvest+ - Toasted Wheat', value: 'TimberTech Harvest+ - Toasted Wheat' },
  { label: 'TimberTech Harvest+ - Timber Gray', value: 'TimberTech Harvest+ - Timber Gray' },
  { label: 'TimberTech Legacy - Ashwood', value: 'TimberTech Legacy - Ashwood' },
  { label: 'TimberTech Legacy - Whitewash Cedar', value: 'TimberTech Legacy - Whitewash Cedar' },
  { label: 'TimberTech Legacy - Espresso', value: 'TimberTech Legacy - Espresso' },
  { label: 'TimberTech Legacy - Mocha', value: 'TimberTech Legacy - Mocha' },
  { label: 'TimberTech Legacy - Pecan', value: 'TimberTech Legacy - Pecan' },
  { label: 'TimberTech Legacy - Tigerwood', value: 'TimberTech Legacy - Tigerwood' },
  { label: 'TimberTech Reserve - Reclaimed Chestnut', value: 'TimberTech Reserve - Reclaimed Chestnut' },
  { label: 'TimberTech Reserve - Driftwood', value: 'TimberTech Reserve - Driftwood' },
  { label: 'TimberTech Reserve - Antique Leather', value: 'TimberTech Reserve - Antique Leather' },
  { label: 'TimberTech Reserve - Dark Roast', value: 'TimberTech Reserve - Dark Roast' },
  { label: 'TimberTech Terrain+ - Dark Oak', value: 'TimberTech Terrain+ - Dark Oak' },
  { label: 'TimberTech Terrain+ - Natural White Oak', value: 'TimberTech Terrain+ - Natural White Oak' },
  { label: 'TimberTech Terrain+ - Weathered Oak', value: 'TimberTech Terrain+ - Weathered Oak' },
  { label: 'TimberTech Terrain - Brown Oak', value: 'TimberTech Terrain - Brown Oak' },
  { label: 'TimberTech Terrain - Rustic Elm', value: 'TimberTech Terrain - Rustic Elm' },
  { label: 'TimberTech Terrain - Sandy Birch', value: 'TimberTech Terrain - Sandy Birch' },
  { label: 'TimberTech Terrain - Silver Maple', value: 'TimberTech Terrain - Silver Maple' },
  { label: 'TimberTech Terrain - Stone Ash', value: 'TimberTech Terrain - Stone Ash' },
  { label: 'TimberTech Premier - Maritime Gray', value: 'TimberTech Premier - Maritime Gray' },
  { label: 'TimberTech Premier - Dark Teak', value: 'TimberTech Premier - Dark Teak' },
  { label: 'TimberTech Prime+ - Sea Salt Gray', value: 'TimberTech Prime+ - Sea Salt Gray' },
  { label: 'TimberTech Prime+ - Coconut Husk', value: 'TimberTech Prime+ - Coconut Husk' },
  { label: 'TimberTech Prime+ - Dark Cocoa', value: 'TimberTech Prime+ - Dark Cocoa' },
  { label: 'TimberTech Prime - Maritime Gray', value: 'TimberTech Prime - Maritime Gray' },
  { label: 'TimberTech Prime - Dark Teak', value: 'TimberTech Prime - Dark Teak' },
];
const DECK_BOARD_STYLE_WITH_MATCH_OPTIONS = [{ label: 'Match decking material', value: 'match' }, ...DECK_BOARD_STYLE_OPTIONS];
'''
if 'DECK_BOARD_STYLE_OPTIONS' not in s:
    s=s.replace("import type { ServiceDefinition } from './services.types';", "import type { ServiceDefinition } from './services.types';\n"+insert) if "import type { ServiceDefinition } from './services.types';" in s else s.replace("import type", insert+"\nimport type",1)
# Need find imports top
print(s[:200])
p.write_text(s)
