// ─────────────────────────────────────────────────────────────────────────────
// APP — entry point
// Handles page routing (Calculator / Network Inputs / Trip Comparison),
// wires all event handlers for the calculator page, and delegates to
// render-network.js and render-comparison.js for the other pages.
// ─────────────────────────────────────────────────────────────────────────────

import {
  state, mutateLeg, mutateAirport, mutateConnection,
  addLeg, removeLeg, setOdDistanceAuto, setOdDistanceOverride,
  setPieClass, addAssetToAirport, removeAssetFromAirport, mutateAsset,
} from './state.js';

import { renderAll, renderPies } from './render.js';
import { renderNetworkPage, exposeNetworkHandlers } from './render-network.js';
import { renderComparisonPage, exposeComparisonHandlers } from './render-comparison.js';

// ─────────────────────────────────────────────────────────────────────────────
// PAGE ROUTING
// ─────────────────────────────────────────────────────────────────────────────
const PAGES = ['calculator', 'network', 'comparison'];
let activePage = 'calculator';

function navigateTo(pageId) {
  activePage = pageId;
  for (const id of PAGES) {
    const el = document.getElementById('page-' + id);
    if (el) el.style.display = id === pageId ? 'block' : 'none';
  }
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === pageId);
  });
  if      (pageId === 'calculator')  renderAll();
  else if (pageId === 'network')     renderNetworkPage();
  else if (pageId === 'comparison')  renderComparisonPage();
}

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => navigateTo(tab.dataset.page));
});

// ─────────────────────────────────────────────────────────────────────────────
// CALCULATOR PAGE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────
window.handleLegChange = (legIndex, fieldName, value) => { mutateLeg(legIndex, fieldName, value); renderAll(); };
window.handleLegPriceChange = (legIndex, cabinClassKey, price) => { mutateLeg(legIndex, 'priceByClass', { cabinClassKey, price }); renderAll(); };
window.handleAirportChange = (airportIndex, fieldName, value) => { if (fieldName !== 'label') value = +value; mutateAirport(airportIndex, fieldName, value); renderAll(); };
window.handleConnectionChange = (connectionIndex, fieldName, value) => { if (fieldName === 'airportHotelLevel') value = +value; mutateConnection(connectionIndex, fieldName, value); renderAll(); };
window.handleAddAsset = (airportIndex, selectElement) => { const k = selectElement.value; if (!k) return; addAssetToAirport(airportIndex, k); renderAll(); };
window.handleRemoveAsset = (airportIndex, assetIndex) => { removeAssetFromAirport(airportIndex, assetIndex); renderAll(); };
window.handleAssetChange = (airportIndex, assetIndex, fieldName, value) => { mutateAsset(airportIndex, assetIndex, fieldName, value); renderAll(); };
window.handlePieClassChange = (target, cabinClassKey, buttonElement) => {
  setPieClass(target, cabinClassKey);
  buttonElement.closest('.pie-class-tabs').querySelectorAll('button').forEach(b => b.classList.remove('active'));
  buttonElement.classList.add('active');
  renderPies();
};

document.getElementById('button-add-leg').addEventListener('click', () => { addLeg(); renderAll(); });
document.getElementById('button-remove-leg').addEventListener('click', () => { removeLeg(); renderAll(); });
document.getElementById('od-distance-auto-checkbox').addEventListener('change', function() { setOdDistanceAuto(this.checked); renderAll(); });
document.getElementById('od-distance-input').addEventListener('change', function() { if (!state.odDistanceAuto) { setOdDistanceOverride(+this.value); renderAll(); } });

// ─────────────────────────────────────────────────────────────────────────────
// EXPOSE HANDLERS AND INIT
// ─────────────────────────────────────────────────────────────────────────────
exposeNetworkHandlers();
exposeComparisonHandlers();
navigateTo('calculator');
