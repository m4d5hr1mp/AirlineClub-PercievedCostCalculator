// ─────────────────────────────────────────────────────────────────────────────
// FORMULAS — pure cost computation functions
// No DOM access, no state reads. All inputs are explicit parameters.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CABIN_CLASSES,
  FLIGHT_TYPES,
  LOW_INCOME_THRESHOLD,
  MAX_LOYALTY,
  MAX_QUALITY,
  SATISFACTION_FULL_PRICE_RATIO_THRESHOLD,
  SATISFACTION_ZERO_PRICE_RATIO_THRESHOLD,
  CONNECTION_BASE_COST,
  CONNECTION_INTERLINE_SURCHARGE,
  CONNECTION_FREQUENCY_THRESHOLD,
  CONNECTION_WAIT_PENALTY_COEFFICIENT,
} from './constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// INCOME LEVEL
// Source: Computation.scala — getIncomeLevel
// Logarithmic normalisation. Returns >= 1.
// ─────────────────────────────────────────────────────────────────────────────
export function computeIncomeLevelFromIncome(income) {
  const level = Math.log(income / 500) / Math.log(1.1);
  return Math.max(1, level);
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET MULTIPLIER
// Source: DemandGenerator.scala — getFlightPreferencePoolOnAirport
// Scales budget preference weight based on origin airport income.
// ─────────────────────────────────────────────────────────────────────────────
export function computeBudgetMultiplier(income) {
  if (income < LOW_INCOME_THRESHOLD / 2) return 3;
  if (income < LOW_INCOME_THRESHOLD)     return 2;
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDARD PRICE
// Source: Pricing.scala — computeStandardPrice
// Distance brackets → flight type multiplier → cabin class multiplier → ×1.5
// ─────────────────────────────────────────────────────────────────────────────
function computeStandardPriceBrackets(distance) {
  const brackets = [
    [200,  0.250],
    [800,  0.125],
    [1000, 0.100],
  ];
  let remaining = distance;
  let price = 100;
  for (const [cap, rate] of brackets) {
    if (remaining <= 0) break;
    price     += Math.min(remaining, cap) * rate;
    remaining -= cap;
  }
  if (remaining > 0) price += remaining * 0.05;
  return price;
}

export function computeStandardPrice(distance, flightTypeKey, cabinClassKey) {
  const basePrice        = computeStandardPriceBrackets(distance);
  const flightMultiplier = FLIGHT_TYPES[flightTypeKey].priceMultiplier;
  const classMultiplier  = CABIN_CLASSES[cabinClassKey].priceMultiplier;
  return Math.floor(Math.floor(basePrice * flightMultiplier) * classMultiplier * 1.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// FLIGHT DURATION
// Source: Computation.scala — calculateDuration, internalComputeStandardFlightDuration
// Speed brackets model acceleration/cruise phases.
// ─────────────────────────────────────────────────────────────────────────────
const SPEED_BRACKETS = [
  [300, 350],
  [400, 500],
  [400, 700],
];

export function computeFlightDuration(aircraftSpeed, distance) {
  let remaining = distance;
  let durationMinutes = 0;
  for (const [distanceBucket, maxBucketSpeed] of SPEED_BRACKETS) {
    if (remaining <= 0) break;
    const effectiveSpeed = Math.min(maxBucketSpeed, aircraftSpeed);
    durationMinutes     += Math.min(remaining, distanceBucket) * 60 / effectiveSpeed;
    remaining           -= distanceBucket;
  }
  if (remaining > 0) durationMinutes += remaining * 60 / aircraftSpeed;
  return durationMinutes;
}

export function computeStandardFlightDuration(distance) {
  const standardSpeed = distance <= 1000 ? 400 : distance <= 2000 ? 600 : 800;
  return computeFlightDuration(standardSpeed, distance);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPECTED QUALITY
// Source: Airport.scala — expectedQuality, qualityExpectationFlightTypeAdjust
// cabinClassIndex: 0=Economy, 1=Business, 2=First
// ─────────────────────────────────────────────────────────────────────────────
export function computeExpectedQuality(originIncome, flightTypeKey, cabinClassIndex) {
  const incomePart       = Math.min(computeIncomeLevelFromIncome(originIncome), 50);
  const flightTypeOffset = FLIGHT_TYPES[flightTypeKey].qualityAdjustment[cabinClassIndex];
  return Math.max(0, incomePart + flightTypeOffset);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOUNGE REDUCE FACTOR
// Source: Lounge.scala — getPriceReduceFactor
// Returns a NEGATIVE delta (discount on perceived cost).
// Level 0 means no lounge present — returns 0.
// ─────────────────────────────────────────────────────────────────────────────
export function computeLoungeReduceFactor(loungeLevel, distance) {
  if (loungeLevel <= 0) return 0;
  const baseReduceRate = 0.005 + loungeLevel * 0.01;
  const distanceFactor = Math.max(0.5, Math.min(1.0, distance / 10000.0));
  return -1 * (baseReduceRate * distanceFactor);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOUNGE RATIO DELTA (origin or destination, one airport at a time)
// Source: FlightPreference.scala — loungeAdjustRatio
// Returns the ratio delta to add to 1.0.
// Positive delta = penalty (lounge below required). Negative = bonus.
// ─────────────────────────────────────────────────────────────────────────────
export function computeLoungeRatioDeltaForAirport(airlineLoungeLevelAtAirport, loungeRequirement, distance, isOrigin) {
  if (airlineLoungeLevelAtAirport < loungeRequirement) {
    // Penalty for missing required lounge level
    const deficit = loungeRequirement - airlineLoungeLevelAtAirport;
    // Origin and destination have different penalty rates (from FlightPreference.scala)
    if (isOrigin) {
      const rate = distance <= 2000 ? 0.03 : distance <= 5000 ? 0.10 : 0.15;
      return deficit * rate;
    } else {
      const rate = distance <= 2000 ? 0.05 : distance <= 5000 ? 0.10 : 0.15;
      return deficit * rate;
    }
  } else {
    // Bonus for meeting or exceeding requirement
    return computeLoungeReduceFactor(airlineLoungeLevelAtAirport, distance);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEG PERCEIVED COST
// Source: FlightPreference.scala — computeCost (the pipeline method)
//
// aggregatedArchetype: output of aggregatePoolByArchetype from pool.js
//   { archetypeId, averagePriceSensitivity, averageLoyaltyRatio, averageLoungeRequirement, ... }
// leg: { flightTypeKey, distance, priceByClass, quality, frequency, aircraftSpeed }
// originAirport: { income, loyalty, loungeLevel }
// destinationAirport: { loungeLevel }
// cabinClassKey: 'ECONOMY' | 'BUSINESS' | 'FIRST'
//
// Steps exactly follow FlightPreference.computeCost:
//   standardPrice × priceAdjust × qualityAdjust × tripDurationAdjust × loyaltyAdjust × loungeAdjust
// ─────────────────────────────────────────────────────────────────────────────
export function computeLegPerceivedCost(aggregatedArchetype, leg, originAirport, destinationAirport, cabinClassKey) {
  const cabinClass     = CABIN_CLASSES[cabinClassKey];
  const cabinClassIndex = cabinClass.level; // 0/1/2
  const archetypeId    = aggregatedArchetype.archetypeId;

  const standardPrice  = computeStandardPrice(leg.distance, leg.flightTypeKey, cabinClassKey);
  const actualPrice    = leg.priceByClass[cabinClassKey];

  // ── 1. PRICE SENSITIVITY ADJUST ─────────────────────────────────────────
  // Source: FlightPreference.scala — priceAdjustRatio
  // priceSensitivity amplifies or dampens deviation from standard price.
  const priceSensitivity = archetypeId === 'BUDGET'
    ? aggregatedArchetype.averagePriceSensitivity
    : archetypeId === 'SPEED'
    ? 0.9
    : cabinClass.priceSensitivity; // COMPREHENSIVE, BRAND_CONSCIOUS, ELITE use class sensitivity

  const priceAdjustRatio = 1 + (actualPrice - standardPrice) * priceSensitivity / standardPrice;
  let perceivedCost      = standardPrice * priceAdjustRatio;

  // ── 2. QUALITY ADJUST ───────────────────────────────────────────────────
  // Source: FlightPreference.scala — qualityAdjustRatio
  const qualitySensitivity = (archetypeId === 'BUDGET' || archetypeId === 'SPEED') ? 0.5 : 1.0;
  const expectedQuality    = computeExpectedQuality(originAirport.income, leg.flightTypeKey, cabinClassIndex);
  const qualityDelta       = leg.quality - expectedQuality;
  const GOOD_QUALITY_DELTA = 20;

  let rawQualityAdjust;
  if (qualityDelta < 0) {
    rawQualityAdjust = 1 - qualityDelta / MAX_QUALITY;            // penalty: > 1
  } else if (qualityDelta < GOOD_QUALITY_DELTA) {
    rawQualityAdjust = 1 - qualityDelta / MAX_QUALITY * 0.5;      // moderate bonus
  } else {
    const extraDelta = qualityDelta - GOOD_QUALITY_DELTA;
    rawQualityAdjust = 1 - GOOD_QUALITY_DELTA / MAX_QUALITY * 0.5 // diminishing returns above 20 delta
                         - extraDelta / MAX_QUALITY * 0.3;
  }
  const qualityAdjustRatio = 1 + (rawQualityAdjust - 1) * qualitySensitivity;
  perceivedCost *= qualityAdjustRatio;

  // ── 3. TRIP DURATION ADJUST (frequency + flight duration) ───────────────
  // Source: FlightPreference.scala — tripDurationAdjustRatio
  const frequencyThreshold =
    archetypeId === 'SPEED'  ? 14 :
    archetypeId === 'BUDGET' ? 3  : 14;

  const frequencySensitivity =
    archetypeId === 'BUDGET' ? 0.02 :
    archetypeId === 'SPEED'  ? 0.15 : 0.05;

  const durationSensitivity =
    archetypeId === 'SPEED'  ? 0.85 :
    archetypeId === 'BUDGET' ? 0.00 :
    cabinClassIndex === 2    ? 0.55 : // First
    cabinClassIndex === 1    ? 0.40 : // Business
    0.25;                             // Economy

  const frequencyRatioDelta = Math.max(-1,
    (frequencyThreshold - leg.frequency) / frequencyThreshold
  ) * frequencySensitivity;

  let durationRatioDelta = 0;
  if (durationSensitivity > 0) {
    const standardDuration = computeStandardFlightDuration(leg.distance);
    const actualDuration   = computeFlightDuration(leg.aircraftSpeed, leg.distance);
    durationRatioDelta = Math.min(
      durationSensitivity,
      (actualDuration - standardDuration) / standardDuration * durationSensitivity
    );
  }

  const tripDurationAdjustRatio = 1 + Math.max(-0.75, frequencyRatioDelta + durationRatioDelta);
  perceivedCost *= tripDurationAdjustRatio;

  // ── 4. LOYALTY ADJUST ───────────────────────────────────────────────────
  // Source: FlightPreference.scala — loyaltyAdjustRatio
  // Budget and Speed archetypes have loyaltySensitivity = 0 (not loyalty-sensitive).
  const loyaltySensitivity = (archetypeId === 'BUDGET' || archetypeId === 'SPEED')
    ? 0
    : aggregatedArchetype.averageLoyaltyRatio;

  if (loyaltySensitivity > 0) {
    const loyaltyBase = 1 + (-0.1 + originAirport.loyalty / MAX_LOYALTY / 2.25) * loyaltySensitivity;
    perceivedCost    *= 1 / loyaltyBase;
  }

  // ── 5. LOUNGE ADJUST ────────────────────────────────────────────────────
  // Source: FlightPreference.scala — loungeAdjustRatio
  // Applies only when loungeSensitivity > 0 (all AppealPreference types)
  // AND cabin class >= Business (level >= 1).
  // Budget and Speed have loungeSensitivity = 0.
  const hasLoungeSensitivity = (archetypeId !== 'BUDGET' && archetypeId !== 'SPEED');
  const isBusinessOrFirst    = cabinClass.level >= 1;

  if (hasLoungeSensitivity && isBusinessOrFirst) {
    const loungeRequirement = aggregatedArchetype.averageLoungeRequirement;
    const originLoungeDelta = computeLoungeRatioDeltaForAirport(
      originAirport.loungeLevel, loungeRequirement, leg.distance, true
    );
    const destinationLoungeDelta = computeLoungeRatioDeltaForAirport(
      destinationAirport.loungeLevel, loungeRequirement, leg.distance, false
    );
    perceivedCost *= (1 + originLoungeDelta + destinationLoungeDelta);
  }

  // ── 6. ELITE QUALITY ATTRACTION ─────────────────────────────────────────
  // Source: AppealPreference.computeCost — quality > 80 reduces cost up to 40%
  if (archetypeId === 'ELITE' && leg.quality > 80) {
    const eliteQualityDiscount = 0.4 * (leg.quality - 80) / 20.0;
    perceivedCost *= (1 - eliteQualityDiscount);
  }

  return Math.max(0, perceivedCost);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION COST
// Source: PassengerSimulation.scala — Bellman-Ford connection cost block
//
// connectionType: 'SAME_AIRLINE_OR_ALLIANCE' | 'INTERLINE'
// transitDiscountPercent: manual override (0–50) for airport asset discount
// cabinClassKey: multiplied against connection cost
// archetypeId: determines connectionCostRatio
// ─────────────────────────────────────────────────────────────────────────────
export function computeConnectionCost(leg1, leg2, connectionType, transitDiscountPercent, cabinClassKey, archetypeId) {
  const cabinClassMultiplier = CABIN_CLASSES[cabinClassKey].priceMultiplier;

  // Budget pax are more tolerant of connections, Speed pax hate them
  const connectionCostRatio =
    archetypeId === 'BUDGET' ? 0.5 :
    archetypeId === 'SPEED'  ? 2.0 : 1.0;

  let connectionCost = CONNECTION_BASE_COST;

  if (connectionType === 'INTERLINE') {
    connectionCost += CONNECTION_INTERLINE_SURCHARGE;
  }

  // Frequency mismatch penalty — applies if neither leg is frequent enough
  const higherFrequency = Math.max(leg1.frequency, leg2.frequency);
  if (higherFrequency < CONNECTION_FREQUENCY_THRESHOLD) {
    connectionCost += CONNECTION_WAIT_PENALTY_COEFFICIENT / higherFrequency;
  }

  connectionCost *= connectionCostRatio * cabinClassMultiplier;

  // Transit discount from airport assets (Airport Hotel, City Transit, etc.)
  // Currently a manual numeric input; asset-specific UI planned for later.
  const transitDiscountFraction = Math.min(0.5, transitDiscountPercent / 100);
  connectionCost *= (1 - transitDiscountFraction);

  return Math.max(0, connectionCost);
}

// ─────────────────────────────────────────────────────────────────────────────
// FULL ROUTE PERCEIVED COST
// Sums leg costs and connection costs for a complete itinerary.
//
// aggregatedArchetype: output from pool.js aggregatePoolByArchetype
// cabinClassKey: 'ECONOMY' | 'BUSINESS' | 'FIRST'
// legs: array of leg objects
// airports: array of airport objects (length = legs.length + 1)
// connections: array of connection objects (length = legs.length - 1)
// ─────────────────────────────────────────────────────────────────────────────
export function computeRoutePerceivedCost(aggregatedArchetype, cabinClassKey, legs, airports, connections) {
  let totalCost = 0;

  for (let legIndex = 0; legIndex < legs.length; legIndex++) {
    const leg               = legs[legIndex];
    const originAirport     = airports[legIndex];
    const destinationAirport = airports[legIndex + 1];

    totalCost += computeLegPerceivedCost(
      aggregatedArchetype, leg, originAirport, destinationAirport, cabinClassKey
    );

    if (legIndex < legs.length - 1) {
      const connection           = connections[legIndex];
      const connectionAirport    = airports[legIndex + 1]; // the layover airport
      totalCost += computeConnectionCost(
        leg,
        legs[legIndex + 1],
        connection.type,
        connection.transitDiscountPercent,
        cabinClassKey,
        aggregatedArchetype.archetypeId
      );
    }
  }

  return totalCost;
}

// ─────────────────────────────────────────────────────────────────────────────
// SATISFACTION
// Source: Computation.scala — computePassengerSatisfaction
// ─────────────────────────────────────────────────────────────────────────────
export function computeSatisfaction(perceivedCost, standardPrice) {
  const costRatio = perceivedCost / standardPrice;
  return Math.min(1, Math.max(0,
    (SATISFACTION_ZERO_PRICE_RATIO_THRESHOLD - costRatio) /
    (SATISFACTION_ZERO_PRICE_RATIO_THRESHOLD - SATISFACTION_FULL_PRICE_RATIO_THRESHOLD)
  ));
}
