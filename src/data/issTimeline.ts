export const MIN_YEAR = 1998.885; // Nov 20, 1998
export const MAX_YEAR = 2031.5; // Mid-2031 End of Mission

export type CameraPresetId = 'orbital' | 'truss' | 'cupola' | 'deorbit';

export interface ModuleMetadata {
  id: string;
  name: string;
  designation: string;
  agency: string;
  launchDate: string;
  vehicle: string;
  massTons: number;
  dimensions: string;
  role: string;
  focusOffset: [number, number, number];
}

export interface TimelineMilestone {
  id: string;
  year: number;
  dateLabel: string;
  title: string;
  era: string;
  summary: string;
  agencyCredit: string;
  photoUrl?: string;
  photoCaption?: string;
}

export interface TelemetrySnapshot {
  year: number;
  dateFormatted: string;
  era: string;
  crewed: boolean;
  crewLabel: string;
  massTons: number;
  pressurizedVolumeM3: number;
  altitudeKm: number;
  spanMeters: number;
  agingFactor: number; // 0 (new) -> 1 (2028+ wear)
  deorbitPhase: 'nominal' | 'lowering' | 'reentry' | 'ended';
}

export const ARCHIVAL_PHOTOS = {
  zarya: '/src/assets/images/iss_zarya_orbit_1795248435686.jpg',
  sts88: '/src/assets/images/iss_sts88_mating_1795248436423.jpg',
  zvezdaExp1: '/src/assets/images/iss_zvezda_exp1_1795252550917.jpg',
  intlLabs: '/src/assets/images/iss_intl_labs_1795252551803.jpg',
  cupola: '/src/assets/images/iss_cupola_earth_1795248435787.jpg',
  completed: '/src/assets/images/iss_final_configuration_1795248435816.jpg',
} as const;

export const ISS_MODULES: Record<string, ModuleMetadata> = {
  zarya: {
    id: 'zarya',
    name: 'Zarya (Functional Cargo Block)',
    designation: 'FGB · 1st ISS Element',
    agency: 'Roscosmos / NASA (Khrunichev)',
    launchDate: 'November 20, 1998',
    vehicle: 'Proton-K · Baikonur Cosmodrome',
    massTons: 19.3,
    dimensions: '12.56 m × 4.11 m',
    role: 'Provided initial electrical power, propulsion, attitude control, and propellant storage during early assembly.',
    focusOffset: [0, 0, -5.5],
  },
  unity: {
    id: 'unity',
    name: 'Unity (Node 1)',
    designation: 'Node 1 · Connecting Hub',
    agency: 'NASA',
    launchDate: 'December 4, 1998',
    vehicle: 'Space Shuttle Endeavour (STS-88)',
    massTons: 11.6,
    dimensions: '5.47 m × 4.57 m',
    role: 'First U.S.-built component; six-port berthing hub linking the Russian Orbital Segment to the US Orbital Segment.',
    focusOffset: [0, 0, -1.5],
  },
  endeavour: {
    id: 'endeavour',
    name: 'Space Shuttle Endeavour (OV-105)',
    designation: 'STS-88 Assembly Mission',
    agency: 'NASA',
    launchDate: 'December 4–15, 1998',
    vehicle: 'Space Transportation System',
    massTons: 109.0,
    dimensions: '37.24 m × 23.79 m wingspan',
    role: 'Carried Unity (Node 1) into orbit and performed the first International Space Station orbital mating operation.',
    focusOffset: [0, 4.5, -1.5],
  },
  zvezda: {
    id: 'zvezda',
    name: 'Zvezda (Service Module)',
    designation: 'DOS-8 · Core Living Quarters',
    agency: 'Roscosmos (RSC Energia)',
    launchDate: 'July 12, 2000 (Docked July 26)',
    vehicle: 'Proton-K · Baikonur Cosmodrome',
    massTons: 19.0,
    dimensions: '13.1 m × 4.15 m',
    role: 'Structural and functional center of the Russian segment; houses life support, crew quarters, and main orbital reboost engines.',
    focusOffset: [0, 0, -9.8],
  },
  destiny: {
    id: 'destiny',
    name: 'Destiny Laboratory',
    designation: 'US Lab · Research Facility',
    agency: 'NASA',
    launchDate: 'February 7, 2001',
    vehicle: 'Space Shuttle Atlantis (STS-98)',
    massTons: 14.5,
    dimensions: '8.53 m × 4.27 m',
    role: 'Primary U.S. microgravity research laboratory with 24 International Standard Payload Racks and nadir optical window.',
    focusOffset: [0, 0, 2.2],
  },
  quest: {
    id: 'quest',
    name: 'Quest Joint Airlock',
    designation: 'Airlock · EVA Staging',
    agency: 'NASA',
    launchDate: 'July 12, 2001 (Installed July 15)',
    vehicle: 'Space Shuttle Atlantis (STS-104)',
    massTons: 6.1,
    dimensions: '5.5 m × 4.0 m',
    role: 'Primary spacewalk staging chamber supporting both U.S. Extravehicular Mobility Units and Russian Orlan spacesuits.',
    focusOffset: [2.6, 0, -1.5],
  },
  truss: {
    id: 'truss',
    name: 'Integrated Truss & Solar Arrays',
    designation: 'ITS (Z1, S0–S6, P1–P6) · 8 Solar Wings',
    agency: 'NASA / CSA (Canadarm2)',
    launchDate: '2000 – 2009 (11 Shuttle Flights)',
    vehicle: 'Space Shuttle Fleet',
    massTons: 145.0,
    dimensions: '108.5 m span × 72.8 m array tip-to-tip',
    role: 'Backbone girder supporting eight 240 kW photovoltaic solar array wings, ammonia thermal radiators, and Mobile Servicing System.',
    focusOffset: [0, 1.4, 0.5],
  },
  harmony: {
    id: 'harmony',
    name: 'Harmony (Node 2)',
    designation: 'Node 2 · Laboratory Utility Hub',
    agency: 'NASA / ASI (ESA)',
    launchDate: 'October 23, 2007 (Docked Oct 26)',
    vehicle: 'Space Shuttle Discovery (STS-120)',
    massTons: 14.3,
    dimensions: '7.2 m × 4.4 m',
    role: 'Utility hub supplying power, data, and cooling to Columbus, Kibo, and forward Commercial Crew docking adapters.',
    focusOffset: [0, 0, 5.4],
  },
  columbus: {
    id: 'columbus',
    name: 'Columbus Laboratory',
    designation: 'ESA Orbital Research Module',
    agency: 'ESA (European Space Agency)',
    launchDate: 'February 7, 2008 (Attached Feb 11)',
    vehicle: 'Space Shuttle Atlantis (STS-122)',
    massTons: 12.8,
    dimensions: '6.87 m × 4.48 m',
    role: 'Europe’s flagship orbital laboratory for fluid physics, human physiology, materials science, and external astrophysics payloads.',
    focusOffset: [3.2, 0, 5.4],
  },
  kibo: {
    id: 'kibo',
    name: 'Kibo (Japanese Experiment Module)',
    designation: 'JEM · PM, ELM-PS & Exposed Facility',
    agency: 'JAXA (Japan Aerospace Exploration Agency)',
    launchDate: 'March 11 – May 31, 2008',
    vehicle: 'Space Shuttle Endeavour & Discovery (STS-123/124)',
    massTons: 26.8,
    dimensions: '11.2 m × 4.4 m (Pressurized Module)',
    role: 'ISS’s largest single laboratory module, featuring a pressurized lab, scientific airlock, robotic arm, and open-space Exposed Facility.',
    focusOffset: [-3.6, 0, 5.4],
  },
  tranquility: {
    id: 'tranquility',
    name: 'Tranquility (Node 3) & Cupola',
    designation: 'Node 3 · Life Support & Observatory',
    agency: 'NASA / ESA / ASI',
    launchDate: 'February 8, 2010 (Installed Feb 15)',
    vehicle: 'Space Shuttle Endeavour (STS-130)',
    massTons: 17.3,
    dimensions: '6.7 m × 4.48 m (Cupola 2.95 m dia)',
    role: 'Houses environmental control & water recovery systems alongside the seven-window panoramic Cupola Earth observatory.',
    focusOffset: [-2.8, -0.5, -1.5],
  },
  usdv: {
    id: 'usdv',
    name: 'US Deorbit Vehicle (USDV)',
    designation: 'SpaceX Dragon-Derived Deorbit Tug',
    agency: 'NASA / SpaceX',
    launchDate: '2029 – 2030 Rendezvous',
    vehicle: 'Falcon Heavy / Commercial Launch',
    massTons: 30.0,
    dimensions: '14.0 m × 4.0 m (with Propulsion Trunk)',
    role: 'High-propellant-capacity spacecraft engineered to safely guide the ISS out of orbit into the South Pacific Oceanic Uninhabited Area.',
    focusOffset: [0, 0, 8.6],
  },
};

export const TIMELINE_MILESTONES: TimelineMilestone[] = [
  {
    id: 'zarya',
    year: 1998.885,
    dateLabel: 'Nov 20, 1998',
    title: 'Zarya Launches — First Module in Orbit',
    era: 'Initial Assembly',
    summary:
      'Russia launches the Zarya Functional Cargo Block (FGB) aboard a Proton-K rocket, unfurling twin solar arrays to establish the station’s first orbital power and propulsion.',
    agencyCredit: 'NASA / Roscosmos',
    photoUrl: ARCHIVAL_PHOTOS.zarya,
    photoCaption: 'Zarya solo in low Earth orbit, November 1998.',
  },
  {
    id: 'unity',
    year: 1998.94,
    dateLabel: 'Dec 6, 1998',
    title: 'Unity Mating — STS-88 Endeavour',
    era: 'Initial Assembly',
    summary:
      'Space Shuttle Endeavour captures Zarya and mates it with the U.S.-built Unity (Node 1) connecting hub, forming the first international orbital junction.',
    agencyCredit: 'NASA · STS-88',
    photoUrl: ARCHIVAL_PHOTOS.sts88,
    photoCaption: 'Endeavour robotic arm mating Unity to Zarya, Dec 1998.',
  },
  {
    id: 'zvezda',
    year: 2000.57,
    dateLabel: 'Jul 26, 2000',
    title: 'Zvezda Docks — Habitation Core Ready',
    era: 'Initial Assembly',
    summary:
      'The Russian Zvezda Service Module docks autonomously to Zarya’s aft port, adding crew quarters, life support, and main reboost engines.',
    agencyCredit: 'Roscosmos',
  },
  {
    id: 'exp1',
    year: 2000.84,
    dateLabel: 'Nov 2, 2000',
    title: 'Expedition 1 Arrives — Permanently Crewed',
    era: 'Continuous Human Presence',
    summary:
      'Bill Shepherd, Yuri Gidzenko, and Sergei Krikalev dock aboard Soyuz TM-31, inaugurating over two decades of uninterrupted human presence in space.',
    agencyCredit: 'NASA / Roscosmos',
    photoUrl: ARCHIVAL_PHOTOS.zvezdaExp1,
    photoCaption: 'Soyuz spacecraft docked to Zvezda Service Module, Nov 2000.',
  },
  {
    id: 'destiny',
    year: 2001.11,
    dateLabel: 'Feb 10, 2001',
    title: 'Destiny Laboratory & Quest Airlock',
    era: 'Assembly Phase',
    summary:
      'Destiny (Feb 2001) establishes the primary U.S. science laboratory, followed by Quest Joint Airlock (Jul 2001) enabling independent station spacewalks.',
    agencyCredit: 'NASA',
  },
  {
    id: 'truss',
    year: 2006.7,
    dateLabel: '2002 – 2007',
    title: 'Integrated Truss & Solar Wings Expand',
    era: 'Assembly Phase',
    summary:
      'The 108.5-meter Integrated Truss Structure extends port and starboard alongside ammonia radiators and massive double-sided copper-gold solar arrays.',
    agencyCredit: 'NASA / CSA',
  },
  {
    id: 'intl_labs',
    year: 2008.25,
    dateLabel: '2007 – 2008',
    title: 'Harmony, Columbus & Kibo Join the Station',
    era: 'Assembly Phase',
    summary:
      'Harmony (Oct 2007) opens berthing ports for Europe’s Columbus Laboratory (Feb 2008) and Japan’s Kibo JEM complex (Mar–May 2008).',
    agencyCredit: 'NASA / ESA / JAXA',
    photoUrl: ARCHIVAL_PHOTOS.intlLabs,
    photoCaption: 'Columbus (ESA) and Kibo (JAXA) docked to Harmony Node 2.',
  },
  {
    id: 'cupola',
    year: 2010.13,
    dateLabel: 'Feb 15, 2010',
    title: 'Tranquility & Cupola Installed',
    era: 'Assembly Complete',
    summary:
      'Space Shuttle Endeavour (STS-130) delivers Node 3 Tranquility and the seven-window Cupola dome, giving astronauts an unprecedented panoramic view of Earth.',
    agencyCredit: 'NASA / ESA / ASI',
    photoUrl: ARCHIVAL_PHOTOS.cupola,
    photoCaption: 'Earth’s atmospheric limb seen through the Cupola windows.',
  },
  {
    id: 'operational',
    year: 2014.5,
    dateLabel: '2011 – 2020',
    title: 'Full Operational Configuration',
    era: 'Operational Era',
    summary:
      'Spanning 108.5 m × 72.8 m at ~420–450 metric tons and ~935–1,200 m³ pressurized volume, the ISS hosts thousands of microgravity experiments at ~408 km altitude.',
    agencyCredit: 'NASA / ESA / JAXA / CSA / Roscosmos',
    photoUrl: ARCHIVAL_PHOTOS.completed,
    photoCaption: 'Completed ISS assembly configuration in low Earth orbit.',
  },
  {
    id: 'extension',
    year: 2024.0,
    dateLabel: '2021 – 2027',
    title: 'Mission Extensions & Structural Aging',
    era: 'Extension & Aging',
    summary:
      'Partner agencies extend operations through 2030 (with Russia committed through 2028) while engineers monitor thermal cycling fatigue and hull micro-cracks on aging modules.',
    agencyCredit: 'NASA / ESA / JAXA / CSA / Roscosmos',
  },
  {
    id: 'deorbit_prep',
    year: 2029.2,
    dateLabel: '2028 – 2030',
    title: 'Orbit Lowering & US Deorbit Vehicle Docks',
    era: 'Deorbit Preparation',
    summary:
      'Natural orbital decay and Russian orbit adjustments begin in 2028, followed by rendezvous and docking of the SpaceX US Deorbit Vehicle (USDV) to guide final descent.',
    agencyCredit: 'NASA / SpaceX / Roscosmos',
  },
  {
    id: 'deorbit_burn',
    year: 2031.12,
    dateLabel: 'Jan – May 2031',
    title: 'Final Deorbit Burn & Atmospheric Re-entry',
    era: 'Controlled Deorbit',
    summary:
      'The USDV executes the final retrograde burn. The ISS tumbles into Earth’s upper atmosphere above the South Pacific Ocean near Point Nemo.',
    agencyCredit: 'NASA / SpaceX',
  },
  {
    id: 'end_of_mission',
    year: 2031.48,
    dateLabel: 'Mid-2031',
    title: 'End of Mission: 2031',
    era: 'Post-Mission',
    summary:
      'Following atmospheric breakup over the uninhabited South Pacific, the orbital track falls quiet after more than three decades of international cooperation in low Earth orbit.',
    agencyCredit: 'NASA / ESA / JAXA / CSA / Roscosmos',
  },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatYearToDate(decimalYear: number): string {
  const clamped = Math.max(MIN_YEAR, Math.min(MAX_YEAR, decimalYear));
  const yearInt = Math.floor(clamped);
  const frac = clamped - yearInt;
  const dayOfYear = Math.floor(frac * 365.25);
  const d = new Date(Date.UTC(yearInt, 0, 1 + dayOfYear));
  const month = MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  return `${month} ${String(day).padStart(2, '0')}, ${d.getUTCFullYear()}`;
}

export function getActiveMilestone(year: number): TimelineMilestone {
  let current = TIMELINE_MILESTONES[0];
  for (const m of TIMELINE_MILESTONES) {
    if (year >= m.year - 0.01) {
      current = m;
    } else {
      break;
    }
  }
  return current;
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function getTelemetryAtYear(year: number): TelemetrySnapshot {
  const crewed = year >= 2000.838 && year < 2030.7;
  let crewLabel = 'Uncrewed (Automated)';
  if (year >= 2000.838 && year < 2030.2) {
    crewLabel = 'Permanently Crewed';
  } else if (year >= 2030.2 && year < 2030.7) {
    crewLabel = 'Final Crew Departure';
  } else if (year >= 2030.7 && year < 2031.25) {
    crewLabel = 'Uncrewed (Deorbit Prep)';
  } else if (year >= 2031.25) {
    crewLabel = 'Mission Terminated';
  }

  // Mass progression (tons)
  let mass = 19.3;
  if (year >= 1998.93) mass += 11.6; // Unity
  if (year >= 2000.568) mass += 19.0; // Zvezda
  if (year >= 2000.9) mass += 15.0; // Z1/P6
  if (year >= 2001.104) mass += 14.5; // Destiny
  if (year >= 2001.537) mass += 6.1; // Quest
  if (year >= 2002.2) {
    mass += 130.0 * smoothStep(2002.2, 2007.8, year); // Truss & solar expansion
  }
  if (year >= 2007.819) mass += 14.3; // Harmony
  if (year >= 2008.112) mass += 12.8; // Columbus
  if (year >= 2008.194) mass += 26.8; // Kibo
  if (year >= 2010.126) mass += 17.3; // Tranquility & Cupola
  if (year >= 2011.2) {
    mass += 133.3 * smoothStep(2011.2, 2021.8, year); // PMM, Nauka, Prichal, visiting vehicles, truss upgrades
  }
  if (year >= 2029.6 && year < 2031.32) {
    mass += 30.0 * smoothStep(2029.6, 2029.8, year); // USDV docked
  }
  if (year >= 2031.28) {
    mass = Math.max(0, mass * (1 - smoothStep(2031.28, 2031.42, year)));
  }

  // Pressurized volume progression (m³)
  let volume = 115;
  if (year >= 1998.93) volume += 90;
  if (year >= 2000.568) volume += 89;
  if (year >= 2001.104) volume += 106;
  if (year >= 2001.537) volume += 34;
  if (year >= 2007.819) volume += 75;
  if (year >= 2008.112) volume += 75;
  if (year >= 2008.194) volume += 155;
  if (year >= 2010.126) volume += 75;
  if (year >= 2011.2) {
    volume += 186 * smoothStep(2011.2, 2021.8, year); // ~1000-1200 m³ operational envelope
  }
  if (year >= 2031.3) {
    volume = Math.max(0, volume * (1 - smoothStep(2031.3, 2031.42, year)));
  }

  // Orbital Altitude (km)
  let altitude = 390;
  if (year >= 2000 && year < 2011) {
    altitude = 365 + 25 * smoothStep(2000, 2011, year);
  } else if (year >= 2011 && year < 2028) {
    altitude = 408 + Math.sin(year * 1.4) * 5;
  } else if (year >= 2028 && year < 2031.1) {
    altitude = 408 - 115 * smoothStep(2028.0, 2031.1, year);
  } else if (year >= 2031.1) {
    altitude = Math.max(0, 293 * (1 - smoothStep(2031.1, 2031.42, year)));
  }

  // Truss span (meters)
  let span = 24.4;
  if (year >= 2000.9) {
    span = 24.4 + (108.5 - 24.4) * smoothStep(2000.9, 2009.2, year);
  }

  const agingFactor = smoothStep(2021.0, 2028.5, year);

  let deorbitPhase: TelemetrySnapshot['deorbitPhase'] = 'nominal';
  if (year >= 2028.0 && year < 2031.1) deorbitPhase = 'lowering';
  else if (year >= 2031.1 && year < 2031.42) deorbitPhase = 'reentry';
  else if (year >= 2031.42) deorbitPhase = 'ended';

  const milestone = getActiveMilestone(year);

  return {
    year,
    dateFormatted: formatYearToDate(year),
    era: milestone.era,
    crewed,
    crewLabel,
    massTons: Math.round(mass * 10) / 10,
    pressurizedVolumeM3: Math.round(volume),
    altitudeKm: Math.round(altitude),
    spanMeters: Math.round(span * 10) / 10,
    agingFactor,
    deorbitPhase,
  };
}
