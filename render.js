// ─────────────────────────────────────────────────────────────────────────────
// RENDER — all DOM mutation lives here.
// Reads from state and formulas/pool; never mutates state directly.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CABIN_CLASSES, CABIN_CLASS_KEYS,
  FLIGHT_TYPES, FLIGHT_TYPE_KEYS,
  ARCHETYPE_IDS, ARCHETYPE_COLORS, ARCHETYPE_LABELS,
  ARCHETYPE_DESCRIPTIONS, ARCHETYPE_APPLICABLE_CLASSES,
  SATISFACTION_FULL_PRICE_RATIO_THRESHOLD,
  SATISFACTION_ZERO_PRICE_RATIO_THRESHOLD,
  ROUTE_COST_TOLERANCE_FACTOR,
  LINK_COST_TOLERANCE_FACTOR,
} from './constants.js';

import {
  computeStandardPrice,
  computeIncomeLevelFromIncome,
  computeBudgetMultiplier,
  computeSatisfaction,
  computeRoutePerceivedCost,
  computeLegPerceivedCost,
} from './formulas.js';

import { buildPreferencePool, aggregatePoolByArchetype } from './pool.js';
import { state, getOdDistance } from './state.js';

// ─────────────────────────────────────────────────────────────────────────────
// PIE CHART
// ─────────────────────────────────────────────────────────────────────────────
function drawPieChart(canvasId, legendContainerId, originAirport, destinationAirport, cabinClassKey) {
  const pool    = buildPreferencePool(originAirport, destinationAirport, cabinClassKey);
  const buckets = aggregatePoolByArchetype(pool);

  const canvas  = document.getElementById(canvasId);
  if (!canvas) return;

  const displayWidth  = canvas.offsetWidth || 216;
  const displayHeight = 110;
  canvas.width  = displayWidth;
  canvas.height = displayHeight;

  const context       = canvas.getContext('2d');
  context.clearRect(0, 0, displayWidth, displayHeight);

  const centerX = displayWidth / 2;
  const centerY = displayHeight / 2;
  const radius  = Math.min(centerX, centerY) - 6;

  let currentAngle = -Math.PI / 2;

  for (const archetypeId of ARCHETYPE_IDS) {
    const bucket = buckets[archetypeId];
    if (!bucket) continue;

    const sweepAngle = bucket.poolShareFraction * Math.PI * 2;

    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, currentAngle, currentAngle + sweepAngle);
    context.closePath();
    context.fillStyle = ARCHETYPE_COLORS[archetypeId];
    context.fill();
    context.strokeStyle = '#0a0a0a';
    context.lineWidth = 1.5;
    context.stroke();

    currentAngle += sweepAngle;
  }

  const legendContainer = document.getElementById(legendContainerId);
  if (!legendContainer) return;
  legendContainer.innerHTML = '';

  for (const archetypeId of ARCHETYPE_IDS) {
    const bucket = buckets[archetypeId];
    if (!bucket) continue;

    const row = document.createElement('div');
    row.className = 'pie-legend-row';
    row.innerHTML = `
      <div class="pie-legend-dot" style="background:${ARCHETYPE_COLORS[archetypeId]}"></div>
      <span class="pie-legend-label">${ARCHETYPE_LABELS[archetypeId]}</span>
      <span class="pie-legend-share">${(bucket.poolShareFraction * 100).toFixed(1)}%</span>
    `;
    legendContainer.appendChild(row);
  }
}

export function renderPies() {
  const firstAirport = state.airports[0];
  const lastAirport  = state.airports[state.airports.length - 1];

  drawPieChart(
    'canvas-origin-pool', 'legend-origin-pool',
    firstAirport, lastAirport,
    state.pieClassByTarget.origin
  );
  drawPieChart(
    'canvas-destination-pool', 'legend-destination-pool',
    lastAirport, firstAirport,
    state.pieClassByTarget.destination
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// META PANEL
// ─────────────────────────────────────────────────────────────────────────────
export function renderMeta() {
  const odDistance        = getOdDistance();
  const odFlightTypeKey   = state.legs[0]?.flightTypeKey ?? 'SHORT_HAUL_INTERNATIONAL';

  const standardPriceEconomy  = computeStandardPrice(odDistance, odFlightTypeKey, 'ECONOMY');
  const standardPriceBusiness = computeStandardPrice(odDistance, odFlightTypeKey, 'BUSINESS');
  const standardPriceFirst    = computeStandardPrice(odDistance, odFlightTypeKey, 'FIRST');

  document.getElementById('meta-standard-price-economy').textContent =
    '$' + standardPriceEconomy.toLocaleString();
  document.getElementById('meta-standard-price-business-first').textContent =
    '$' + standardPriceBusiness.toLocaleString() + ' / $' + standardPriceFirst.toLocaleString();

  document.getElementById('meta-threshold-full-satisfaction').textContent =
    '100% sat ≤ $' + Math.floor(standardPriceEconomy * SATISFACTION_FULL_PRICE_RATIO_THRESHOLD).toLocaleString();
  document.getElementById('meta-threshold-zero-satisfaction').textContent =
    '0% sat ≥ $'   + Math.floor(standardPriceEconomy * SATISFACTION_ZERO_PRICE_RATIO_THRESHOLD).toLocaleString();
  document.getElementById('meta-threshold-hard-reject').textContent =
    'hard reject > $' + Math.floor(standardPriceEconomy * ROUTE_COST_TOLERANCE_FACTOR).toLocaleString() + ' (E)';

  // Per-leg link retry thresholds
  const linkThresholdContainer = document.getElementById('meta-link-thresholds');
  linkThresholdContainer.innerHTML = state.legs.map((leg, index) => {
    const legStdE = computeStandardPrice(leg.distance, leg.flightTypeKey, 'ECONOMY');
    const legStdB = computeStandardPrice(leg.distance, leg.flightTypeKey, 'BUSINESS');
    const legStdF = computeStandardPrice(leg.distance, leg.flightTypeKey, 'FIRST');
    return `<span class="threshold-badge threshold-warning">
      Leg ${index + 1}: $${Math.floor(legStdE * LINK_COST_TOLERANCE_FACTOR).toLocaleString()}
      / $${Math.floor(legStdB * LINK_COST_TOLERANCE_FACTOR).toLocaleString()}
      / $${Math.floor(legStdF * LINK_COST_TOLERANCE_FACTOR).toLocaleString()} (E/J/F)
    </span>`;
  }).join('');

  // O-D distance display note
  const distanceNote = document.getElementById('meta-distance-note');
  if (state.odDistanceAuto) {
    distanceNote.textContent = `auto: sum of leg distances = ${odDistance.toLocaleString()} km`;
  } else {
    distanceNote.textContent = 'manual override active';
  }

  const distanceInput = document.getElementById('od-distance-input');
  distanceInput.disabled = state.odDistanceAuto;
  if (!state.odDistanceAuto) distanceInput.value = state.odDistanceOverride;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS TABLE
// Rows = cabin classes, columns = preference archetypes
// ─────────────────────────────────────────────────────────────────────────────
export function renderTable() {
  const odDistance      = getOdDistance();
  const odFlightTypeKey = state.legs[0]?.flightTypeKey ?? 'SHORT_HAUL_INTERNATIONAL';
  const firstAirport    = state.airports[0];
  const lastAirport     = state.airports[state.airports.length - 1];

  // ── Table head ─────────────────────────────────────────────────────────
  const tableHead = document.getElementById('results-table-head');
  tableHead.innerHTML = `
    <tr>
      <th class="col-cabin-class">Cabin</th>
      ${ARCHETYPE_IDS.map(archetypeId => `
        <th>
          <div class="archetype-header">
            <span class="archetype-name" style="color:${ARCHETYPE_COLORS[archetypeId]}">
              ${ARCHETYPE_LABELS[archetypeId]}
            </span>
            <span class="archetype-desc">${ARCHETYPE_DESCRIPTIONS[archetypeId]}</span>
          </div>
        </th>
      `).join('')}
    </tr>
  `;

  // ── Table body ─────────────────────────────────────────────────────────
  const tableBody = document.getElementById('results-table-body');
  tableBody.innerHTML = '';

  for (const cabinClassKey of CABIN_CLASS_KEYS) {
    const routeStandardPrice = computeStandardPrice(odDistance, odFlightTypeKey, cabinClassKey);
    const pool               = buildPreferencePool(firstAirport, lastAirport, cabinClassKey);
    const archetypeBuckets   = aggregatePoolByArchetype(pool);

    const row = document.createElement('tr');

    // Cabin class label cell
    const cabinCell = document.createElement('td');
    cabinCell.className = 'cell-cabin-class';
    cabinCell.textContent = CABIN_CLASSES[cabinClassKey].label;
    row.appendChild(cabinCell);

    for (const archetypeId of ARCHETYPE_IDS) {
      const cell = document.createElement('td');

      const isApplicable     = ARCHETYPE_APPLICABLE_CLASSES[archetypeId].includes(cabinClassKey);
      const archetypeBucket  = archetypeBuckets[archetypeId];

      if (!isApplicable || !archetypeBucket) {
        cell.innerHTML = `<div class="cell-not-applicable">—</div>`;
        row.appendChild(cell);
        continue;
      }

      const routePerceivedCost = computeRoutePerceivedCost(
        archetypeBucket, cabinClassKey,
        state.legs, state.airports, state.connections
      );

      const satisfaction   = computeSatisfaction(routePerceivedCost, routeStandardPrice);
      const costRatio      = routePerceivedCost / routeStandardPrice;
      const vsStandardPct  = (costRatio - 1) * 100;
      const poolSharePct   = (archetypeBucket.poolShareFraction * 100).toFixed(1);
      const satisfactionPct = Math.round(satisfaction * 100);

      let statusLabel, statusClass;
      if (costRatio > ROUTE_COST_TOLERANCE_FACTOR) {
        statusLabel = 'hard reject'; statusClass = 'status-reject';
      } else if (costRatio > LINK_COST_TOLERANCE_FACTOR) {
        statusLabel = 'route retry';  statusClass = 'status-retry';
      } else {
        statusLabel = 'accepted';    statusClass = 'status-ok';
      }

      const vsColor = costRatio <= 1
        ? 'var(--color-green)'
        : costRatio <= LINK_COST_TOLERANCE_FACTOR
        ? 'var(--color-yellow)'
        : 'var(--color-red)';

      const satisfactionColor = satisfaction > 0.5
        ? 'var(--color-green)'
        : satisfaction > 0.2
        ? 'var(--color-yellow)'
        : 'var(--color-red)';

      cell.innerHTML = `
        <div class="cell-content">
          <div class="cell-perceived-cost">$${Math.round(routePerceivedCost).toLocaleString()}</div>
          <div class="cell-vs-standard" style="color:${vsColor}">
            ${vsStandardPct >= 0 ? '+' : ''}${vsStandardPct.toFixed(1)}% vs std
          </div>
          <div class="cell-metrics-row">
            <span class="cell-pool-share">${poolSharePct}% of pool</span>
            <span class="cell-satisfaction" style="color:${satisfactionColor}">${satisfactionPct}% sat</span>
          </div>
          <span class="status-badge ${statusClass}">${statusLabel}</span>
        </div>
      `;
      row.appendChild(cell);
    }

    tableBody.appendChild(row);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEG BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function renderAirportPanel(airportIndex, airport) {
  const incomeLevelValue  = computeIncomeLevelFromIncome(airport.income).toFixed(1);
  const budgetMultiplierValue = computeBudgetMultiplier(airport.income);

  return `
    <div class="panel-title">Airport ${airportIndex + 1} — ${airport.label || '(unnamed)'}</div>

    <div class="field">
      <label>Label / IATA</label>
      <input type="text" value="${airport.label}"
             oninput="window.handleAirportChange(${airportIndex}, 'label', this.value)">
    </div>
    <div class="field-row-2">
      <div class="field">
        <label>Income ($/yr)</label>
        <input type="number" min="1000" value="${airport.income}"
               onchange="window.handleAirportChange(${airportIndex}, 'income', +this.value)">
      </div>
      <div class="field">
        <label>Size (1–10)</label>
        <input type="number" min="1" max="10" value="${airport.size}"
               onchange="window.handleAirportChange(${airportIndex}, 'size', +this.value)">
      </div>
    </div>
    <div class="field">
      <label>Airline Loyalty at Airport (0–100)</label>
      <input type="number" min="0" max="100" value="${airport.loyalty}"
             onchange="window.handleAirportChange(${airportIndex}, 'loyalty', +this.value)">
    </div>
    <div class="field">
      <label>Airline Lounge Level (0–3)</label>
      <input type="number" min="0" max="3" value="${airport.loungeLevel}"
             onchange="window.handleAirportChange(${airportIndex}, 'loungeLevel', +this.value)">
    </div>
    <div class="airport-stats-note">
      Income level: ${incomeLevelValue} ·
      Budget multiplier: ${budgetMultiplierValue}×
    </div>
  `;
}

function renderFlightPanel(legIndex, leg) {
  const standardPriceEconomy  = computeStandardPrice(leg.distance, leg.flightTypeKey, 'ECONOMY');
  const standardPriceBusiness = computeStandardPrice(leg.distance, leg.flightTypeKey, 'BUSINESS');
  const standardPriceFirst    = computeStandardPrice(leg.distance, leg.flightTypeKey, 'FIRST');

  return `
    <div class="panel-title">Flight Properties</div>

    <div class="field">
      <label>Flight Type</label>
      <select onchange="window.handleLegChange(${legIndex}, 'flightTypeKey', this.value)">
        ${FLIGHT_TYPE_KEYS.map(key =>
          `<option value="${key}" ${leg.flightTypeKey === key ? 'selected' : ''}>
            ${FLIGHT_TYPES[key].label}
          </option>`
        ).join('')}
      </select>
    </div>

    <div class="field-row-2">
      <div class="field">
        <label>Distance (km)</label>
        <input type="number" min="50" value="${leg.distance}"
               onchange="window.handleLegChange(${legIndex}, 'distance', +this.value)">
      </div>
      <div class="field">
        <label>Aircraft Speed (km/h)</label>
        <input type="number" min="200" max="2500" value="${leg.aircraftSpeed}"
               onchange="window.handleLegChange(${legIndex}, 'aircraftSpeed', +this.value)">
      </div>
    </div>

    <div class="field-row-3">
      <div class="field">
        <label>Price — Economy ($)</label>
        <input type="number" min="0" value="${leg.priceByClass.ECONOMY}"
               onchange="window.handleLegPriceChange(${legIndex}, 'ECONOMY', +this.value)">
      </div>
      <div class="field">
        <label>Price — Business ($)</label>
        <input type="number" min="0" value="${leg.priceByClass.BUSINESS}"
               onchange="window.handleLegPriceChange(${legIndex}, 'BUSINESS', +this.value)">
      </div>
      <div class="field">
        <label>Price — First ($)</label>
        <input type="number" min="0" value="${leg.priceByClass.FIRST}"
               onchange="window.handleLegPriceChange(${legIndex}, 'FIRST', +this.value)">
      </div>
    </div>

    <div class="field-row-2">
      <div class="field">
        <label>Quality (0–100)</label>
        <input type="number" min="0" max="100" value="${leg.quality}"
               onchange="window.handleLegChange(${legIndex}, 'quality', +this.value)">
      </div>
      <div class="field">
        <label>Weekly Frequency</label>
        <input type="number" min="1" max="168" value="${leg.frequency}"
               onchange="window.handleLegChange(${legIndex}, 'frequency', +this.value)">
      </div>
    </div>

    <div class="leg-standard-price-note">
      Std price this leg: $${standardPriceEconomy} / $${standardPriceBusiness} / $${standardPriceFirst} (E/J/F)
    </div>
  `;
}

function renderConnectionStrip(connectionIndex, connection) {
  return `
    <div class="connection-strip">
      <span class="connection-label">↯ Connection at ${state.airports[connectionIndex + 1]?.label || 'Airport ' + (connectionIndex + 1)}</span>

      <div class="connection-field">
        <label>Type</label>
        <select onchange="window.handleConnectionChange(${connectionIndex}, 'type', this.value)">
          <option value="SAME_AIRLINE_OR_ALLIANCE" ${connection.type === 'SAME_AIRLINE_OR_ALLIANCE' ? 'selected' : ''}>
            Same airline / alliance (+$25 base)
          </option>
          <option value="INTERLINE" ${connection.type === 'INTERLINE' ? 'selected' : ''}>
            Interline — other carrier (+$100 base)
          </option>
        </select>
      </div>

      <div class="connection-field">
        <label>Transit discount % (airport assets)</label>
        <input type="number" min="0" max="50" value="${connection.transitDiscountPercent}"
               onchange="window.handleConnectionChange(${connectionIndex}, 'transitDiscountPercent', +this.value)">
      </div>
    </div>
  `;
}

export function renderLegs() {
  const container = document.getElementById('legs-container');
  container.innerHTML = '';

  const { legs, airports, connections } = state;

  for (let legIndex = 0; legIndex < legs.length; legIndex++) {
    // Connection strip between consecutive legs
    if (legIndex > 0) {
      const connectionElement = document.createElement('div');
      connectionElement.innerHTML = renderConnectionStrip(legIndex - 1, connections[legIndex - 1]);
      container.appendChild(connectionElement.firstElementChild);
    }

    const leg         = legs[legIndex];
    const originAirport      = airports[legIndex];
    const destinationAirport = airports[legIndex + 1];

    const legElement = document.createElement('div');
    legElement.className = 'leg-card';
    legElement.innerHTML = `
      <div class="leg-card-header">
        <span>Leg ${legIndex + 1} — ${originAirport.label || 'Origin'} → ${destinationAirport.label || 'Destination'}</span>
        <span class="leg-card-header-meta">${FLIGHT_TYPES[leg.flightTypeKey]?.label ?? leg.flightTypeKey} · ${leg.distance.toLocaleString()} km</span>
      </div>
      <div class="leg-card-body">
        <div class="airport-panel">
          ${renderAirportPanel(legIndex, originAirport)}
        </div>
        <div class="flight-panel">
          ${renderFlightPanel(legIndex, leg)}
        </div>
        <div class="airport-panel">
          ${renderAirportPanel(legIndex + 1, destinationAirport)}
        </div>
      </div>
    `;
    container.appendChild(legElement);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER ALL
// ─────────────────────────────────────────────────────────────────────────────
export function renderAll() {
  renderMeta();
  renderTable();
  renderLegs();
  renderPies();
}
