// ─────────────────────────────────────────────────────────────────────────────
// COMPARISON
// Orchestrates path enumeration, matrix computation, reference selection,
// and delta calculation for the Trip Comparison page.
// ─────────────────────────────────────────────────────────────────────────────

import { enumerateAllPaths, computePathCostMatrix } from './pathfinder.js';
import {
  CABIN_CLASS_KEYS,
  ARCHETYPE_IDS,
  ARCHETYPE_APPLICABLE_CLASSES,
} from './constants.js';
import { getAirlineName } from './network.js';

// ─────────────────────────────────────────────────────────────────────────────
// COMPUTE ALL PATH RESULTS
// For every valid path in the network from fromIata to toIata, compute
// the full Class × Archetype perceived cost matrix plus path metadata.
// ─────────────────────────────────────────────────────────────────────────────
export function computeAllPathResults(fromIata, toIata, gcDistance, network) {
  if (!fromIata || !toIata || fromIata === toIata || gcDistance <= 0) return [];

  const allPaths = enumerateAllPaths(fromIata, toIata, network, gcDistance);

  return allPaths.map(path => {
    const airlineIds        = [...new Set(path.map(leg => leg.airlineId))];
    const primaryAirlineId  = path[0].airlineId;
    const isPureCarrier     = airlineIds.length === 1;
    const legSequence       = [path[0].fromIata, ...path.map(leg => leg.toIata)];
    const totalDistance     = path.reduce((sum, leg) => sum + leg.distance, 0);
    const costMatrix        = computePathCostMatrix(path, fromIata, network);
    const airlineNames      = airlineIds.map(id => getAirlineName(network, id));

    return {
      path,
      airlineIds,
      primaryAirlineId,
      isPureCarrier,
      legSequence,
      totalDistance,
      costMatrix,
      airlineNames,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET REFERENCE PATH RESULT
// Finds the best itinerary for the reference airline on the selected O-D.
// Prefers pure-carrier paths (all legs operated by reference airline).
// Falls back to any path where reference airline operates the first leg.
// Sorted by lowest perceived cost for the selected cabin class + archetype.
// ─────────────────────────────────────────────────────────────────────────────
export function getReferencePathResult(allPathResults, referenceAirlineId, cabinClassKey, archetypeId) {
  if (!referenceAirlineId || allPathResults.length === 0) return null;

  const purePaths = allPathResults.filter(r =>
    r.isPureCarrier && r.primaryAirlineId === referenceAirlineId
  );

  const candidates = purePaths.length > 0
    ? purePaths
    : allPathResults.filter(r => r.primaryAirlineId === referenceAirlineId);

  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) => {
    const bestCost    = best.costMatrix[cabinClassKey]?.[archetypeId]    ?? Infinity;
    const currentCost = current.costMatrix[cabinClassKey]?.[archetypeId] ?? Infinity;
    return currentCost < bestCost ? current : best;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPUTE DELTAS VS REFERENCE
// For each applicable cell in a path's cost matrix, computes absolute ($)
// and percentage (%) delta versus the corresponding reference matrix cell.
// Negative delta = this path is cheaper than reference (better for pax).
// ─────────────────────────────────────────────────────────────────────────────
export function computeDeltasVsReference(costMatrix, referenceMatrix) {
  const deltas = {};

  for (const cabinClassKey of CABIN_CLASS_KEYS) {
    deltas[cabinClassKey] = {};
    for (const archetypeId of ARCHETYPE_IDS) {
      if (!ARCHETYPE_APPLICABLE_CLASSES[archetypeId].includes(cabinClassKey)) continue;

      const ownCost = costMatrix[cabinClassKey]?.[archetypeId];
      const refCost = referenceMatrix[cabinClassKey]?.[archetypeId];

      if (ownCost == null || refCost == null || refCost === 0) {
        deltas[cabinClassKey][archetypeId] = null;
        continue;
      }

      deltas[cabinClassKey][archetypeId] = {
        absoluteDelta:    ownCost - refCost,
        percentageDelta: ((ownCost - refCost) / refCost) * 100,
      };
    }
  }

  return deltas;
}

// ─────────────────────────────────────────────────────────────────────────────
// SORT PATH RESULTS
// Sorts competing paths by perceived cost for the selected combo, ascending.
// Reference path is excluded from the sorted list (displayed separately).
// ─────────────────────────────────────────────────────────────────────────────
export function sortPathResults(allPathResults, referencePathResult, cabinClassKey, archetypeId) {
  const competing = referencePathResult
    ? allPathResults.filter(r => r !== referencePathResult)
    : allPathResults;

  return [...competing].sort((a, b) => {
    const costA = a.costMatrix[cabinClassKey]?.[archetypeId] ?? Infinity;
    const costB = b.costMatrix[cabinClassKey]?.[archetypeId] ?? Infinity;
    return costA - costB;
  });
}
