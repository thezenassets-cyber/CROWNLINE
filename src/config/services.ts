/**
 * Owner-editable service catalogue. `availability` controls how each service is
 * presented publicly:
 *   - 'quote_on_request': requests are accepted and reviewed by staff before any booking.
 *   - 'planned': shown as not yet available; quote requests are not accepted.
 * Do not mark a service as available unless Crownline can actually deliver it.
 */
export type ServiceAvailability = 'quote_on_request' | 'planned';
export type ShipmentType = 'parcel' | 'document' | 'pallet' | 'freight';

export interface ServiceDefinition {
  code: string;
  slug: string;
  name: string;
  shortDescription: string;
  availability: ServiceAvailability;
  /** Rate-card service used by the calculator, if any. */
  pricingServiceCode: string | null;
  shipmentTypes: ShipmentType[];
  scope: 'domestic' | 'international' | 'either';
  image: { src: string; alt: string };
  page: {
    headline: string;
    whatItIs: string;
    whoItSuits: string[];
    process: { title: string; detail: string }[];
    informationNeeded: string[];
    goodToKnow: string[];
  };
}

export const SERVICES: readonly ServiceDefinition[] = [
  {
    code: 'domestic_parcel',
    slug: 'domestic-parcel-shipping',
    name: 'Domestic parcel shipping',
    shortDescription: 'Boxes and envelopes moving within one country, coordinated through a suitable carrier.',
    availability: 'quote_on_request',
    pricingServiceCode: 'domestic_parcel',
    shipmentTypes: ['parcel', 'document'],
    scope: 'domestic',
    image: {
      src: '/images/service-final-mile-delivery.jpg',
      alt: 'A delivery worker in a navy jacket handing a cardboard parcel to a recipient at a townhouse door.',
    },
    page: {
      headline: 'Parcels within one country, handled with care and clear updates.',
      whatItIs:
        'Domestic parcel shipping covers boxes and documents that start and finish in the same country. Crownline reviews your shipment details, selects a suitable carrier service, and shares the tracking milestones as they are confirmed.',
      whoItSuits: [
        'Individuals sending gifts, documents or personal items',
        'Small businesses sending orders to customers',
        'Teams that need occasional same-country deliveries without managing several carrier accounts',
      ],
      process: [
        { title: 'Estimate', detail: 'Use the calculator to see the billable weight and an indicative price where pricing is configured.' },
        { title: 'Request', detail: 'Send the details. A member of staff checks the route, packaging and service options.' },
        { title: 'Confirm', detail: 'You receive a confirmed price and collection or drop-off instructions before anything is booked.' },
        { title: 'Track', detail: 'Once booked, you receive a tracking code that shows each confirmed milestone.' },
      ],
      informationNeeded: [
        'Collection and delivery city and postal code',
        'Number of boxes, plus weight and outside dimensions of each',
        'A short description of the contents',
        'Any delivery preferences, such as a signature or business address',
      ],
      goodToKnow: [
        'Carriers charge on whichever is greater: the actual weight or the dimensional (size-based) weight.',
        'Some items, including batteries, liquids and hazardous goods, have restrictions. Ask before packing.',
      ],
    },
  },
  {
    code: 'international_parcel',
    slug: 'international-parcel-shipping',
    name: 'International parcel shipping',
    shortDescription: 'Parcels and documents crossing borders, with help preparing customs information.',
    availability: 'quote_on_request',
    pricingServiceCode: 'international_parcel',
    shipmentTypes: ['parcel', 'document'],
    scope: 'international',
    image: {
      src: '/images/service-customs-documentation-check.jpg',
      alt: 'A logistics employee in a hi-vis vest checking a shipping document and scanning a sealed parcel at an inspection table.',
    },
    page: {
      headline: 'Send parcels abroad with the paperwork explained in plain language.',
      whatItIs:
        'International parcel shipping moves boxes and documents between countries. Besides transport, every international parcel needs customs information that describes what is inside, what it is worth, and why it is being sent.',
      whoItSuits: [
        'Online sellers shipping to customers abroad',
        'Individuals sending personal items or documents overseas',
        'Businesses sending samples or spare parts to partners',
      ],
      process: [
        { title: 'Estimate', detail: 'Check the billable weight and indicative price. Duties and taxes are not included.' },
        { title: 'Describe the goods', detail: 'Tell us what is inside, its value and its purpose so customs information can be prepared correctly.' },
        { title: 'Confirm', detail: 'Staff confirm the service, price and any documents you need to provide before booking.' },
        { title: 'Track', detail: 'Follow export, transit, customs and delivery milestones as carriers confirm them.' },
      ],
      informationNeeded: [
        'Sender and recipient countries, cities and postal codes',
        'Weight and outside dimensions of each package',
        'A clear description of the contents and their value',
        'Whether the shipment is a sale, gift, sample, return or personal effects',
      ],
      goodToKnow: [
        'Import duties and taxes are set by the destination country and are usually paid by the recipient unless agreed otherwise.',
        'Customs authorities can hold shipments for inspection. When that happens, the tracking page will say so.',
      ],
    },
  },
  {
    code: 'air_freight',
    slug: 'air-freight',
    name: 'Air freight',
    shortDescription: 'Palletised or heavier cargo moved by air when speed matters more than cost.',
    availability: 'quote_on_request',
    pricingServiceCode: 'air_freight',
    shipmentTypes: ['pallet', 'freight'],
    scope: 'international',
    image: {
      src: '/images/service-air-freight-loading.jpg',
      alt: 'A shrink-wrapped pallet being lifted into an unbranded cargo aircraft at dusk by a main-deck loader.',
    },
    page: {
      headline: 'Time-sensitive cargo, coordinated through air freight partners.',
      whatItIs:
        'Air freight carries palletised and loose cargo on cargo aircraft or in the hold of passenger flights. It is usually the fastest option between countries and is priced on chargeable weight, which accounts for the space cargo takes up.',
      whoItSuits: [
        'Businesses with urgent stock, spare parts or launch materials',
        'High-value or time-sensitive goods',
        'Shipments too large for parcel networks but needed quickly',
      ],
      process: [
        { title: 'Describe the cargo', detail: 'Share pallet counts, weights, dimensions and the nature of the goods.' },
        { title: 'Review options', detail: 'Staff check routing, airport handling and documentation needs.' },
        { title: 'Confirm and book', detail: 'You receive a confirmed quote and booking instructions before cargo is released.' },
        { title: 'Track milestones', detail: 'Follow acceptance, departure, arrival and customs release as they are confirmed.' },
      ],
      informationNeeded: [
        'Origin and destination cities or airports',
        'Number of pieces with weight and dimensions of each',
        'Commodity description, value and any special handling needs',
        'Who is responsible for import clearance and duties',
      ],
      goodToKnow: [
        'Air freight commonly uses a volumetric ratio of 1:6 (6,000 cm³ per kg); the rate card states which ratio applies.',
        'Dangerous goods, lithium batteries and perishables need advance approval.',
      ],
    },
  },
  {
    code: 'ocean_freight',
    slug: 'ocean-freight',
    name: 'Ocean freight',
    shortDescription: 'Cost-effective sea transport for larger consignments, shared or full containers.',
    availability: 'quote_on_request',
    pricingServiceCode: 'ocean_freight_lcl',
    shipmentTypes: ['pallet', 'freight'],
    scope: 'international',
    image: {
      src: '/images/service-ocean-freight-vessel.jpg',
      alt: 'An aerial view of a fully loaded container ship crossing open, deep-blue ocean.',
    },
    page: {
      headline: 'Larger consignments by sea, with each milestone explained.',
      whatItIs:
        'Ocean freight moves goods in shipping containers. With less-than-container-load (LCL) shipping, your cargo shares a container with other shipments; with full-container-load (FCL), a container is reserved for you. Sea transport is slower than air but usually far less expensive for heavy or bulky goods.',
      whoItSuits: [
        'Importers and exporters moving pallets or large volumes',
        'Businesses that can plan several weeks ahead',
        'Heavy goods where air freight would be uneconomical',
      ],
      process: [
        { title: 'Share cargo details', detail: 'Tell us the volume, weight, packaging and ports or cities involved.' },
        { title: 'Plan the route', detail: 'Staff review sailing options, origin and destination handling and documentation.' },
        { title: 'Confirm', detail: 'You receive a confirmed quote that lists what is and is not included.' },
        { title: 'Track', detail: 'Follow loading, departure, arrival and customs release as each is confirmed.' },
      ],
      informationNeeded: [
        'Origin and destination cities or ports',
        'Total volume (cubic metres) and weight, or dimensions of each pallet',
        'Commodity description and value',
        'The agreed terms of sale (Incoterms), if known',
      ],
      goodToKnow: [
        'Shared-container (LCL) pricing is usually charged per "weight or measure": 1 cubic metre is treated as 1,000 kg, and whichever is greater is charged.',
        'Port charges, customs clearance and destination delivery may be quoted separately.',
      ],
    },
  },
  {
    code: 'road_freight',
    slug: 'road-freight',
    name: 'Road freight',
    shortDescription: 'Pallets and part-loads moved by truck, domestically or across land borders.',
    availability: 'quote_on_request',
    pricingServiceCode: 'road_freight',
    shipmentTypes: ['pallet', 'freight'],
    scope: 'either',
    image: {
      src: '/images/service-road-freight-highway.jpg',
      alt: 'Two unbranded freight trucks travelling along a misty highway through rolling countryside at dawn.',
    },
    page: {
      headline: 'Pallets and part-loads by road, planned around your schedule.',
      whatItIs:
        'Road freight uses trucks to move pallets, part-loads and full loads between businesses. It suits regional and cross-border routes where goods are too large for parcel networks.',
      whoItSuits: [
        'Businesses moving pallets between warehouses, suppliers and customers',
        'Cross-border shipments along land routes',
        'Goods that need a tail-lift, booking slot or specific delivery window',
      ],
      process: [
        { title: 'Describe the load', detail: 'Share pallet counts, dimensions, weights and loading conditions.' },
        { title: 'Plan', detail: 'Staff check vehicle requirements, delivery windows and any border formalities.' },
        { title: 'Confirm', detail: 'You receive a confirmed price and collection arrangements before booking.' },
        { title: 'Track', detail: 'Follow collection, transit and delivery milestones as they are confirmed.' },
      ],
      informationNeeded: [
        'Collection and delivery addresses, including access restrictions',
        'Number of pallets with dimensions and weights',
        'Whether a tail-lift or booked delivery slot is required',
        'Commodity description and any special handling needs',
      ],
      goodToKnow: [
        'Road freight is often priced on loading metres or a volumetric ratio; the rate card states which applies.',
        'Waiting time and failed collections can incur additional charges from hauliers.',
      ],
    },
  },
  {
    code: 'business_shipping',
    slug: 'business-shipping',
    name: 'Business shipping',
    shortDescription: 'One coordinator for recurring shipments, with consolidated tracking and documents.',
    availability: 'quote_on_request',
    pricingServiceCode: null,
    shipmentTypes: ['parcel', 'document', 'pallet', 'freight'],
    scope: 'either',
    image: {
      src: '/images/service-business-shipping-packing.jpg',
      alt: 'A small-business owner carefully packing a ceramic cup into a cardboard box with tissue paper.',
    },
    page: {
      headline: 'Recurring shipping, coordinated by one partner.',
      whatItIs:
        'Business shipping is for companies that ship regularly and want one point of contact across parcel, freight and international services. Crownline reviews your shipping profile and proposes a working arrangement, including how quotes, bookings and tracking updates are handled.',
      whoItSuits: [
        'Online stores and small manufacturers',
        'Companies that ship to several countries',
        'Teams that want shipment visibility without managing multiple carrier portals',
      ],
      process: [
        { title: 'Tell us about your shipping', detail: 'Typical volumes, destinations, package sizes and service expectations.' },
        { title: 'Review', detail: 'Staff assess which services and carriers suit your profile.' },
        { title: 'Agree terms', detail: 'Pricing and service terms are confirmed in writing before any shipment is booked.' },
        { title: 'Ship and track', detail: 'Each shipment receives a reference and tracking code; account access is planned.' },
      ],
      informationNeeded: [
        'Company name and contact details',
        'Approximate monthly shipment volume',
        'Main origin and destination countries',
        'Typical package types, weights and sizes',
      ],
      goodToKnow: [
        'Business customer accounts with organisation-level access are on the roadmap and not yet available.',
        'Bulk upload and API access are planned features and are not offered today.',
      ],
    },
  },
  {
    code: 'fulfillment',
    slug: 'fulfillment',
    name: 'Shipment coordination & fulfilment',
    shortDescription: 'Storage, pick-and-pack and order dispatch. Not yet offered.',
    availability: 'planned',
    pricingServiceCode: null,
    shipmentTypes: ['parcel'],
    scope: 'either',
    image: {
      src: '/images/service-warehouse-distribution.jpg',
      alt: 'A large, organised distribution centre with tall pallet racks, a forklift and two workers in hi-vis vests.',
    },
    page: {
      headline: 'Fulfilment services are planned, not yet available.',
      whatItIs:
        'Fulfilment means storing your stock, packing orders as they arrive and handing them to carriers. Crownline does not currently operate warehousing or fulfilment. This page describes the service we intend to offer so you know what to expect.',
      whoItSuits: ['Online sellers who want to outsource storage and packing (when available)'],
      process: [
        { title: 'Not yet available', detail: 'We are not accepting fulfilment requests yet. You can still request quotes for transport services.' },
      ],
      informationNeeded: [],
      goodToKnow: ['This page will be updated when the service becomes available.'],
    },
  },
];

export function findServiceBySlug(slug: string): ServiceDefinition | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

export function findServiceByCode(code: string): ServiceDefinition | undefined {
  return SERVICES.find((s) => s.code === code);
}
