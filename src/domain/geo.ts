import { COUNTRY_CODES, countryName } from './countries.ts';

export interface GeoPoint {
  lat: number;
  lng: number;
  /** city: a mapped city. country: only the country could be placed. */
  precision: 'city' | 'country';
}

/** Approximate country centres, used only when a scan names no mapped city. */
const COUNTRY_CENTROIDS: Record<string, [number, number]> = Object.fromEntries(
  `
AD 42.55 1.57 AE 23.42 53.85 AF 33.94 67.71 AG 17.06 -61.80 AI 18.22 -63.07 AL 41.15 20.17 AM 40.07 45.04
AO -11.20 17.87 AR -38.42 -63.62 AS -14.27 -170.13 AT 47.52 14.55 AU -25.27 133.78 AW 12.52 -69.97
AX 60.18 19.92 AZ 40.14 47.58 BA 43.92 17.68 BB 13.19 -59.54 BD 23.68 90.36 BE 50.50 4.47 BF 12.24 -1.56
BG 42.73 25.49 BH 26.07 50.56 BI -3.37 29.92 BJ 9.31 2.32 BL 17.90 -62.83 BM 32.31 -64.76 BN 4.54 114.73
BO -16.29 -63.59 BQ 12.18 -68.25 BR -14.24 -51.93 BS 25.03 -77.40 BT 27.51 90.43 BW -22.33 24.68
BY 53.71 27.95 BZ 17.19 -88.50 CA 56.13 -106.35 CC -12.16 96.87 CD -4.04 21.76 CF 6.61 20.94 CG -0.23 15.83
CH 46.82 8.23 CI 7.54 -5.55 CK -21.24 -159.78 CL -35.68 -71.54 CM 7.37 12.35 CN 35.86 104.20 CO 4.57 -74.30
CR 9.75 -83.75 CU 21.52 -77.78 CV 16.00 -24.01 CW 12.17 -68.99 CX -10.45 105.69 CY 35.13 33.43 CZ 49.82 15.47
DE 51.17 10.45 DJ 11.83 42.59 DK 56.26 9.50 DM 15.41 -61.37 DO 18.74 -70.16 DZ 28.03 1.66 EC -1.83 -78.18
EE 58.60 25.01 EG 26.82 30.80 EH 24.22 -12.89 ER 15.18 39.78 ES 40.46 -3.75 ET 9.15 40.49 FI 61.92 25.75
FJ -16.58 179.41 FK -51.80 -59.52 FM 7.43 150.55 FO 61.89 -6.91 FR 46.23 2.21 GA -0.80 11.61 GB 55.38 -3.44
GD 12.26 -61.60 GE 42.32 43.36 GF 3.93 -53.13 GG 49.47 -2.59 GH 7.95 -1.02 GI 36.14 -5.35 GL 71.71 -42.60
GM 13.44 -15.31 GN 9.95 -9.70 GP 16.27 -61.55 GQ 1.65 10.27 GR 39.07 21.82 GT 15.78 -90.23 GU 13.44 144.79
GW 11.80 -15.18 GY 4.86 -58.93 HK 22.32 114.17 HN 15.20 -86.24 HR 45.10 15.20 HT 18.97 -72.29 HU 47.16 19.50
ID -0.79 113.92 IE 53.41 -8.24 IL 31.05 34.85 IM 54.24 -4.55 IN 20.59 78.96 IO -6.34 71.88 IQ 33.22 43.68
IR 32.43 53.69 IS 64.96 -19.02 IT 41.87 12.57 JE 49.21 -2.13 JM 18.11 -77.30 JO 30.59 36.24 JP 36.20 138.25
KE 0.02 37.91 KG 41.20 74.77 KH 12.57 104.99 KI -3.37 -168.73 KM -11.88 43.87 KN 17.36 -62.78 KP 40.34 127.51
KR 35.91 127.77 KW 29.31 47.48 KY 19.31 -81.25 KZ 48.02 66.92 LA 19.86 102.50 LB 33.85 35.86 LC 13.91 -60.98
LI 47.17 9.56 LK 7.87 80.77 LR 6.43 -9.43 LS -29.61 28.23 LT 55.17 23.88 LU 49.82 6.13 LV 56.88 24.60
LY 26.34 17.23 MA 31.79 -7.09 MC 43.75 7.41 MD 47.41 28.37 ME 42.71 19.37 MF 18.07 -63.05 MG -18.77 46.87
MH 7.13 171.18 MK 41.51 21.75 ML 17.57 -4.00 MM 21.91 95.96 MN 46.86 103.85 MO 22.20 113.54 MP 17.33 145.38
MQ 14.64 -61.02 MR 21.01 -10.94 MS 16.74 -62.19 MT 35.94 14.38 MU -20.35 57.55 MV 3.20 73.22 MW -13.25 34.30
MX 23.63 -102.55 MY 4.21 101.98 MZ -18.67 35.53 NA -22.96 18.49 NC -20.90 165.62 NE 17.61 8.08 NF -29.04 167.95
NG 9.08 8.68 NI 12.87 -85.21 NL 52.13 5.29 NO 60.47 8.47 NP 28.39 84.12 NR -0.52 166.93 NU -19.05 -169.87
NZ -40.90 174.89 OM 21.51 55.92 PA 8.54 -80.78 PE -9.19 -75.02 PF -17.68 -149.41 PG -6.31 143.96 PH 12.88 121.77
PK 30.38 69.35 PL 51.92 19.15 PM 46.94 -56.27 PN -24.70 -127.44 PR 18.22 -66.59 PS 31.95 35.23 PT 39.40 -8.22
PW 7.51 134.58 PY -23.44 -58.44 QA 25.35 51.18 RE -21.12 55.54 RO 45.94 24.97 RS 44.02 21.01 RU 61.52 105.32
RW -1.94 29.87 SA 23.89 45.08 SB -9.65 160.16 SC -4.68 55.49 SD 12.86 30.22 SE 60.13 18.64 SG 1.35 103.82
SH -24.14 -10.03 SI 46.15 14.99 SK 48.67 19.70 SL 8.46 -11.78 SM 43.94 12.46 SN 14.50 -14.45 SO 5.15 46.20
SR 3.92 -56.03 SS 6.88 31.31 ST 0.19 6.61 SV 13.79 -88.90 SX 18.04 -63.05 SY 34.80 38.99 SZ -26.52 31.47
TC 21.69 -71.80 TD 15.45 18.73 TG 8.62 0.82 TH 15.87 100.99 TJ 38.86 71.28 TK -8.97 -171.86 TL -8.87 125.73
TM 38.97 59.56 TN 33.89 9.54 TO -21.18 -175.20 TR 38.96 35.24 TT 10.69 -61.22 TV -7.11 177.65 TW 23.70 120.96
TZ -6.37 34.89 UA 48.38 31.17 UG 1.37 32.29 UM 19.28 166.65 US 37.09 -95.71 UY -32.52 -55.77 UZ 41.38 64.59
VA 41.90 12.45 VC 12.98 -61.29 VE 6.42 -66.59 VG 18.42 -64.64 VI 18.34 -64.93 VN 14.06 108.28 VU -15.38 166.96
WF -13.77 -177.16 WS -13.76 -172.10 YE 15.55 48.52 YT -12.83 45.17 ZA -30.56 22.94 ZM -13.13 27.85 ZW -19.02 29.15
`
    .trim()
    .split(/\s+/)
    .reduce<string[][]>((rows, token, i) => {
      if (i % 3 === 0) rows.push([token]);
      else rows[rows.length - 1]!.push(token);
      return rows;
    }, [])
    .map(([code, lat, lng]) => [code, [Number(lat), Number(lng)]]),
);

/** City centres for labels recorded as "City, Country". Key is "city|CC". */
const CITIES: Record<string, [number, number]> = {
  'rotterdam|nl': [51.92, 4.48],
  'amsterdam|nl': [52.37, 4.9],
  'utrecht|nl': [52.09, 5.12],
  'the hague|nl': [52.08, 4.31],
  'eindhoven|nl': [51.44, 5.47],
  'toronto|ca': [43.65, -79.38],
  'montreal|ca': [45.5, -73.57],
  'vancouver|ca': [49.28, -123.12],
  'calgary|ca': [51.05, -114.07],
  'leeds|gb': [53.8, -1.55],
  'bristol|gb': [51.45, -2.59],
  'london|gb': [51.51, -0.13],
  'manchester|gb': [53.48, -2.24],
  'birmingham|gb': [52.49, -1.89],
  'glasgow|gb': [55.86, -4.25],
  'edinburgh|gb': [55.95, -3.19],
  'liverpool|gb': [53.41, -2.99],
  'felixstowe|gb': [51.96, 1.35],
  'singapore|sg': [1.35, 103.82],
  'frankfurt|de': [50.11, 8.68],
  'hamburg|de': [53.55, 9.99],
  'berlin|de': [52.52, 13.41],
  'munich|de': [48.14, 11.58],
  'cologne|de': [50.94, 6.96],
  'dusseldorf|de': [51.23, 6.77],
  'stuttgart|de': [48.78, 9.18],
  'leipzig|de': [51.34, 12.37],
  'hanover|de': [52.38, 9.73],
  'bremen|de': [53.08, 8.8],
  'bremerhaven|de': [53.54, 8.58],
  'nuremberg|de': [49.45, 11.08],
  'paris|fr': [48.86, 2.35],
  'lyon|fr': [45.76, 4.84],
  'marseille|fr': [43.3, 5.37],
  'le havre|fr': [49.49, 0.11],
  'brussels|be': [50.85, 4.35],
  'antwerp|be': [51.22, 4.4],
  'zurich|ch': [47.38, 8.54],
  'geneva|ch': [46.2, 6.14],
  'basel|ch': [47.56, 7.59],
  'milan|it': [45.46, 9.19],
  'rome|it': [41.9, 12.5],
  'genoa|it': [44.41, 8.93],
  'madrid|es': [40.42, -3.7],
  'barcelona|es': [41.39, 2.17],
  'valencia|es': [39.47, -0.38],
  'lisbon|pt': [38.72, -9.14],
  'porto|pt': [41.15, -8.61],
  'dublin|ie': [53.35, -6.26],
  'copenhagen|dk': [55.68, 12.57],
  'stockholm|se': [59.33, 18.07],
  'gothenburg|se': [57.71, 11.97],
  'oslo|no': [59.91, 10.75],
  'helsinki|fi': [60.17, 24.94],
  'warsaw|pl': [52.23, 21.01],
  'gdansk|pl': [54.35, 18.65],
  'prague|cz': [50.08, 14.44],
  'vienna|at': [48.21, 16.37],
  'budapest|hu': [47.5, 19.04],
  'athens|gr': [37.98, 23.73],
  'istanbul|tr': [41.01, 28.98],
  'dubai|ae': [25.2, 55.27],
  'abu dhabi|ae': [24.45, 54.38],
  'doha|qa': [25.29, 51.53],
  'riyadh|sa': [24.71, 46.68],
  'jeddah|sa': [21.49, 39.19],
  'cairo|eg': [30.04, 31.24],
  'johannesburg|za': [-26.2, 28.05],
  'cape town|za': [-33.92, 18.42],
  'nairobi|ke': [-1.29, 36.82],
  'lagos|ng': [6.52, 3.38],
  'casablanca|ma': [33.57, -7.59],
  'new york|us': [40.71, -74.01],
  'newark|us': [40.74, -74.17],
  'los angeles|us': [34.05, -118.24],
  'long beach|us': [33.77, -118.19],
  'chicago|us': [41.88, -87.63],
  'miami|us': [25.76, -80.19],
  'houston|us': [29.76, -95.37],
  'atlanta|us': [33.75, -84.39],
  'seattle|us': [47.61, -122.33],
  'boston|us': [42.36, -71.06],
  'dallas|us': [32.78, -96.8],
  'savannah|us': [32.08, -81.09],
  'shanghai|cn': [31.23, 121.47],
  'shenzhen|cn': [22.54, 114.06],
  'guangzhou|cn': [23.13, 113.26],
  'beijing|cn': [39.9, 116.41],
  'ningbo|cn': [29.87, 121.54],
  'hong kong|hk': [22.32, 114.17],
  'tokyo|jp': [35.68, 139.69],
  'osaka|jp': [34.69, 135.5],
  'seoul|kr': [37.57, 126.98],
  'busan|kr': [35.18, 129.08],
  'taipei|tw': [25.03, 121.57],
  'bangkok|th': [13.76, 100.5],
  'kuala lumpur|my': [3.14, 101.69],
  'jakarta|id': [-6.21, 106.85],
  'manila|ph': [14.6, 120.98],
  'ho chi minh city|vn': [10.82, 106.63],
  'mumbai|in': [19.08, 72.88],
  'delhi|in': [28.61, 77.21],
  'chennai|in': [13.08, 80.27],
  'sydney|au': [-33.87, 151.21],
  'melbourne|au': [-37.81, 144.96],
  'perth|au': [-31.95, 115.86],
  'auckland|nz': [-36.85, 174.76],
  'sao paulo|br': [-23.55, -46.63],
  'rio de janeiro|br': [-22.91, -43.17],
  'mexico city|mx': [19.43, -99.13],
  'panama city|pa': [8.98, -79.52],
};

const NAME_TO_CODE = new Map(COUNTRY_CODES.map((code) => [countryName(code).toLowerCase(), code]));

function norm(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Places a public location label. City matches are exact mapped cities.
 * Otherwise the point is the country centre and is labelled as such.
 */
export function locateLabel(label: string): GeoPoint | null {
  const parts = label.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const countryPart = parts.length > 1 ? parts[parts.length - 1]! : '';
  const cityPart = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0]!;
  const code = countryPart ? NAME_TO_CODE.get(countryPart.toLowerCase()) : undefined;
  if (code) {
    const city = CITIES[`${norm(cityPart)}|${code.toLowerCase()}`];
    if (city) return { lat: city[0], lng: city[1], precision: 'city' };
    const centre = COUNTRY_CENTROIDS[code];
    if (centre) return { lat: centre[0], lng: centre[1], precision: 'country' };
  }
  return null;
}
