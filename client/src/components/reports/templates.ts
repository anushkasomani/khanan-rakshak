import { FieldReportType, ReportTable } from '../../types';

export const REPORT_TYPES: Record<FieldReportType, string> = {
  BLAST: 'Blast report',
  SURVEY: 'Survey',
  WINDING: 'Winder / winding engine',
  ELECTRICAL: 'Electrical test',
  MAGAZINE: 'Explosives magazine',
  OTHER: 'Other',
};

/** Parameter / value table from the opencast blast report form used at the bench. */
const OPENCAST_BLAST = [
  'Date of blast',
  'Quarry',
  'Location',
  'Face',
  'Distance from nearest structure (m)',
  'Hole diameter (mm)',
  'Face condition',
  'Bench height (m)',
  'Hole depth (m)',
  'No. of holes',
  'Burden (m)',
  'Spacing (m)',
  'Avg. charge (kg)',
  'Total charge (kg)',
  'No. of rounds',
  'Avg. bottom charge length (m)',
  'Avg. decking (m)',
  'Avg. top charge length (m)',
  'Avg. stemming (m)',
  'Overburden (cu.m)',
  'Coal (t)',
  'Powder factor (cu.m/kg)',
  'Fragmentation',
  'Throw (m)',
  'Fly rock (m)',
  'Muck pile profile',
  'Vibration PPV (mm/s)',
  'Noise (dB)',
  'Distance of minimate from face (m)',
  'Location of minimate',
  'Max. charge per delay (kg)',
  'Max. charge per round (kg)',
  'Booster',
];

export const TABLE_TEMPLATES: { key: string; label: string; forTypes: FieldReportType[] | 'ALL'; make: () => ReportTable }[] = [
  {
    key: 'OPENCAST_BLAST',
    label: 'Opencast blast report',
    forTypes: ['BLAST'],
    make: () => ({ columns: ['Parameter', 'Value'], rows: OPENCAST_BLAST.map((p) => [p, '']) }),
  },
  {
    key: 'EXPLOSIVES',
    label: 'Explosives account',
    forTypes: ['BLAST', 'MAGAZINE'],
    make: () => ({
      columns: ['Item', 'Issued', 'Used', 'Returned'],
      rows: [
        ['Explosive (kg)', '', '', ''],
        ['Detonators', '', '', ''],
      ],
    }),
  },
  {
    key: 'READINGS',
    label: 'Readings',
    forTypes: ['SURVEY', 'WINDING', 'ELECTRICAL'],
    make: () => ({ columns: ['Point', 'Reading', 'Unit', 'Remarks'], rows: [['', '', '', '']] }),
  },
  {
    key: 'BLANK',
    label: 'Blank table',
    forTypes: 'ALL',
    make: () => ({ columns: ['Column 1', 'Column 2'], rows: [['', '']] }),
  },
];
