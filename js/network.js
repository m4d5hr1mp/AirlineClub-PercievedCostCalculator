// ─────────────────────────────────────────────────────────────────────────────
// NETWORK — localStorage persistence, schema versioning, CRUD operations
// All mutations save to localStorage immediately after modifying the object.
// Consumers get a reference to the live network object; call saveNetwork()
// explicitly if making multiple changes before rendering.
// ─────────────────────────────────────────────────────────────────────────────

const NETWORK_STORAGE_KEY    = 'pcc_network';
export const CURRENT_SCHEMA_VERSION = 1;

const EMPTY_NETWORK = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  alliances: [],   // [{ id, name }]
  airlines:  [],   // [{ id, name, allianceId | null }]
  airports:  {},   // { [iata]: AirportData }
  routes:    [],   // [RouteData]
};

// ─────────────────────────────────────────────────────────────────────────────
// ID GENERATION
// ─────────────────────────────────────────────────────────────────────────────
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD / SAVE
// ─────────────────────────────────────────────────────────────────────────────
export function loadNetwork() {
  try {
    const raw = localStorage.getItem(NETWORK_STORAGE_KEY);
    if (!raw) return structuredClone(EMPTY_NETWORK);

    const data = JSON.parse(raw);
    if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
      console.warn(`PCC Network: schema v${data.schemaVersion} does not match current v${CURRENT_SCHEMA_VERSION}. Resetting to empty.`);
      return structuredClone(EMPTY_NETWORK);
    }
    return data;
  } catch (error) {
    console.error('PCC Network: failed to load from localStorage:', error);
    return structuredClone(EMPTY_NETWORK);
  }
}

export function saveNetwork(network) {
  try {
    localStorage.setItem(NETWORK_STORAGE_KEY, JSON.stringify(network));
    return true;
  } catch (error) {
    console.error('PCC Network: failed to save to localStorage:', error);
    return false;
  }
}

export function resetNetwork() {
  const fresh = structuredClone(EMPTY_NETWORK);
  saveNetwork(fresh);
  return fresh;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALLIANCES
// ─────────────────────────────────────────────────────────────────────────────
export function addAlliance(network, name) {
  const alliance = { id: generateId(), name };
  network.alliances.push(alliance);
  saveNetwork(network);
  return alliance;
}

export function updateAlliance(network, id, updates) {
  const alliance = network.alliances.find(a => a.id === id);
  if (alliance) Object.assign(alliance, updates);
  saveNetwork(network);
}

export function deleteAlliance(network, id) {
  // Detach all member airlines before deleting
  network.airlines.forEach(airline => {
    if (airline.allianceId === id) airline.allianceId = null;
  });
  network.alliances = network.alliances.filter(a => a.id !== id);
  saveNetwork(network);
}

// ─────────────────────────────────────────────────────────────────────────────
// AIRLINES
// ─────────────────────────────────────────────────────────────────────────────
export function addAirline(network, name, allianceId = null) {
  const airline = { id: generateId(), name, allianceId };
  network.airlines.push(airline);
  saveNetwork(network);
  return airline;
}

export function updateAirline(network, id, updates) {
  const airline = network.airlines.find(a => a.id === id);
  if (airline) Object.assign(airline, updates);
  saveNetwork(network);
}

export function deleteAirline(network, id) {
  network.airlines = network.airlines.filter(a => a.id !== id);
  network.routes   = network.routes.filter(r => r.airlineId !== id);
  for (const iata of Object.keys(network.airports)) {
    delete network.airports[iata].perAirline?.[id];
  }
  saveNetwork(network);
}

// ─────────────────────────────────────────────────────────────────────────────
// AIRPORTS
// Airport entries auto-created when routes are added.
// Shared fields: income, size, airportHotelLevel, assets
// Per-airline fields: perAirline[airlineId] = { loyalty, brandingSpecialization, loungeLevel }
// ─────────────────────────────────────────────────────────────────────────────
export function ensureAirport(network, iata) {
  if (!network.airports[iata]) {
    network.airports[iata] = {
      iata,
      income:           50000,
      size:             5,
      airportHotelLevel: 0,
      assets:           [],
      perAirline:       {},
    };
  }
  return network.airports[iata];
}

export function updateAirport(network, iata, updates) {
  ensureAirport(network, iata);
  const { perAirline, ...sharedUpdates } = updates;
  Object.assign(network.airports[iata], sharedUpdates);
  saveNetwork(network);
}

export function upsertAirlinePresence(network, iata, airlineId, updates) {
  ensureAirport(network, iata);
  if (!network.airports[iata].perAirline[airlineId]) {
    network.airports[iata].perAirline[airlineId] = {
      loyalty:                0,
      brandingSpecialization: 'NONE',
      loungeLevel:            0,
    };
  }
  Object.assign(network.airports[iata].perAirline[airlineId], updates);
  saveNetwork(network);
}

export function upsertAirportAssets(network, iata, assets) {
  ensureAirport(network, iata);
  network.airports[iata].assets = assets;
  saveNetwork(network);
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// Stored unidirectionally (A→B). Treated as bidirectional in pathfinding.
// ─────────────────────────────────────────────────────────────────────────────
export function addRoute(network, routeData) {
  const route = { id: generateId(), ...routeData };
  network.routes.push(route);
  ensureAirport(network, route.fromIata);
  ensureAirport(network, route.toIata);
  saveNetwork(network);
  return route;
}

export function updateRoute(network, id, updates) {
  const route = network.routes.find(r => r.id === id);
  if (!route) return;
  Object.assign(route, updates);
  if (updates.fromIata) ensureAirport(network, updates.fromIata);
  if (updates.toIata)   ensureAirport(network, updates.toIata);
  saveNetwork(network);
}

export function deleteRoute(network, id) {
  network.routes = network.routes.filter(r => r.id !== id);
  saveNetwork(network);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// All airport IATAs touched by a specific airline's routes
export function getAirlineAirports(network, airlineId) {
  const iataCodes = new Set();
  network.routes
    .filter(r => r.airlineId === airlineId)
    .forEach(r => { iataCodes.add(r.fromIata); iataCodes.add(r.toIata); });
  return [...iataCodes].sort();
}

// Alliance name for an airline ID, or null
export function getAllianceName(network, airlineId) {
  const airline = network.airlines.find(a => a.id === airlineId);
  if (!airline?.allianceId) return null;
  return network.alliances.find(a => a.id === airline.allianceId)?.name ?? null;
}

// Airline name for an ID, or fallback
export function getAirlineName(network, airlineId) {
  return network.airlines.find(a => a.id === airlineId)?.name ?? airlineId;
}

// All routes for a specific airline
export function getAirlineRoutes(network, airlineId) {
  return network.routes.filter(r => r.airlineId === airlineId);
}

// Find direct route distance between two IATAs (either direction), or null
export function getDirectRouteDistance(network, iataA, iataB) {
  const route = network.routes.find(r =>
    (r.fromIata === iataA && r.toIata === iataB) ||
    (r.fromIata === iataB && r.toIata === iataA)
  );
  return route?.distance ?? null;
}
