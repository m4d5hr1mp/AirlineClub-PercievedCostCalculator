// ─────────────────────────────────────────────────────────────────────────────
// RENDER COMPARISON — Trip Comparison page
// O-D focused: reference airline pinned at top, competing paths sorted below.
// ─────────────────────────────────────────────────────────────────────────────

import { loadNetwork, getAirlineName, getDirectRouteDistance } from './network.js';
import {
  computeAllPathResults,
  getReferencePathResult,
  computeDeltasVsReference,
  sortPathResults,
} from './comparison.js';
import {
  CABIN_CLASS_KEYS, CABIN_CLASSES,
  ARCHETYPE_IDS, ARCHETYPE_LABELS, ARCHETYPE_APPLICABLE_CLASSES, ARCHETYPE_COLORS,
} from './constants.js';

// Page-local state
let comparisonState = {
  fromIata:            '',
  toIata:              '',
  gcDistanceAuto:      true,
  gcDistanceOverride:  0,
  referenceAirlineId:  '',
  sortCabinClassKey:   'ECONOMY',
  sortArchetypeId:     'COMPREHENSIVE',
  expandedPathIndices: new Set(),
  allPathResults:      [],
  referencePathResult: null,
};

function getGcDistance(network) {
  if (!comparisonState.gcDistanceAuto) return comparisonState.gcDistanceOverride;
  const direct = getDirectRouteDistance(network, comparisonState.fromIata, comparisonState.toIata);
  return direct ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RENDER
// ─────────────────────────────────────────────────────────────────────────────
export function renderComparisonPage() {
  const network   = loadNetwork();
  const container = document.getElementById('page-comparison');

  container.innerHTML = `
    ${renderTopBar(network)}
    <div id="comparison-results">
      ${renderResults(network)}
    </div>
  `;
}

function renderTopBar(network) {
  const airlineOptions = network.airlines.map(a =>
    `<option value="${a.id}" ${comparisonState.referenceAirlineId === a.id ? 'selected' : ''}>${a.name}</option>`
  ).join('');

  const gcDist   = getGcDistance(network);
  const autoNote = comparisonState.gcDistanceAuto
    ? `auto: ${gcDist > 0 ? gcDist.toLocaleString() + ' km (direct route)' : 'no direct route — enter manually'}`
    : 'manual override';

  return `
    <div class="comparison-top-bar">
      <div class="comparison-od-row">
        <div class="comparison-field">
          <label>Origin</label>
          <input id="cmp-from" type="text" maxlength="4" value="${comparisonState.fromIata}"
                 class="comparison-iata-input uppercase-input"
                 onchange="window.comparisonSetFrom(this.value.toUpperCase())">
        </div>
        <button class="btn-flip-od" onclick="window.comparisonFlipOD()" title="Flip origin and destination">⇄</button>
        <div class="comparison-field">
          <label>Destination</label>
          <input id="cmp-to" type="text" maxlength="4" value="${comparisonState.toIata}"
                 class="comparison-iata-input uppercase-input"
                 onchange="window.comparisonSetTo(this.value.toUpperCase())">
        </div>
        <div class="comparison-field comparison-field-wide">
          <label>Reference Airline</label>
          <select id="cmp-ref-airline" onchange="window.comparisonSetReferenceAirline(this.value)">
            <option value="">— select reference —</option>
            ${airlineOptions}
          </select>
        </div>
        <button class="btn-comparison-compute" onclick="window.comparisonCompute()">Compute ▶</button>
      </div>
      <div class="comparison-gc-row">
        <label class="comparison-gc-label">
          <input type="checkbox" id="cmp-gc-auto" ${comparisonState.gcDistanceAuto ? 'checked' : ''}
                 onchange="window.comparisonSetGcAuto(this.checked)">
          O-D Great Circle Distance — auto
        </label>
        <input id="cmp-gc-input" type="number" min="50"
               value="${comparisonState.gcDistanceAuto ? gcDist || '' : comparisonState.gcDistanceOverride}"
               ${comparisonState.gcDistanceAuto ? 'disabled' : ''}
               class="comparison-gc-input"
               onchange="window.comparisonSetGcOverride(+this.value)">
        <span class="muted-note">${autoNote}</span>
      </div>
      <div class="comparison-sort-row">
        <label>Sort by</label>
        <select onchange="window.comparisonSetSortClass(this.value)">
          ${CABIN_CLASS_KEYS.map(k =>
            `<option value="${k}" ${comparisonState.sortCabinClassKey === k ? 'selected' : ''}>${CABIN_CLASSES[k].label}</option>`
          ).join('')}
        </select>
        <select onchange="window.comparisonSetSortArchetype(this.value)">
          ${ARCHETYPE_IDS.map(id =>
            `<option value="${id}" ${comparisonState.sortArchetypeId === id ? 'selected' : ''}>${ARCHETYPE_LABELS[id]}</option>`
          ).join('')}
        </select>
      </div>
    </div>
  `;
}

function renderResults(network) {
  const { allPathResults, referencePathResult, sortCabinClassKey, sortArchetypeId } = comparisonState;

  if (allPathResults.length === 0) {
    return `<div class="comparison-empty">Configure O-D pair and click Compute to find itineraries</div>`;
  }

  const sortedCompeting = sortPathResults(allPathResults, referencePathResult, sortCabinClassKey, sortArchetypeId);

  return `
    ${referencePathResult ? renderReferenceBlock(referencePathResult, network) : ''}
    <div class="competing-paths">
      ${sortedCompeting.map((result, index) =>
        renderCompetingRow(result, index, referencePathResult, network)
      ).join('')}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// REFERENCE BLOCK
// Always expanded. Full Class × Archetype matrix.
// ─────────────────────────────────────────────────────────────────────────────
function renderReferenceBlock(referenceResult, network) {
  const { sortCabinClassKey, sortArchetypeId, fromIata, toIata } = comparisonState;
  const airlineName  = getAirlineName(network, referenceResult.primaryAirlineId);
  const legSequence  = referenceResult.legSequence.join(' → ');

  return `
    <div class="reference-block">
      <div class="reference-block-header">
        <div class="reference-label">Reference</div>
        <div class="reference-airline">${airlineName}</div>
        <div class="reference-path">${legSequence}</div>
        <div class="reference-dist">${referenceResult.totalDistance.toLocaleString()} km</div>
      </div>
      ${renderCostMatrix(referenceResult.costMatrix, null, true)}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPETING ROW
// Collapsed: shows sort-combo cost + deltas.
// Expanded: shows full matrix with deltas.
// ─────────────────────────────────────────────────────────────────────────────
function renderCompetingRow(result, index, referenceResult, network) {
  const { sortCabinClassKey, sortArchetypeId, expandedPathIndices } = comparisonState;
  const isExpanded   = expandedPathIndices.has(index);
  const airlineNames = result.airlineNames.join(' / ');
  const legSequence  = result.legSequence.join(' → ');
  const sortCost     = result.costMatrix[sortCabinClassKey]?.[sortArchetypeId];
  const deltas       = referenceResult
    ? computeDeltasVsReference(result.costMatrix, referenceResult.costMatrix)
    : null;
  const sortDelta    = deltas?.[sortCabinClassKey]?.[sortArchetypeId];

  const collapsedRow = `
    <div class="competing-row-header" onclick="window.comparisonToggleRow(${index})">
      <span class="competing-expand-icon">${isExpanded ? '▾' : '▸'}</span>
      <span class="competing-airline">${airlineNames}</span>
      <span class="competing-path">${legSequence}</span>
      <span class="competing-dist muted-note">${result.totalDistance.toLocaleString()} km</span>
      <span class="competing-sort-cost">
        ${sortCost != null ? '$' + Math.round(sortCost).toLocaleString() : '—'}
      </span>
      ${sortDelta != null ? `
        <span class="competing-delta ${sortDelta.absoluteDelta < 0 ? 'delta-positive' : 'delta-negative'}">
          ${sortDelta.absoluteDelta >= 0 ? '+' : ''}$${Math.round(sortDelta.absoluteDelta).toLocaleString()}
          (${sortDelta.percentageDelta >= 0 ? '+' : ''}${sortDelta.percentageDelta.toFixed(1)}%)
        </span>
      ` : ''}
    </div>
  `;

  const expandedContent = isExpanded
    ? `<div class="competing-row-expanded">${renderCostMatrix(result.costMatrix, deltas, false)}</div>`
    : '';

  return `<div class="competing-row">${collapsedRow}${expandedContent}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// COST MATRIX TABLE
// Rows = cabin classes, columns = archetypes.
// isReference: highlight best cell per row, no deltas shown.
// deltas: if provided, show Δ$ and Δ% under each cost.
// ─────────────────────────────────────────────────────────────────────────────
function renderCostMatrix(costMatrix, deltas, isReference) {
  const applicableArchetypes = ARCHETYPE_IDS.filter(id =>
    CABIN_CLASS_KEYS.some(cls => ARCHETYPE_APPLICABLE_CLASSES[id].includes(cls))
  );

  const headerCells = applicableArchetypes.map(archetypeId => `
    <th style="color:${ARCHETYPE_COLORS[archetypeId]}">${ARCHETYPE_LABELS[archetypeId]}</th>
  `).join('');

  const bodyRows = CABIN_CLASS_KEYS.map(cabinClassKey => {
    // Find best cost in this row for highlighting
    const rowCosts = applicableArchetypes
      .filter(id => ARCHETYPE_APPLICABLE_CLASSES[id].includes(cabinClassKey))
      .map(id => costMatrix[cabinClassKey]?.[id] ?? Infinity);
    const bestCost = Math.min(...rowCosts);

    const cells = applicableArchetypes.map(archetypeId => {
      if (!ARCHETYPE_APPLICABLE_CLASSES[archetypeId].includes(cabinClassKey)) {
        return `<td class="matrix-cell-na">—</td>`;
      }

      const cost  = costMatrix[cabinClassKey]?.[archetypeId];
      const delta = deltas?.[cabinClassKey]?.[archetypeId];
      const isBest = isReference && cost != null && Math.abs(cost - bestCost) < 0.01;

      let deltaHtml = '';
      if (delta != null) {
        const sign        = delta.absoluteDelta >= 0 ? '+' : '';
        const colorClass  = delta.absoluteDelta < 0 ? 'delta-positive' : 'delta-negative';
        deltaHtml = `<div class="matrix-delta ${colorClass}">
          ${sign}$${Math.round(delta.absoluteDelta).toLocaleString()} (${sign}${delta.percentageDelta.toFixed(1)}%)
        </div>`;
      }

      return `
        <td class="matrix-cell ${isBest ? 'matrix-cell-best' : ''}">
          <div class="matrix-cost">${cost != null ? '$' + Math.round(cost).toLocaleString() : '—'}</div>
          ${deltaHtml}
        </td>
      `;
    }).join('');

    return `
      <tr>
        <td class="matrix-class-label">${CABIN_CLASSES[cabinClassKey].label}</td>
        ${cells}
      </tr>
    `;
  }).join('');

  return `
    <div class="matrix-wrap">
      <table class="cost-matrix-table">
        <thead>
          <tr>
            <th class="matrix-class-col">Class</th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW-EXPOSED EVENT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────
export function exposeComparisonHandlers() {

  window.comparisonSetFrom = (value) => {
    comparisonState.fromIata = value;
  };

  window.comparisonSetTo = (value) => {
    comparisonState.toIata = value;
  };

  window.comparisonFlipOD = () => {
    [comparisonState.fromIata, comparisonState.toIata] =
    [comparisonState.toIata,   comparisonState.fromIata];
    comparisonState.allPathResults      = [];
    comparisonState.referencePathResult = null;
    comparisonState.expandedPathIndices = new Set();
    renderComparisonPage();
  };

  window.comparisonSetReferenceAirline = (id) => {
    comparisonState.referenceAirlineId  = id;
  };

  window.comparisonSetGcAuto = (isAuto) => {
    comparisonState.gcDistanceAuto = isAuto;
    renderComparisonPage();
  };

  window.comparisonSetGcOverride = (value) => {
    comparisonState.gcDistanceOverride = value;
  };

  window.comparisonSetSortClass = (cabinClassKey) => {
    comparisonState.sortCabinClassKey   = cabinClassKey;
    comparisonState.expandedPathIndices = new Set();
    renderComparisonPage();
  };

  window.comparisonSetSortArchetype = (archetypeId) => {
    comparisonState.sortArchetypeId     = archetypeId;
    comparisonState.expandedPathIndices = new Set();
    renderComparisonPage();
  };

  window.comparisonCompute = () => {
    const network  = loadNetwork();
    const gcDist   = getGcDistance(network);

    if (!comparisonState.fromIata || !comparisonState.toIata) {
      alert('Enter both origin and destination IATA codes');
      return;
    }
    if (gcDist <= 0) {
      alert('No direct route found between these airports. Enter Great Circle Distance manually.');
      comparisonState.gcDistanceAuto = false;
      renderComparisonPage();
      return;
    }

    comparisonState.allPathResults = computeAllPathResults(
      comparisonState.fromIata,
      comparisonState.toIata,
      gcDist,
      network
    );

    comparisonState.referencePathResult = comparisonState.referenceAirlineId
      ? getReferencePathResult(
          comparisonState.allPathResults,
          comparisonState.referenceAirlineId,
          comparisonState.sortCabinClassKey,
          comparisonState.sortArchetypeId
        )
      : null;

    comparisonState.expandedPathIndices = new Set();

    // Re-render results section only (top bar stays)
    const network2 = loadNetwork();
    document.getElementById('comparison-results').innerHTML = renderResults(network2);
  };

  window.comparisonToggleRow = (index) => {
    if (comparisonState.expandedPathIndices.has(index)) {
      comparisonState.expandedPathIndices.delete(index);
    } else {
      comparisonState.expandedPathIndices.add(index);
    }
    // Re-render results only
    const network = loadNetwork();
    document.getElementById('comparison-results').innerHTML = renderResults(network);
  };
}
