// ============================================================================
//  GiftSnipr v0.3 — boot orchestrator (Turn 4)
//
//  Responsibilities:
//   1. Bundle all CSS via Vite
//   2. Inject the gifts-app body HTML into the GIFTS mode pane
//   3. Inject the COINS body HTML into the COINS mode pane
//   4. Boot the gifts app (its existing init runs)
//   5. Boot the COINS UI module (wires real GeckoTerminal + DeDust)
//
//  The COINS UI module owns the GIFTS/COINS toggle now since it knows
//  when to close detail panes / cancel quote polling.
// ============================================================================

import './styles/main.css';
import './styles/v3-toggle.css';
import './styles/coins.css';

import giftsBodyHtml from './gifts/body.html?raw';
import coinsBodyHtml from './coins/body.html?raw';

// ----------------------------------------------------------------------------
// 1. Inject the gifts body HTML into the GIFTS mode pane
// ----------------------------------------------------------------------------

const giftsPane = document.getElementById('modeGifts');
if (giftsPane) {
  giftsPane.innerHTML = giftsBodyHtml;
} else {
  console.error('[boot] #modeGifts pane not found');
}

// ----------------------------------------------------------------------------
// 2. Inject the COINS body HTML into the COINS mode pane
// ----------------------------------------------------------------------------

const coinsPane = document.getElementById('modeCoins');
if (coinsPane) {
  coinsPane.innerHTML = coinsBodyHtml;
} else {
  console.error('[boot] #modeCoins pane not found');
}

// ----------------------------------------------------------------------------
// 3. Boot the gifts app — its IIFEs run on import and bind to its DOM nodes
// ----------------------------------------------------------------------------

import('./gifts/app.js').catch((e) => {
  console.error('[boot] gifts app failed to load', e);
});

// ----------------------------------------------------------------------------
// 4. Boot the COINS UI module — real data + real DeDust integration
// ----------------------------------------------------------------------------

import('./coins/ui.js').then((mod) => {
  return mod.bootCoins();
}).catch((e) => {
  console.error('[boot] coins ui failed to load', e);
});
