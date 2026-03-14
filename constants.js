// ─────────────────────────────────────────────────────────────────────────────
// GAME CONSTANTS
// Source references noted where values originate from specific Scala files.
// ─────────────────────────────────────────────────────────────────────────────

// Lounge.scala — Lounge object
export const LOUNGE_PASSENGER_AIRPORT_SIZE_REQUIREMENT = 4;
export const LOUNGE_MAX_LEVEL = 3;

// Country.scala (referenced in DemandGenerator.scala for budget multiplier)
export const LOW_INCOME_THRESHOLD  = 35_000;
export const HIGH_INCOME_THRESHOLD = 80_000;

// AirlineAppeal
export const MAX_LOYALTY = 100;

// Link.scala (implied by qualityAdjustRatio formula)
export const MAX_QUALITY = 100;

// AirportAsset.scala
export const AIRPORT_HOTEL_MAX_LEVEL = 10;

// ─────────────────────────────────────────────────────────────────────────────
// SATISFACTION / REJECTION THRESHOLDS
// Source: Computation.scala and PassengerSimulation.scala
// ─────────────────────────────────────────────────────────────────────────────

// Computation.scala — computePassengerSatisfaction
// At or below this ratio (perceivedCost / standardPrice), satisfaction = 100%
export const SATISFACTION_FULL_PRICE_RATIO_THRESHOLD = 0.70;

// At or above this ratio, satisfaction = 0%
// Derived: MIN_SATISFACTION_PRICE_RATIO_THRESHOLD = LINK_COST_TOLERANCE_FACTOR + 0.05 = 0.9 + 0.05
export const SATISFACTION_ZERO_PRICE_RATIO_THRESHOLD = 0.95;

// PassengerSimulation.scala
export const ROUTE_COST_TOLERANCE_FACTOR       = 1.50; // total route hard reject
export const LINK_COST_TOLERANCE_FACTOR        = 0.90; // per-leg retry threshold
export const ROUTE_DISTANCE_TOLERANCE_FACTOR   = 2.50; // max detour factor

// ─────────────────────────────────────────────────────────────────────────────
// CABIN CLASSES
// Source: LinkClass.scala (price multipliers) and AppealPreference (price sensitivity)
// level matches LinkClass.level: Economy=0, Business=1, First=2
// ─────────────────────────────────────────────────────────────────────────────
export const CABIN_CLASSES = {
  ECONOMY: {
    key:              'ECONOMY',
    level:            0,
    priceMultiplier:  1.0,
    priceSensitivity: 1.0,
    label:            'Economy',
  },
  BUSINESS: {
    key:              'BUSINESS',
    level:            1,
    priceMultiplier:  3.0,
    priceSensitivity: 0.8,
    label:            'Business',
  },
  FIRST: {
    key:              'FIRST',
    level:            2,
    priceMultiplier:  9.0,
    priceSensitivity: 0.6,
    label:            'First',
  },
};

export const CABIN_CLASS_KEYS = ['ECONOMY', 'BUSINESS', 'FIRST'];

// ─────────────────────────────────────────────────────────────────────────────
// FLIGHT TYPES
// Source: FlightType.scala (enum), Pricing.scala (multipliers),
//         Airport.scala — qualityExpectationFlightTypeAdjust
// qualityAdjustment: [Economy, Business, First] index matches cabin class level
// ─────────────────────────────────────────────────────────────────────────────
export const FLIGHT_TYPES = {
  SHORT_HAUL_DOMESTIC: {
    priceMultiplier:   1.00,
    qualityAdjustment: [-15, -5, 5],
    label:             'Short-haul Domestic',
  },
  MEDIUM_HAUL_DOMESTIC: {
    priceMultiplier:   1.00,
    qualityAdjustment: [-5, 5, 15],
    label:             'Medium-haul Domestic',
  },
  LONG_HAUL_DOMESTIC: {
    priceMultiplier:   1.00,
    qualityAdjustment: [0, 5, 15],
    label:             'Long-haul Domestic',
  },
  SHORT_HAUL_INTERNATIONAL: {
    priceMultiplier:   1.05,
    qualityAdjustment: [-10, 0, 10],
    label:             'Short-haul International',
  },
  MEDIUM_HAUL_INTERNATIONAL: {
    priceMultiplier:   1.05,
    qualityAdjustment: [0, 5, 15],
    label:             'Medium-haul International',
  },
  LONG_HAUL_INTERNATIONAL: {
    priceMultiplier:   1.05,
    qualityAdjustment: [5, 10, 20],
    label:             'Long-haul International',
  },
  SHORT_HAUL_INTERCONTINENTAL: {
    priceMultiplier:   1.10,
    qualityAdjustment: [-5, 5, 15],
    label:             'Short-haul Intercontinental',
  },
  MEDIUM_HAUL_INTERCONTINENTAL: {
    priceMultiplier:   1.10,
    qualityAdjustment: [0, 5, 15],
    label:             'Medium-haul Intercontinental',
  },
  LONG_HAUL_INTERCONTINENTAL: {
    priceMultiplier:   1.10,
    qualityAdjustment: [10, 15, 20],
    label:             'Long-haul Intercontinental',
  },
  ULTRA_LONG_HAUL_INTERCONTINENTAL: {
    priceMultiplier:   1.10,
    qualityAdjustment: [10, 15, 20],
    label:             'Ultra Long-haul Intercontinental',
  },
};

export const FLIGHT_TYPE_KEYS = Object.keys(FLIGHT_TYPES);

// ─────────────────────────────────────────────────────────────────────────────
// PREFERENCE ARCHETYPES
// Source: FlightPreferenceType.scala, FlightPreference.scala
// IDs match FlightPreferenceType enum values where possible.
// ─────────────────────────────────────────────────────────────────────────────
export const ARCHETYPE_IDS = ['BUDGET', 'SPEED', 'COMPREHENSIVE', 'BRAND_CONSCIOUS', 'ELITE'];

export const ARCHETYPE_COLORS = {
  BUDGET:          '#ef4444',
  SPEED:           '#3b82f6',
  COMPREHENSIVE:   '#14b8a6',
  BRAND_CONSCIOUS: '#a855f7',
  ELITE:           '#d97706',
};

export const ARCHETYPE_LABELS = {
  BUDGET:          'Budget',
  SPEED:           'Speed',
  COMPREHENSIVE:   'Comprehensive',
  BRAND_CONSCIOUS: 'Brand Conscious',
  ELITE:           'Elite',
};

export const ARCHETYPE_DESCRIPTIONS = {
  BUDGET:          'High price sensitivity (ps 1.2–1.5), Economy only',
  SPEED:           'Frequency & duration focused, all classes',
  COMPREHENSIVE:   'Quality + loyalty balanced, all classes',
  BRAND_CONSCIOUS: 'Elevated loyalty ratio, Economy only',
  ELITE:           'Lounge-required, Business & First only',
};

// Which cabin classes each archetype applies to
export const ARCHETYPE_APPLICABLE_CLASSES = {
  BUDGET:          ['ECONOMY'],
  SPEED:           ['ECONOMY', 'BUSINESS', 'FIRST'],
  COMPREHENSIVE:   ['ECONOMY', 'BUSINESS', 'FIRST'],
  BRAND_CONSCIOUS: ['ECONOMY'],
  ELITE:           ['BUSINESS', 'FIRST'],
};

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION COST BASE VALUES
// Source: PassengerSimulation.scala — Bellman-Ford connection cost block
// ─────────────────────────────────────────────────────────────────────────────
export const CONNECTION_BASE_COST         = 25;  // same airline or alliance
export const CONNECTION_INTERLINE_SURCHARGE = 75; // added on top of base for carrier change
export const CONNECTION_FREQUENCY_THRESHOLD = 42; // below this weekly freq, wait penalty applies
// Frequency penalty formula: (3.5 * 24 * 5) / frequency — each extra hour wait = ~$5
export const CONNECTION_WAIT_PENALTY_COEFFICIENT = 3.5 * 24 * 5; // = 420
