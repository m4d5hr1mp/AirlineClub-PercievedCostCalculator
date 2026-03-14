// ─────────────────────────────────────────────────────────────────────────────
// STATE
// Central application state and factory functions.
// Mutations are pure — they update state but do NOT trigger re-renders.
// Calling renderAll() after mutations is the responsibility of app.js.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

// size: airport scale 1–10, used to gate Elite preference applicability.
// Source: FlightPreference.scala — AppealPreference.isApplicable checks
//   fromAirport.size >= LOUNGE_PASSENGER_AIRPORT_SIZE_REQUIREMENT (= 4)
// Separate from loungeLevel: a lounge can exist at a small airport but Elite pax won't spawn there.
// assets: list of { assetTypeKey, level, enabled } for PassengerCostAssetModifier assets.
export function createAirport({ label = 'Airport', income = 50000, size = 5, loyalty = 50, loungeLevel = 0, brandingSpecialization = 'NONE', assets = [] } = {}) {
  return { label, income, size, loyalty, loungeLevel, brandingSpecialization, assets: [...assets] };
}

// priceByClass maps cabin class keys to player-set prices.
export function createLeg({
  flightTypeKey = 'SHORT_HAUL_INTERNATIONAL',
  distance      = 1200,
  priceByClass  = { ECONOMY: 120, BUSINESS: 360, FIRST: 1080 },
  quality       = 65,
  frequency     = 7,
  aircraftSpeed = 800,
} = {}) {
  return { flightTypeKey, distance, priceByClass: { ...priceByClass }, quality, frequency, aircraftSpeed };
}

// airportHotelLevel: Airport Hotel level at the layover airport (0 = none).
// Discount is always computed from the level formula — never a manual input.
export function createConnection({
  type              = 'SAME_AIRLINE_OR_ALLIANCE',
  airportHotelLevel = 0,
} = {}) {
  return { type, airportHotelLevel };
}

export function createAirportAsset({ assetTypeKey, level = 1, enabled = true } = {}) {
  return { assetTypeKey, level, enabled };
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL STATE
// One leg, two airports, no connections.
// ─────────────────────────────────────────────────────────────────────────────
export const state = {
  // airports[i] is the origin of legs[i] and destination of legs[i-1]
  airports: [
    createAirport({ label: 'Origin', income: 50000, size: 5, loyalty: 50, loungeLevel: 0 }),
    createAirport({ label: 'Dest',   income: 50000, size: 5, loyalty: 50, loungeLevel: 0 }),
  ],

  // One entry per flight segment
  legs: [
    createLeg({
      flightTypeKey: 'SHORT_HAUL_INTERNATIONAL',
      distance:      1200,
      priceByClass:  { ECONOMY: 120, BUSINESS: 360, FIRST: 1080 },
      quality:       65,
      frequency:     7,
      aircraftSpeed: 800,
    }),
  ],

  // connections[i] is between legs[i] and legs[i+1], at airports[i+1]
  connections: [],

  // O-D distance override
  odDistanceAuto:     true,   // when true, sum of leg distances is used
  odDistanceOverride: 0,      // used when odDistanceAuto is false

  // Which cabin class each pie chart is currently showing
  pieClassByTarget: { origin: 'ECONOMY', destination: 'ECONOMY' },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
export function getOdDistance() {
  if (state.odDistanceAuto) {
    return state.legs.reduce((sum, leg) => sum + leg.distance, 0);
  }
  return state.odDistanceOverride || state.legs.reduce((sum, leg) => sum + leg.distance, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS
// Each function mutates state in place. Return nothing.
// ─────────────────────────────────────────────────────────────────────────────

export function mutateLeg(legIndex, fieldName, value) {
  if (fieldName === 'priceByClass') {
    // value expected as { cabinClassKey, price }
    state.legs[legIndex].priceByClass[value.cabinClassKey] = value.price;
  } else {
    state.legs[legIndex][fieldName] = value;
  }
}

export function mutateAirport(airportIndex, fieldName, value) {
  state.airports[airportIndex][fieldName] = value;
}

export function mutateConnection(connectionIndex, fieldName, value) {
  state.connections[connectionIndex][fieldName] = value;
}

export function addLeg() {
  const lastAirport = state.airports[state.airports.length - 1];
  const lastLeg     = state.legs[state.legs.length - 1];

  state.airports.push(createAirport({
    label:                  'Dest',
    income:                 lastAirport.income,
    size:                   lastAirport.size,
    loyalty:                lastAirport.loyalty,
    loungeLevel:            lastAirport.loungeLevel,
    brandingSpecialization: lastAirport.brandingSpecialization,
    assets:                 [],
  }));

  state.legs.push(createLeg({
    flightTypeKey: lastLeg.flightTypeKey,
    distance:      lastLeg.distance,
    priceByClass:  { ...lastLeg.priceByClass },
    quality:       lastLeg.quality,
    frequency:     lastLeg.frequency,
    aircraftSpeed: lastLeg.aircraftSpeed,
  }));

  state.connections.push(createConnection());
}

export function removeLeg() {
  if (state.legs.length <= 1) return;
  state.legs.pop();
  state.airports.pop();
  state.connections.pop();
}

export function setOdDistanceAuto(isAuto) {
  state.odDistanceAuto = isAuto;
  if (!isAuto) {
    state.odDistanceOverride = state.legs.reduce((sum, leg) => sum + leg.distance, 0);
  }
}

export function setOdDistanceOverride(distance) {
  state.odDistanceOverride = distance;
}

export function setPieClass(target, cabinClassKey) {
  state.pieClassByTarget[target] = cabinClassKey;
}

export function addAssetToAirport(airportIndex, assetTypeKey) {
  state.airports[airportIndex].assets.push(createAirportAsset({ assetTypeKey, level: 1, enabled: true }));
}

export function removeAssetFromAirport(airportIndex, assetIndex) {
  state.airports[airportIndex].assets.splice(assetIndex, 1);
}

export function mutateAsset(airportIndex, assetIndex, fieldName, value) {
  state.airports[airportIndex].assets[assetIndex][fieldName] = value;
}
