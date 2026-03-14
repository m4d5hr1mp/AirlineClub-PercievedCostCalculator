// ─────────────────────────────────────────────────────────────────────────────
// APP — entry point
// Imports state mutations and render, wires all event handlers, calls initial render.
// Dynamic inline event handlers in render.js use window.handle* — those are
// attached here so they survive re-renders.
// ─────────────────────────────────────────────────────────────────────────────

import {
  state,
  mutateLeg,
  mutateAirport,
  mutateConnection,
  addLeg,
  removeLeg,
  setOdDistanceAuto,
  setOdDistanceOverride,
  setPieClass,
} from '../state.js';

import { renderAll, renderPies } from '../render.js';

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW-EXPOSED HANDLERS
// Used by inline event handlers in dynamically generated HTML (render.js).
// Mutation + re-render happen together here.
// ─────────────────────────────────────────────────────────────────────────────

window.handleLegChange = function(legIndex, fieldName, value) {
  mutateLeg(legIndex, fieldName, value);
  renderAll();
};

// Separate handler for per-class prices to keep the call site readable
window.handleLegPriceChange = function(legIndex, cabinClassKey, price) {
  mutateLeg(legIndex, 'priceByClass', { cabinClassKey, price });
  renderAll();
};

window.handleAirportChange = function(airportIndex, fieldName, value) {
  if (fieldName !== 'label') value = +value;
  mutateAirport(airportIndex, fieldName, value);
  renderAll();
};

window.handleConnectionChange = function(connectionIndex, fieldName, value) {
  if (fieldName === 'transitDiscountPercent') value = +value;
  mutateConnection(connectionIndex, fieldName, value);
  renderAll();
};

window.handlePieClassChange = function(target, cabinClassKey, buttonElement) {
  setPieClass(target, cabinClassKey);

  // Update active tab styling within that pie panel
  const tabGroup = buttonElement.closest('.pie-class-tabs');
  tabGroup.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
  buttonElement.classList.add('active');

  renderPies();
};

// ─────────────────────────────────────────────────────────────────────────────
// STATIC DOM EVENT LISTENERS
// For elements that exist in the HTML skeleton from the start.
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('button-add-leg').addEventListener('click', () => {
  addLeg();
  renderAll();
});

document.getElementById('button-remove-leg').addEventListener('click', () => {
  removeLeg();
  renderAll();
});

document.getElementById('od-distance-auto-checkbox').addEventListener('change', function() {
  setOdDistanceAuto(this.checked);
  renderAll();
});

document.getElementById('od-distance-input').addEventListener('change', function() {
  if (!state.odDistanceAuto) {
    setOdDistanceOverride(+this.value);
    renderAll();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL RENDER
// ─────────────────────────────────────────────────────────────────────────────
renderAll();
