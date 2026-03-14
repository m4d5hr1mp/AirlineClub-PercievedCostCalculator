// ─────────────────────────────────────────────────────────────────────────────
// RENDER NETWORK — Network Inputs page
// Three-column layout: Alliances | Airlines | Airline Editor
// Airline editor has two tabs: Routes and Airport Presences
// ─────────────────────────────────────────────────────────────────────────────

import {
  loadNetwork, saveNetwork, resetNetwork,
  addAlliance, updateAlliance, deleteAlliance,
  addAirline, updateAirline, deleteAirline,
  addRoute, updateRoute, deleteRoute,
  ensureAirport, updateAirport, upsertAirlinePresence,
  getAirlineAirports, getAirlineName,
} from './network.js';

import {
  FLIGHT_TYPES, FLIGHT_TYPE_KEYS,
  BRANDING_SPECIALIZATIONS, BRANDING_SPECIALIZATION_KEYS,
  PASSENGER_COST_ASSETS, PASSENGER_COST_ASSET_KEYS,
} from './constants.js';

// Page-local state
let network          = loadNetwork();
let selectedAirlineId = null;
let editorTab        = 'routes'; // 'routes' | 'presences'
let editingRouteId   = null;     // null = adding new, string = editing existing

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RENDER
// ─────────────────────────────────────────────────────────────────────────────
export function renderNetworkPage() {
  network = loadNetwork();
  const container = document.getElementById('page-network');
  container.innerHTML = `
    <div class="network-page-toolbar">
      <button class="btn-network-danger" onclick="window.networkResetAll()">↺ Reset All Network Data</button>
    </div>
    <div class="network-layout">
      ${renderAlliancesPanel()}
      ${renderAirlinesPanel()}
      ${renderEditorPanel()}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALLIANCES PANEL
// ─────────────────────────────────────────────────────────────────────────────
function renderAlliancesPanel() {
  const rows = network.alliances.map(alliance => {
    const members = network.airlines
      .filter(a => a.allianceId === alliance.id)
      .map(a => `<span class="alliance-member-chip">${a.name}</span>`)
      .join('');

    return `
      <div class="network-item">
        <div class="network-item-header">
          <span class="network-item-name">${alliance.name}</span>
          <button class="btn-icon-danger" onclick="window.networkDeleteAlliance('${alliance.id}')">✕</button>
        </div>
        <div class="alliance-members">${members || '<span class="muted-note">No members</span>'}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="network-panel">
      <div class="network-panel-header">
        <span>Alliances</span>
        <button class="btn-network-add" onclick="window.networkAddAlliance()">+ Add</button>
      </div>
      <div class="network-panel-body">
        ${rows || '<div class="muted-note padded">No alliances defined</div>'}
        <div id="alliance-add-form" style="display:none;" class="inline-add-form">
          <input id="alliance-name-input" type="text" placeholder="Alliance name" class="network-text-input">
          <button class="btn-network-confirm" onclick="window.networkConfirmAddAlliance()">Add</button>
          <button class="btn-network-cancel" onclick="window.networkCancelForm('alliance-add-form')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// AIRLINES PANEL
// ─────────────────────────────────────────────────────────────────────────────
function renderAirlinesPanel() {
  const rows = network.airlines.map(airline => {
    const allianceName = network.alliances.find(a => a.id === airline.allianceId)?.name ?? 'No alliance';
    const isSelected   = airline.id === selectedAirlineId;

    return `
      <div class="network-item network-item-clickable ${isSelected ? 'network-item-selected' : ''}"
           onclick="window.networkSelectAirline('${airline.id}')">
        <div class="network-item-header">
          <span class="network-item-name">${airline.name}</span>
          <button class="btn-icon-danger" onclick="event.stopPropagation(); window.networkDeleteAirline('${airline.id}')">✕</button>
        </div>
        <div class="network-item-sub">${allianceName}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="network-panel">
      <div class="network-panel-header">
        <span>Airlines</span>
        <button class="btn-network-add" onclick="window.networkAddAirline()">+ Add</button>
      </div>
      <div class="network-panel-body">
        ${rows || '<div class="muted-note padded">No airlines defined</div>'}
        <div id="airline-add-form" style="display:none;" class="inline-add-form">
          <input id="airline-name-input" type="text" placeholder="Airline name" class="network-text-input">
          <select id="airline-alliance-input" class="network-select">
            <option value="">No alliance</option>
            ${network.alliances.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
          </select>
          <button class="btn-network-confirm" onclick="window.networkConfirmAddAirline()">Add</button>
          <button class="btn-network-cancel" onclick="window.networkCancelForm('airline-add-form')">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR PANEL
// ─────────────────────────────────────────────────────────────────────────────
function renderEditorPanel() {
  if (!selectedAirlineId) {
    return `
      <div class="network-panel network-editor-panel">
        <div class="network-editor-empty">Select an airline to edit its routes and airport presences</div>
      </div>
    `;
  }

  const airline = network.airlines.find(a => a.id === selectedAirlineId);
  if (!airline) return '';

  return `
    <div class="network-panel network-editor-panel">
      <div class="network-panel-header">
        <span>${airline.name}</span>
        <div class="editor-tab-bar">
          <button class="editor-tab ${editorTab === 'routes' ? 'active' : ''}"
                  onclick="window.networkSetEditorTab('routes')">Routes</button>
          <button class="editor-tab ${editorTab === 'presences' ? 'active' : ''}"
                  onclick="window.networkSetEditorTab('presences')">Airport Presences</button>
        </div>
      </div>
      <div class="network-panel-body">
        ${editorTab === 'routes' ? renderRoutesTab(airline) : renderPresencesTab(airline)}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES TAB
// ─────────────────────────────────────────────────────────────────────────────
function renderRoutesTab(airline) {
  const routes = network.routes.filter(r => r.airlineId === airline.id);

  const routeCards = routes.map(route => {
    if (editingRouteId === route.id) {
      return renderRouteForm(route);
    }
    return `
      <div class="route-card">
        <div class="route-card-header">
          <span class="route-pair">${route.fromIata} ↔ ${route.toIata}</span>
          <span class="route-type-badge">${FLIGHT_TYPES[route.flightTypeKey]?.label ?? route.flightTypeKey}</span>
          <div class="route-card-actions">
            <button class="btn-network-small" onclick="window.networkEditRoute('${route.id}')">Edit</button>
            <button class="btn-icon-danger" onclick="window.networkDeleteRoute('${route.id}')">✕</button>
          </div>
        </div>
        <div class="route-card-props">
          <span>${route.distance.toLocaleString()} km · ${route.frequency}/wk · Q${route.quality} · ${route.aircraftSpeed} km/h</span>
          <span class="route-prices">E $${route.priceByClass.ECONOMY} / J $${route.priceByClass.BUSINESS} / F $${route.priceByClass.FIRST}</span>
        </div>
      </div>
    `;
  }).join('');

  const addFormOrButton = editingRouteId === 'new'
    ? renderRouteForm(null)
    : `<button class="btn-network-add-route" onclick="window.networkStartAddRoute()">+ Add Route</button>`;

  return `
    <div class="routes-tab">
      ${routeCards || '<div class="muted-note padded">No routes defined for this airline</div>'}
      ${addFormOrButton}
    </div>
  `;
}

function renderRouteForm(existing) {
  const v = existing ?? {
    fromIata: '', toIata: '',
    flightTypeKey: 'SHORT_HAUL_INTERNATIONAL',
    distance: 1000,
    priceByClass: { ECONOMY: 100, BUSINESS: 300, FIRST: 900 },
    quality: 65, frequency: 7, aircraftSpeed: 800,
  };

  return `
    <div class="route-form">
      <div class="route-form-title">${existing ? 'Edit Route' : 'New Route'}</div>
      <div class="form-row-3">
        <div class="form-field">
          <label>From IATA</label>
          <input id="rf-from" type="text" maxlength="4" value="${v.fromIata}" class="network-text-input uppercase-input">
        </div>
        <div class="form-field">
          <label>To IATA</label>
          <input id="rf-to" type="text" maxlength="4" value="${v.toIata}" class="network-text-input uppercase-input">
        </div>
        <div class="form-field">
          <label>Distance (km)</label>
          <input id="rf-dist" type="number" min="50" value="${v.distance}" class="network-text-input">
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-field">
          <label>Flight Type</label>
          <select id="rf-ftype" class="network-select">
            ${FLIGHT_TYPE_KEYS.map(k => `<option value="${k}" ${v.flightTypeKey === k ? 'selected' : ''}>${FLIGHT_TYPES[k].label}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>Aircraft Speed (km/h)</label>
          <input id="rf-speed" type="number" min="200" max="2500" value="${v.aircraftSpeed}" class="network-text-input">
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-field">
          <label>Quality (0–100)</label>
          <input id="rf-quality" type="number" min="0" max="100" value="${v.quality}" class="network-text-input">
        </div>
        <div class="form-field">
          <label>Weekly Frequency</label>
          <input id="rf-freq" type="number" min="1" max="168" value="${v.frequency}" class="network-text-input">
        </div>
      </div>
      <div class="form-row-3">
        <div class="form-field">
          <label>Price — Economy ($)</label>
          <input id="rf-price-e" type="number" min="0" value="${v.priceByClass.ECONOMY}" class="network-text-input">
        </div>
        <div class="form-field">
          <label>Price — Business ($)</label>
          <input id="rf-price-b" type="number" min="0" value="${v.priceByClass.BUSINESS}" class="network-text-input">
        </div>
        <div class="form-field">
          <label>Price — First ($)</label>
          <input id="rf-price-f" type="number" min="0" value="${v.priceByClass.FIRST}" class="network-text-input">
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-network-confirm" onclick="window.networkSaveRoute('${existing?.id ?? ''}')">
          ${existing ? 'Save Changes' : 'Add Route'}
        </button>
        <button class="btn-network-cancel" onclick="window.networkCancelRouteEdit()">Cancel</button>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESENCES TAB
// ─────────────────────────────────────────────────────────────────────────────
function renderPresencesTab(airline) {
  const airportIatas = getAirlineAirports(network, airline.id);

  if (airportIatas.length === 0) {
    return `<div class="muted-note padded">Add routes first — airport presences auto-populate from routes</div>`;
  }

  const cards = airportIatas.map(iata => {
    const airportData = network.airports[iata] ?? {};
    const presence    = airportData.perAirline?.[airline.id] ?? { loyalty: 0, brandingSpecialization: 'NONE', loungeLevel: 0 };

    return `
      <div class="presence-card">
        <div class="presence-card-header">
          <span class="presence-iata">${iata}</span>
          <span class="presence-shared-note">
            Income ${(airportData.income ?? 50000).toLocaleString()} · Size ${airportData.size ?? 5}
          </span>
        </div>
        <div class="form-row-3">
          <div class="form-field">
            <label>Loyalty (0–100)</label>
            <input type="number" min="0" max="100" value="${presence.loyalty}"
                   onchange="window.networkUpdatePresence('${iata}', '${airline.id}', 'loyalty', +this.value)">
          </div>
          <div class="form-field">
            <label>Branding</label>
            <select onchange="window.networkUpdatePresence('${iata}', '${airline.id}', 'brandingSpecialization', this.value)">
              ${BRANDING_SPECIALIZATION_KEYS.map(k =>
                `<option value="${k}" ${presence.brandingSpecialization === k ? 'selected' : ''}>${BRANDING_SPECIALIZATIONS[k].label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-field">
            <label>Lounge Level</label>
            <select onchange="window.networkUpdatePresence('${iata}', '${airline.id}', 'loungeLevel', +this.value)">
              <option value="0" ${presence.loungeLevel === 0 ? 'selected' : ''}>None</option>
              <option value="1" ${presence.loungeLevel === 1 ? 'selected' : ''}>Level 1</option>
              <option value="2" ${presence.loungeLevel === 2 ? 'selected' : ''}>Level 2</option>
              <option value="3" ${presence.loungeLevel === 3 ? 'selected' : ''}>Level 3</option>
            </select>
          </div>
        </div>
        <div class="presence-shared-fields">
          <div class="form-row-2">
            <div class="form-field">
              <label>Airport Income (shared)</label>
              <input type="number" min="1000" value="${airportData.income ?? 50000}"
                     onchange="window.networkUpdateAirport('${iata}', 'income', +this.value)">
            </div>
            <div class="form-field">
              <label>Airport Size (shared)</label>
              <select onchange="window.networkUpdateAirport('${iata}', 'size', +this.value)">
                ${Array.from({length: 10}, (_, i) => i + 1).map(s =>
                  `<option value="${s}" ${(airportData.size ?? 5) === s ? 'selected' : ''}>${s}${s >= 4 ? '' : ' (no Elite)'}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          <div class="form-row-2">
            <div class="form-field">
              <label>Airport Hotel Level (shared, for connections)</label>
              <select onchange="window.networkUpdateAirport('${iata}', 'airportHotelLevel', +this.value)">
                ${Array.from({length: 11}, (_, i) => i).map(lvl =>
                  `<option value="${lvl}" ${(airportData.airportHotelLevel ?? 0) === lvl ? 'selected' : ''}>${lvl === 0 ? 'None' : 'Level ' + lvl}</option>`
                ).join('')}
              </select>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<div class="presences-tab">${cards}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW-EXPOSED EVENT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────
export function exposeNetworkHandlers() {

  window.networkAddAlliance = () => {
    document.getElementById('alliance-add-form').style.display = 'block';
    document.getElementById('alliance-name-input').focus();
  };

  window.networkConfirmAddAlliance = () => {
    const name = document.getElementById('alliance-name-input').value.trim();
    if (!name) return;
    addAlliance(network, name);
    renderNetworkPage();
  };

  window.networkDeleteAlliance = (id) => {
    if (!confirm('Delete this alliance? Member airlines will become unaligned.')) return;
    deleteAlliance(network, id);
    renderNetworkPage();
  };

  window.networkAddAirline = () => {
    document.getElementById('airline-add-form').style.display = 'block';
    document.getElementById('airline-name-input').focus();
  };

  window.networkConfirmAddAirline = () => {
    const name       = document.getElementById('airline-name-input').value.trim();
    const allianceId = document.getElementById('airline-alliance-input').value || null;
    if (!name) return;
    const airline = addAirline(network, name, allianceId);
    selectedAirlineId = airline.id;
    editorTab = 'routes';
    renderNetworkPage();
  };

  window.networkDeleteAirline = (id) => {
    if (!confirm('Delete this airline and all its routes?')) return;
    deleteAirline(network, id);
    if (selectedAirlineId === id) selectedAirlineId = null;
    renderNetworkPage();
  };

  window.networkSelectAirline = (id) => {
    selectedAirlineId = id;
    editingRouteId    = null;
    renderNetworkPage();
  };

  window.networkSetEditorTab = (tab) => {
    editorTab = tab;
    editingRouteId = null;
    renderNetworkPage();
  };

  window.networkCancelForm = (formId) => {
    document.getElementById(formId).style.display = 'none';
  };

  window.networkStartAddRoute = () => {
    editingRouteId = 'new';
    renderNetworkPage();
  };

  window.networkEditRoute = (id) => {
    editingRouteId = id;
    renderNetworkPage();
  };

  window.networkCancelRouteEdit = () => {
    editingRouteId = null;
    renderNetworkPage();
  };

  window.networkDeleteRoute = (id) => {
    deleteRoute(network, id);
    renderNetworkPage();
  };

  window.networkSaveRoute = (existingId) => {
    const fromIata    = document.getElementById('rf-from').value.trim().toUpperCase();
    const toIata      = document.getElementById('rf-to').value.trim().toUpperCase();
    const distance    = +document.getElementById('rf-dist').value;
    const flightTypeKey = document.getElementById('rf-ftype').value;
    const aircraftSpeed = +document.getElementById('rf-speed').value;
    const quality     = +document.getElementById('rf-quality').value;
    const frequency   = +document.getElementById('rf-freq').value;
    const priceE      = +document.getElementById('rf-price-e').value;
    const priceB      = +document.getElementById('rf-price-b').value;
    const priceF      = +document.getElementById('rf-price-f').value;

    if (!fromIata || !toIata || !distance) return;

    const routeData = {
      airlineId: selectedAirlineId,
      fromIata, toIata, distance, flightTypeKey, aircraftSpeed,
      quality, frequency,
      priceByClass: { ECONOMY: priceE, BUSINESS: priceB, FIRST: priceF },
    };

    if (existingId) {
      updateRoute(network, existingId, routeData);
    } else {
      addRoute(network, routeData);
    }

    editingRouteId = null;
    renderNetworkPage();
  };

  window.networkUpdatePresence = (iata, airlineId, field, value) => {
    upsertAirlinePresence(network, iata, airlineId, { [field]: value });
    // No full re-render needed — just save
  };

  window.networkUpdateAirport = (iata, field, value) => {
    updateAirport(network, iata, { [field]: value });
  };

  window.networkResetAll = () => {
    if (!confirm('Reset entire network? This cannot be undone.')) return;
    network = resetNetwork();
    selectedAirlineId = null;
    editingRouteId    = null;
    renderNetworkPage();
  };
}
