/** Verified installed-product photographs. Never use a rendering of a different brand as a stand-in. */
export type PhotoReference={url:string;source:string;credit:string;qualifier?:string};
export const railingPhotos:Record<string,PhotoReference>={
  'sns-wood-pickets':{url:'/assets/ss-railing/ss-wood-picket-railing.webp',source:'',
    credit:'S&S Design Build · completed project',qualifier:'Pressure-treated wood pickets'},
  'sns-wood-round':{url:'/assets/ss-railing/ss-wood-round-baluster-railing.webp',source:'',
    credit:'S&S Design Build · completed project',qualifier:'Wood frame with round black aluminum balusters'},
  'tt-ire-classic':{
    url:'https://dev.timbertech-europe.com/images/tt/products/railing/impression-rail-express/TTAZ-Brownstone-ImpressionRailExpress-Black.jpg',
    source:'https://www.timbertech.com/product/impressionrail-express/',
    credit:'TimberTech · Impression Rail Express',qualifier:'Family photo: confirm top rail profile'},
  'tt-ire-modern':{
    url:'https://mobileimages.lowes.com/productimages/13a6fad1-f9c3-46a9-85dd-b7dcb09c89ed/44479819.jpg',
    source:'https://www.timbertech.com/product/impressionrail-express/',
    credit:'TimberTech · Impression Rail Express',qualifier:'Compare Classic / Modern profiles'},
  'tt-ire-drink':{
    url:'https://www.timbertech.com/ideas/deck-top-rail-ideas/media_1ea3a81e820cb048634f3206983060f756535d1de.webp?format=webp&width=750',
    source:'https://www.timbertech.com/product/impressionrail-express/',
    credit:'TimberTech · Drink rail inspiration',qualifier:'Visual inspiration; confirm exact IRE top kit'},
  'tt-pinnacle':{
    url:'https://admincontent.bimobject.com/public/productimages/30f1b70e-5208-4cbb-915f-ccbc5ebe7c90/819e868b-fcc1-4d7c-adbf-e4d849a039eb/856960?compress=true&height=675&width=675',
    source:'https://www.bimobject.com/en/timbertech/product/timbertech-pinnacle-rail',
    credit:'TimberTech · Pinnacle Rail',qualifier:'Installed Pinnacle decorative square-web infill'},
  'tt-radiance':{
    url:'https://www.decksdirect.com/media/catalog/product/r/a/radiance-rail-aluminum-balusters-0379_900x900.jpg?canvas=700%3A700&fit=bounds&height=700&quality=80&width=700',
    source:'https://www.decksdirect.com/',
    credit:'TimberTech · RadianceRail'},
  'tt-trademark':{
    url:'https://www.decksdirect.com/media/catalog/product/t/r/trademark_white_composite_silveroak_04_opt_900x900.jpg',
    source:'https://www.decksdirect.com/',
    credit:'TimberTech · Trademark Rail'},
  'tt-radiance-express':{
    url:'https://www.decksdirect.com/media/catalog/product/r/r/rrexpress_white.jpg?canvas=%3A&fit=bounds&quality=80',
    source:'https://www.decksdirect.com/',
    credit:'TimberTech · RadianceRail Express'},
  'tt-reliance':{
    url:'https://storage.ghost.io/c/45/43/4543c1d9-cb0f-4cd0-81cb-8d033f5abacc/content/images/size/w1600/2024/11/TimberTech_RelianceRail-1.jpg',
    source:'https://www.timbertech.com/products/railing/',
    credit:'TimberTech · Reliance Rail'},
};
export const coverPhotos:Record<string,PhotoReference>={
  'Moderno':{
    url:'https://images.squarespace-cdn.com/content/v1/56ad7e638a65e2a28605745b/ca3ef1f9-0bc3-4d11-baa7-77e64cf0d67a/moderno.jpg?format=1500w',
    source:'https://www.coloradosunroomandwindow.com/renaissance-patio-covers',
    credit:'Renaissance Moderno · installed example'},
  'Contempo':{
    url:'https://sunsolutions1.com/images/patio-covers/renaissance/Patio-Cover-Renaissance-Contempo.jpg',
    source:'https://sunsolutions1.com/renaissance-patio-covers/',
    credit:'Renaissance Contempo · installed solid roof with decorative truss ends'},
  'Aria':{
    url:'https://www.renaissancepatio.com/wp-content/uploads/2022/07/Aria-Pergola-Bronze-Deck-Renaissance_Patio.jpg',
    source:'https://www.renaissancepatio.com/patio-image-gallery/aria/',
    credit:'Renaissance Aria · manufacturer gallery installation on raised deck'},
  'Classico':{
    url:'https://images.squarespace-cdn.com/content/v1/56ad7e638a65e2a28605745b/502b9fa7-f361-4cb6-b139-a1e4abef9870/Classico.jpg',
    source:'https://www.coloradosunroomandwindow.com/renaissance-patio-covers',
    credit:'Renaissance Classico · installed example'},
  'Fresco':{
    url:'https://sunsolutions1.com/images/patio-covers/renaissance/Patio-Cover-Fresco-Translucent-Renaissance.jpg',
    source:'https://sunsolutions1.com/renaissance-patio-covers',
    credit:'Renaissance Fresco · installed example'},
};
/** Prefer real branded photography; missing is explicit, never a fake or cartoon substitute. */
