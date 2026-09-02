import type { CarClass, Difficulty } from '../core/types';

/** A race event in World Circuits, GT7-style. */
export interface RaceEvent {
  id: string;
  series: string;
  name: string;
  description: string;
  trackId: string;
  laps: number;
  opponents: number;
  /** cars the player may enter */
  allowedClasses: CarClass[];
  /** maximum Performance Points allowed (null = unrestricted) */
  ppLimit: number | null;
  /** class the AI cars are drawn from */
  opponentClass: CarClass;
  /** payout for 1st, 2nd, 3rd; lower positions get 25% of 3rd */
  payoutCr: [number, number, number];
  difficulty: Difficulty;
  timeOfDay: 'morning' | 'noon' | 'evening' | 'night';
  /** credits required to unlock? no: events unlock by completing previous ones in the series */
  requires?: string;
}

export const EVENTS: RaceEvent[] = [
  {
    id: 'sunday_tsukuba',
    series: 'Sunday Cup',
    name: 'Sunday Cup: Tsukuba',
    description:
      'The classic starting point. Three laps of the tight Tsukuba Circuit in road cars.',
    trackId: 'tsukuba',
    laps: 3,
    opponents: 7,
    allowedClasses: ['N100', 'N200', 'N300'],
    ppLimit: 450,
    opponentClass: 'N100',
    payoutCr: [5000, 3000, 2000],
    difficulty: 'easy',
    timeOfDay: 'noon',
  },
  {
    id: 'sunday_brands',
    series: 'Sunday Cup',
    name: 'Sunday Cup: Brands Hatch',
    description: 'Paddock Hill Bend rewards bravery. Keep it clean over three laps.',
    trackId: 'brands_hatch',
    laps: 3,
    opponents: 7,
    allowedClasses: ['N100', 'N200', 'N300'],
    ppLimit: 450,
    opponentClass: 'N100',
    payoutCr: [6000, 3500, 2200],
    difficulty: 'easy',
    timeOfDay: 'evening',
    requires: 'sunday_tsukuba',
  },
  {
    id: 'clubman_laguna',
    series: 'Clubman Cup',
    name: 'Clubman Cup: Laguna Seca',
    description: 'Drop into the Corkscrew blind. Sports cars, four laps.',
    trackId: 'laguna_seca',
    laps: 4,
    opponents: 9,
    allowedClasses: ['N200', 'N300', 'N500'],
    ppLimit: 560,
    opponentClass: 'N300',
    payoutCr: [12000, 7000, 4500],
    difficulty: 'normal',
    timeOfDay: 'noon',
    requires: 'sunday_brands',
  },
  {
    id: 'clubman_suzuka',
    series: 'Clubman Cup',
    name: 'Clubman Cup: Suzuka',
    description:
      "The S Curves, Spoon and 130R. Four laps of the greatest driver's circuit in the world.",
    trackId: 'suzuka',
    laps: 4,
    opponents: 9,
    allowedClasses: ['N200', 'N300', 'N500'],
    ppLimit: 560,
    opponentClass: 'N300',
    payoutCr: [15000, 8500, 5500],
    difficulty: 'normal',
    timeOfDay: 'morning',
    requires: 'clubman_laguna',
  },
  {
    id: 'supercar_monza',
    series: 'Supercar Festival',
    name: 'Supercar Festival: Monza',
    description:
      'The Temple of Speed. Flat out down the straights, brave on the brakes into the chicanes.',
    trackId: 'monza',
    laps: 4,
    opponents: 11,
    allowedClasses: ['N500'],
    ppLimit: 760,
    opponentClass: 'N500',
    payoutCr: [35000, 20000, 12000],
    difficulty: 'normal',
    timeOfDay: 'noon',
    requires: 'clubman_suzuka',
  },
  {
    id: 'supercar_spa',
    series: 'Supercar Festival',
    name: 'Supercar Festival: Spa-Francorchamps',
    description:
      'Eau Rouge, Raidillon and the long climb to Les Combes. Five laps through the Ardennes.',
    trackId: 'spa',
    laps: 5,
    opponents: 11,
    allowedClasses: ['N500'],
    ppLimit: 760,
    opponentClass: 'N500',
    payoutCr: [45000, 26000, 15000],
    difficulty: 'hard',
    timeOfDay: 'evening',
    requires: 'supercar_monza',
  },
  {
    id: 'gt3_nurburgring',
    series: 'GT World Series',
    name: 'GT World Series: Nürburgring GP',
    description: 'Gr.3 racing cars only. Six laps on the Grand Prix circuit.',
    trackId: 'nurburgring_gp',
    laps: 6,
    opponents: 13,
    allowedClasses: ['Gr.3', 'Gr.4'],
    ppLimit: 720,
    opponentClass: 'Gr.3',
    payoutCr: [80000, 48000, 30000],
    difficulty: 'hard',
    timeOfDay: 'morning',
    requires: 'supercar_spa',
  },
  {
    id: 'gt3_bathurst',
    series: 'GT World Series',
    name: 'GT World Series: Mount Panorama',
    description:
      'Across the top of the mountain with walls on both sides. The hardest six laps you will drive.',
    trackId: 'bathurst',
    laps: 6,
    opponents: 13,
    allowedClasses: ['Gr.3', 'Gr.4'],
    ppLimit: 720,
    opponentClass: 'Gr.3',
    payoutCr: [100000, 60000, 38000],
    difficulty: 'expert',
    timeOfDay: 'evening',
    requires: 'gt3_nurburgring',
  },
  {
    id: 'lmp_spa',
    series: 'Endurance Prototype Cup',
    name: 'Prototype Cup: Spa-Francorchamps',
    description: 'Le Mans prototypes at full noise. Eight laps into the night.',
    trackId: 'spa',
    laps: 8,
    opponents: 11,
    allowedClasses: ['Gr.1'],
    ppLimit: null,
    opponentClass: 'Gr.1',
    payoutCr: [250000, 150000, 90000],
    difficulty: 'expert',
    timeOfDay: 'night',
    requires: 'gt3_bathurst',
  },
];

export const eventById = (id: string): RaceEvent | undefined => EVENTS.find((e) => e.id === id);
