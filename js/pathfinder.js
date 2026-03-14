// ─────────────────────────────────────────────────────────────────────────────
// PATHFINDER
// Enumerates all valid paths between two airports through the full
// multi-airline network, then computes perceived cost matrices per path.
//
// Paths are found by DFS (not Bellman-Ford) because we want ALL valid paths
// for comparison, not just the cheapest one. The game's Bellman-Ford would
// only surface the winner — here we want to show every option.
// Max 3 legs (2 connections), max total distance = 2.5× great circle.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ROUTE_DISTANCE_TOLERANCE_FACTOR,
  CABIN_CLASS_KEYS,
  ARCHETYPE_IDS,
  ARCHETYPE_APPLICABLE_CLASSES,
} from './constants.js';

import {
  computeLegPerceivedCost,
  computeConnectionCost,
} from './formulas.js';

import { buildPreferencePool, aggregatePoolByArchetype } from './pool.js';

const MAX_LEGS = 3;

// ─────────────────────────────────────────────────────────────────────────────
// LOUNGE ACCESS
// Operating airline can use its own lounge OR any alliance member's lounge
// at an airport. Returns the highest accessible level.
// Source: FlightPreference.scala — loungeAdjustRatio reads link.from.getLounge
//   with (link.airline.id, link.airline.getAllianceId)
// ─────────────────────────────────────────────────────────────────────────────
export function getAccessibleLoungeLevel(airlineId, airportIata, network) {
  const airportData = network.airports[airportIata];
  if (!airportData) return 0;

  const airline = network.airlines.find(a => a.id === airlineId);
  if (!airline) return 0;

  let maxLevel = airportData.perAirline?.[airlineId]?.loungeLevel ?? 0;

  if (airline.allianceId) {
    for (const member of network.airlines) {
      if (member.id !== airlineId && member.allianceId === airline.allianceId) {
        const memberLevel = airportData.perAirline?.[member.id]?.loungeLevel ?? 0;
        maxLevel = Math.max(maxLevel, memberLevel);
      }
    }
  }

  return maxLevel;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION TYPE
// Source: PassengerSimulation.scala — connection cost block
// Same airline OR same established alliance → base $25
// Different airline, no shared alliance → interline +$75 surcharge
// ─────────────────────────────────────────────────────────────────────────────
function getConnectionType(leg1, leg2, network) {
  if (leg1.airlineId === leg2.airlineId) return 'SAME_AIRLINE_OR_ALLIANCE';

  const airline1 = network.airlines.find(a => a.id === leg1.airlineId);
  const airline2 = network.airlines.find(a => a.id === leg2.airlineId);

  if (airline1?.allianceId && airline1.allianceId === airline2?.allianceId) {
    return 'SAME_AIRLINE_OR_ALLIANCE';
  }
  return 'INTERLINE';
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD LEG AIRPORT CONTEXTS for computeLegPerceivedCost
//
// LOYALTY: always read at the JOURNEY HOME airport for the OPERATING airline.
//   Source: FlightPreference.scala — lazy val appealList built from homeAirport
//   and then looked up per link.airline.id.
//
// LOUNGE: at each leg's own endpoint, accessible via operating airline's alliance.
//   Source: FlightPreference.scala — loungeAdjustRatio reads from link.from/to.
//
// BRANDING: at each leg's own endpoint, per operating airline.
//   Source: PassengerSimulation.scala — ExternalCostModifier checks link.from and link.to.
// ─────────────────────────────────────────────────────────────────────────────
function buildLegOriginContext(leg, homeIata, network) {
  const legOriginData = network.airports[leg.fromIata] ?? {};
  const homeData      = network.airports[homeIata]     ?? {};
  const airlineId     = leg.airlineId;

  return {
    income:                 legOriginData.income  ?? 50000,
    size:                   legOriginData.size    ?? 5,
    loyalty:                homeData.perAirline?.[airlineId]?.loyalty ?? 0,
    loungeLevel:            getAccessibleLoungeLevel(airlineId, leg.fromIata, network),
    brandingSpecialization: legOriginData.perAirline?.[airlineId]?.brandingSpecialization ?? 'NONE',
    assets:                 legOriginData.assets ?? [],
  };
}

function buildLegDestinationContext(leg, network) {
  const legDestData = network.airports[leg.toIata] ?? {};
  const airlineId   = leg.airlineId;

  return {
    size:                   legDestData.size ?? 5,
    loungeLevel:            getAccessibleLoungeLevel(airlineId, leg.toIata, network),
    brandingSpecialization: legDestData.perAirline?.[airlineId]?.brandingSpecialization ?? 'NONE',
    assets:                 legDestData.assets ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH ENUMERATION
// DFS over bidirectional route graph. Routes are stored A→B but represent A↔B.
// Returns array of paths, each being an array of edge objects.
// ─────────────────────────────────────────────────────────────────────────────
export function enumerateAllPaths(fromIata, toIata, network, gcDistance) {
  const maxTotalDistance = gcDistance * ROUTE_DISTANCE_TOLERANCE_FACTOR;
  const validPaths = [];

  // Build bidirectional edges from stored unidirectional routes
  const edges = [];
  for (const route of network.routes) {
    edges.push({ ...route });
    edges.push({ ...route, id: route.id + '_rev', fromIata: route.toIata, toIata: route.fromIata });
  }

  function dfs(currentIata, currentPath, visitedIatas, totalDistance) {
    // Arrived at destination — record path
    if (currentIata === toIata && currentPath.length > 0) {
      validPaths.push([...currentPath]);
      return;
    }
    if (currentPath.length >= MAX_LEGS) return;

    for (const edge of edges) {
      if (edge.fromIata !== currentIata) continue;
      // Don't revisit airports unless it's the final destination
      if (visitedIatas.has(edge.toIata) && edge.toIata !== toIata) continue;

      const newTotalDistance = totalDistance + edge.distance;
      if (newTotalDistance > maxTotalDistance) continue;

      currentPath.push(edge);
      visitedIatas.add(edge.toIata);
      dfs(edge.toIata, currentPath, visitedIatas, newTotalDistance);
      currentPath.pop();
      visitedIatas.delete(edge.toIata);
    }
  }

  const initialVisited = new Set([fromIata]);
  dfs(fromIata, [], initialVisited, 0);
  return validPaths;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPUTE FULL PATH COST MATRIX
// Returns { [cabinClassKey]: { [archetypeId]: perceivedCost } }
// for all applicable cabin class × archetype combinations.
//
// homeIata: the journey origin airport — used for loyalty lookups and pool.
// ─────────────────────────────────────────────────────────────────────────────
export function computePathCostMatrix(path, homeIata, network) {
  const homeAirportData = network.airports[homeIata]                     ?? {};
  const lastDestData    = network.airports[path[path.length - 1].toIata] ?? {};

  // Pool uses home airport income/size and destination size
  // (same logic as the single-route calculator's preference pool)
  const homeAirportForPool = {
    income: homeAirportData.income ?? 50000,
    size:   homeAirportData.size   ?? 5,
  };
  const destAirportForPool = {
    size: lastDestData.size ?? 5,
  };

  const matrix = {};

  for (const cabinClassKey of CABIN_CLASS_KEYS) {
    matrix[cabinClassKey] = {};

    const pool    = buildPreferencePool(homeAirportForPool, destAirportForPool, cabinClassKey);
    const buckets = aggregatePoolByArchetype(pool);

    for (const archetypeId of ARCHETYPE_IDS) {
      if (!ARCHETYPE_APPLICABLE_CLASSES[archetypeId].includes(cabinClassKey)) continue;

      const bucket = buckets[archetypeId];
      if (!bucket) continue;

      let totalPerceivedCost = 0;

      for (let legIndex = 0; legIndex < path.length; legIndex++) {
        const leg             = path[legIndex];
        const originContext   = buildLegOriginContext(leg, homeIata, network);
        const destContext     = buildLegDestinationContext(leg, network);

        totalPerceivedCost += computeLegPerceivedCost(
          bucket, leg, originContext, destContext, cabinClassKey
        );

        // Add connection cost between this leg and the next
        if (legIndex < path.length - 1) {
          const nextLeg              = path[legIndex + 1];
          const connectionType       = getConnectionType(leg, nextLeg, network);
          const connectionAirportData = network.airports[leg.toIata] ?? {};

          totalPerceivedCost += computeConnectionCost(
            leg,
            nextLeg,
            connectionType,
            connectionAirportData.airportHotelLevel ?? 0,
            cabinClassKey,
            bucket.archetypeId
          );
        }
      }

      matrix[cabinClassKey][archetypeId] = totalPerceivedCost;
    }
  }

  return matrix;
}
