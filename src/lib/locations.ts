export interface Location {
  slug: string;
  name: string;
  county: string;
  description: string;
  postcodesServed: string[];
  nearbyAreas: string[];
}

export const locations: Location[] = [
  {
    slug: 'tring',
    name: 'Tring',
    county: 'Hertfordshire',
    description: 'Based right here in Tring, Gutterbugs is your local exterior cleaning specialist. We know the area inside out — from the Victorian terraces in the town centre to the rural properties along Astrope Lane and beyond.',
    postcodesServed: ['HP23', 'HP4'],
    nearbyAreas: ['Aldbury', 'Wigginton', 'Long Marston', 'Wilstone', 'Puttenham', 'Marsworth'],
  },
  {
    slug: 'berkhamsted',
    name: 'Berkhamsted',
    county: 'Hertfordshire',
    description: "Berkhamsted's mix of period properties, modern estates, and hillside homes means gutters and roofs need regular attention. We're just 10 minutes away and service Berkhamsted properties daily.",
    postcodesServed: ['HP4'],
    nearbyAreas: ['Northchurch', 'Potten End', 'Frithsden', 'Nettleden', 'Ashley Green'],
  },
  {
    slug: 'hemel-hempstead',
    name: 'Hemel Hempstead',
    county: 'Hertfordshire',
    description: "From the New Town estates to the older properties around the Old Town, Hemel Hempstead keeps us busy year-round. Whether it's blocked gutters on a terraced house or moss removal on a detached property, we've got it covered.",
    postcodesServed: ['HP1', 'HP2', 'HP3'],
    nearbyAreas: ['Leverstock Green', 'Adeyfield', 'Boxmoor', 'Apsley', 'Bennetts End', 'Warners End', 'Gadebridge'],
  },
  {
    slug: 'aylesbury',
    name: 'Aylesbury',
    county: 'Buckinghamshire',
    description: "We regularly service properties across Aylesbury and the surrounding vale. From the town centre to the expanding new-build estates, we provide professional gutter clearing, roof cleaning, and pressure washing.",
    postcodesServed: ['HP19', 'HP20', 'HP21', 'HP22'],
    nearbyAreas: ['Bierton', 'Stoke Mandeville', 'Weston Turville', 'Wendover', 'Haddenham', 'Stone'],
  },
  {
    slug: 'chesham',
    name: 'Chesham',
    county: 'Buckinghamshire',
    description: "Chesham's hilly terrain and mature trees mean gutters fill up fast. We service properties throughout Chesham and the surrounding Chess Valley, keeping your gutters clear and roofs moss-free.",
    postcodesServed: ['HP5'],
    nearbyAreas: ['Chartridge', 'Ashley Green', 'Latimer', 'Ley Hill', 'Botley', 'Waterside'],
  },
  {
    slug: 'amersham',
    name: 'Amersham',
    county: 'Buckinghamshire',
    description: "From the charming Old Town to Amersham-on-the-Hill, we provide professional exterior cleaning services across the area. The mature trees and period properties here benefit hugely from regular gutter maintenance.",
    postcodesServed: ['HP6', 'HP7'],
    nearbyAreas: ['Little Chalfont', 'Coleshill', 'Penn', 'Winchmore Hill', 'Little Missenden'],
  },
  {
    slug: 'wendover',
    name: 'Wendover',
    county: 'Buckinghamshire',
    description: "Nestled at the foot of the Chilterns, Wendover properties face their fair share of moss, leaves, and debris. We're a short drive away and regularly service homes throughout the village and surrounding hamlets.",
    postcodesServed: ['HP22'],
    nearbyAreas: ['Halton', 'St Leonards', 'Buckland', 'Aston Clinton', 'Weston Turville'],
  },
  {
    slug: 'kings-langley',
    name: 'Kings Langley',
    county: 'Hertfordshire',
    description: "Kings Langley's tree-lined streets and older housing stock mean gutters need regular clearing. We service the whole village and surrounding areas, from the High Street properties to the estates off Hempstead Road.",
    postcodesServed: ['WD4'],
    nearbyAreas: ['Abbots Langley', 'Chipperfield', 'Hunton Bridge', 'Bedmond'],
  },
  {
    slug: 'milton-keynes',
    name: 'Milton Keynes',
    county: 'Buckinghamshire',
    description: "Milton Keynes' mix of modern estates, older villages, and commercial properties means exterior cleaning is always in demand. From the grid roads to the historic villages like Stony Stratford and Wolverton, we provide professional gutter clearing, roof cleaning, and pressure washing across the entire Milton Keynes area.",
    postcodesServed: ['MK1', 'MK2', 'MK3', 'MK4', 'MK5', 'MK6', 'MK7', 'MK8', 'MK9', 'MK10', 'MK11', 'MK12', 'MK13', 'MK14', 'MK15'],
    nearbyAreas: ['Bletchley', 'Wolverton', 'Stony Stratford', 'Great Linford', 'Shenley Church End', 'Furzton', 'Loughton', 'Bradwell'],
  },
  {
    slug: 'newport-pagnell',
    name: 'Newport Pagnell',
    county: 'Buckinghamshire',
    description: "Newport Pagnell's historic market town charm and surrounding villages present unique cleaning challenges. From the medieval buildings in the town centre to the modern developments, we provide expert exterior cleaning services throughout Newport Pagnell and the surrounding areas.",
    postcodesServed: ['MK16'],
    nearbyAreas: ['Great Linford', 'Lathbury', 'Sherington', 'Moulsoe', 'Chicheley', 'North Crawley'],
  },
];

export interface ServiceType {
  slug: string;
  name: string;
  shortDescription: string;
}

export const serviceTypes: ServiceType[] = [
  { slug: 'gutter-clearing', name: 'Gutter Clearing', shortDescription: 'Professional gutter clearing and maintenance to prevent blockages, leaks, and water damage to your property.' },
  { slug: 'roof-cleaning', name: 'Roof Cleaning', shortDescription: 'Expert roof moss removal and pressure washing with biocide treatment to protect your tiles for years to come.' },
  { slug: 'pressure-washing', name: 'Pressure Washing', shortDescription: 'Transform your driveways, patios, and paths with our professional high-pressure cleaning service.' },
  { slug: 'soffit-fascia-washing', name: 'Soffit & Fascia Washing', shortDescription: 'Brighten up your roofline with our specialist UPVC soffit, fascia, and gutter exterior cleaning.' },
  { slug: 'conservatory-cleaning', name: 'Conservatory Cleaning', shortDescription: 'Restore clarity and brightness to your conservatory roof with our specialist cleaning service.' },
  { slug: 'solar-panel-cleaning', name: 'Solar Panel Cleaning', shortDescription: 'Maintain peak energy efficiency with professional solar panel cleaning — remove dirt, bird mess, and algae.' },
];
