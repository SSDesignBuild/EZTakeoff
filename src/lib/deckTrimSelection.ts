/**
 * S&S sales deck trim uses the actual field decking by default, rather than
 * the legacy Admin Takeoff seed value ("Trex Enhance Naturals - Foggy Wharf").
 * A contrasting selected picture-frame course remains independently honored
 * when borderSameBoard is explicitly disabled.
 */
export type TrimValues=Record<string,string|number|boolean>;
export function resolvePictureFrameMaterials(values:TrimValues):string[]{
  const field=String(values.deckingMaterial??'');
  const same=values.borderSameBoard===undefined||values.borderSameBoard===true||
    String(values.borderSameBoard)==='true';
  return [1,2,3].map(course=>{
    const key=course===1?'pictureFrameMaterial':'pictureFrameMaterial'+course;
    const custom=String(values[key]??'match').trim();
    return same||!custom||custom==='match'?field:custom;
  });
}
