// ─────────────────────────────────────────────────────────────────────────────
// PREFERENCE POOL
// Source: DemandGenerator.scala — getFlightPreferencePoolOnAirport
//
// Builds the weighted preference pool for a given origin airport, then
// aggregates it into per-archetype summaries for use in cost computation.
// ─────────────────────────────────────────────────────────────────────────────

import { LOUNGE_PASSENGER_AIRPORT_SIZE_REQUIREMENT } from './constants.js';
import { computeBudgetMultiplier } from './formulas.js';

// ─────────────────────────────────────────────────────────────────────────────
// RAW POOL ENTRIES
// Each entry represents one preference instance as it appears in the Scala pool.
// Fields:
//   archetypeId           — maps to ARCHETYPE_IDS in constants.js
//   weight                — integer weight in the pool draw
//   priceSensitivity      — for Budget entries only (overrides class default)
//   loyaltyRatio          — multiplier on loyalty effect (AppealPreference only)
//   loungeRequirement     — minimum lounge level required (0 = none)
//
// Note: Economy Budget entries are repeated budgetMultiplier times.
// ─────────────────────────────────────────────────────────────────────────────
export function buildPreferencePool(originAirport, destinationAirport, cabinClassKey) {
  const budgetMultiplier = computeBudgetMultiplier(originAirport.income);

  // Elite preferences use AppealPreference with loungeLevelRequired > 0.
  // isApplicable() in FlightPreference.scala gates these on airport size >= 4 (LOUNGE_PASSENGER_AIRPORT_SIZE_REQUIREMENT).
  // This is independent of loungeLevel — size is the airport's own scale, lounge is the airline's asset there.
  const elitePassengersApplicable =
    originAirport.size      >= LOUNGE_PASSENGER_AIRPORT_SIZE_REQUIREMENT &&
    destinationAirport.size >= LOUNGE_PASSENGER_AIRPORT_SIZE_REQUIREMENT;

  const pool = [];

  if (cabinClassKey === 'ECONOMY') {
    // Budget variants — weight scaled by income (low-income airports get more budget pax)
    for (let i = 0; i < budgetMultiplier; i++) {
      pool.push({ archetypeId: 'BUDGET', weight: 2, priceSensitivity: 1.2 });
      pool.push({ archetypeId: 'BUDGET', weight: 2, priceSensitivity: 1.3 });
      pool.push({ archetypeId: 'BUDGET', weight: 1, priceSensitivity: 1.4 });
      pool.push({ archetypeId: 'BUDGET', weight: 1, priceSensitivity: 1.5 });
    }
    // Speed
    pool.push({ archetypeId: 'SPEED', weight: 2 });
    // Comprehensive (Appeal, loyaltyRatio = 1.0)
    pool.push({ archetypeId: 'COMPREHENSIVE', weight: 4, loyaltyRatio: 1.0, loungeRequirement: 0 });
    pool.push({ archetypeId: 'COMPREHENSIVE', weight: 4, loyaltyRatio: 1.0, loungeRequirement: 0 });
    // Brand Conscious (Appeal, loyaltyRatio > 1.0, Economy only)
    pool.push({ archetypeId: 'BRAND_CONSCIOUS', weight: 2, loyaltyRatio: 1.1, loungeRequirement: 0 });
    pool.push({ archetypeId: 'BRAND_CONSCIOUS', weight: 1, loyaltyRatio: 1.2, loungeRequirement: 0 });
    // No Elite in Economy

  } else if (cabinClassKey === 'BUSINESS') {
    // Iterated twice for variance (as in Scala source)
    for (let i = 0; i < 2; i++) {
      pool.push({ archetypeId: 'SPEED',         weight: 3 });
      pool.push({ archetypeId: 'COMPREHENSIVE', weight: 2, loyaltyRatio: 1.0, loungeRequirement: 0 });
      pool.push({ archetypeId: 'COMPREHENSIVE', weight: 2, loyaltyRatio: 1.0, loungeRequirement: 0 });
      if (elitePassengersApplicable) {
        pool.push({ archetypeId: 'ELITE', weight: 1, loyaltyRatio: 1.1, loungeRequirement: 1 });
        pool.push({ archetypeId: 'ELITE', weight: 1, loyaltyRatio: 1.1, loungeRequirement: 2 });
        pool.push({ archetypeId: 'ELITE', weight: 1, loyaltyRatio: 1.2, loungeRequirement: 3 });
      }
    }

  } else if (cabinClassKey === 'FIRST') {
    pool.push({ archetypeId: 'SPEED',         weight: 1 });
    pool.push({ archetypeId: 'COMPREHENSIVE', weight: 2, loyaltyRatio: 1.0, loungeRequirement: 0 });
    if (elitePassengersApplicable) {
      pool.push({ archetypeId: 'ELITE', weight: 1, loyaltyRatio: 1.1, loungeRequirement: 1 });
      pool.push({ archetypeId: 'ELITE', weight: 1, loyaltyRatio: 1.1, loungeRequirement: 2 });
      pool.push({ archetypeId: 'ELITE', weight: 1, loyaltyRatio: 1.2, loungeRequirement: 3 });
    }
  }

  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATE POOL BY ARCHETYPE
// Merges all pool entries of the same archetype into one summary object.
// Numeric params (priceSensitivity, loyaltyRatio, loungeRequirement) are
// weight-averaged across entries for that archetype.
//
// Returns a Map: archetypeId → aggregated archetype object
// ─────────────────────────────────────────────────────────────────────────────
export function aggregatePoolByArchetype(pool) {
  const totalPoolWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  const buckets = {};

  for (const entry of pool) {
    if (!buckets[entry.archetypeId]) {
      buckets[entry.archetypeId] = {
        archetypeId:                  entry.archetypeId,
        totalWeight:                  0,
        poolShareFraction:            0,
        weightedPriceSensitivitySum:  0,
        weightedLoyaltyRatioSum:      0,
        weightedLoungeRequirementSum: 0,
        // Computed averages populated below
        averagePriceSensitivity:      0,
        averageLoyaltyRatio:          1.0,
        averageLoungeRequirement:     0,
      };
    }

    const bucket = buckets[entry.archetypeId];
    bucket.totalWeight                  += entry.weight;
    bucket.weightedPriceSensitivitySum  += (entry.priceSensitivity  ?? 0)   * entry.weight;
    bucket.weightedLoyaltyRatioSum      += (entry.loyaltyRatio      ?? 1.0) * entry.weight;
    bucket.weightedLoungeRequirementSum += (entry.loungeRequirement ?? 0)   * entry.weight;
  }

  for (const archetypeId in buckets) {
    const bucket = buckets[archetypeId];
    bucket.poolShareFraction        = totalPoolWeight > 0 ? bucket.totalWeight / totalPoolWeight : 0;
    bucket.averagePriceSensitivity  = bucket.weightedPriceSensitivitySum  / bucket.totalWeight;
    bucket.averageLoyaltyRatio      = bucket.weightedLoyaltyRatioSum      / bucket.totalWeight;
    bucket.averageLoungeRequirement = bucket.weightedLoungeRequirementSum / bucket.totalWeight;
  }

  return buckets;
}