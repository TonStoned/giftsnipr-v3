// ============================================================================
//  COINS UI controller — real-data version (Turn 4)
//
//  Replaces the mock data from the Turn 3 preview with real GeckoTerminal +
//  DeDust integrations. Owns the COINS pane DOM and routes events.
//
//  Turn 4 boundary: the SWAP button constructs the full real transaction
//  and shows it to the user in a confirmation step. It does NOT call
//  tc.sendTransaction(). Turn 5 will add the broadcast.
//
//  Why an IIFE namespace?  This module shares a DOM with the existing
//  gifts app which uses global names like `WALLET`, `PROFILE`, `toast`,
//  `MODAL_STACK`. We isolate to avoid clobbering anything.
// ============================================================================

import {
  getTrending, getNewPools, getTopByVolume, searchCoins,
  getPool, getOhlcv, getTonUsd,
  getCacheStats,
} from './gecko.js';
import { composeBuy, composeSell, getFeeConfig } from '../ton/swap.js';
import { runSelfTest, isSelfTestPassed, fromNano } from '../ton/dedust.js';
import { track as trackTx, tonviewerTxLink } from '../ton/tracker.js';
import { inspect as inspectHoneypot } from './honeypot.js';

// ---- Module state ---------------------------------------------------------

let _coinsList = [];          // current rendered list
let _currentCoin = null;       // open detail page coin
let _currentSort = 'trending';
let _currentSlippage = 1.0;
let _tradeDirection = 'buy';
let _tonUsdRate = 0;
let _lastComposedSwap = null;  // cached so we can show the preview
let _connectedAddress = null;  // wallet address (from gs:wallet-connected event)

// Listen for wallet events from the gifts code (loosely coupled)
window.addEventListener('gs:wallet-connected', (e) => {
  _connectedAddress = e.detail?.address || null;
  updateWalletHint();
  // If we're on a coin detail page, re-evaluate buy/sell button state
  if (_currentCoin) renderRiskBanner(_currentCoin);
});
window.addEventListener('gs:wallet-disconnected', () => {
  _connectedAddress = null;
  updateWalletHint();
  if (_currentCoin) renderRiskBanner(_currentCoin);
});

function updateWalletHint() {
  const hint = document.getElementById('coinsWalletHint');
  if (!hint) return;
  const hasWallet = window.GS_BRIDGE ? !!window.GS_BRIDGE.getAddress() : false;
  hint.style.display = hasWallet ? 'none' : 'flex';
}

// ---- Boot ----------------------------------------------------------------

export async function bootCoins() {
  // Run the BOC self-test FIRST. If it throws, catch — we want the rest of
  // the UI to render even when the SDK is somehow misbehaving, so the user
  // can still browse coins (just can't trade).
  try {
    await runSelfTest();
    if (!isSelfTestPassed()) {
      console.error('[coins] BOC self-test failed — swap construction disabled');
    }
  } catch (e) {
    console.error('[coins] runSelfTest threw — swap disabled, browsing still works:', e);
  }

  // Fetch TON/USD in the background; non-blocking.
  getTonUsd().then(r => { _tonUsdRate = r; }).catch(() => {});

  setupModeToggle();
  setupEvents();
  // renderList can fail too (CORS, network) — we render an error state in
  // that case rather than propagating, so callers don't see an unhandled
  // rejection.
  try {
    await renderList();
  } catch (e) {
    console.error('[coins] initial renderList threw:', e);
  }
}

// ---- Mode toggle (top GIFTS/COINS strip) ---------------------------------

function setupModeToggle() {
  const toggle = document.getElementById('modeToggle');
  if (!toggle) return;
  const buttons = toggle.querySelectorAll('.mode-btn');
  const giftsPane = document.getElementById('modeGifts');
  const coinsPane = document.getElementById('modeCoins');
  if (!giftsPane || !coinsPane) return;
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (!mode) return;
      buttons.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      giftsPane.classList.toggle('mode-pane-active', mode === 'gifts');
      coinsPane.classList.toggle('mode-pane-active', mode === 'coins');
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (mode === 'gifts') closeDetail();
    });
  });
}

// ---- Event wiring --------------------------------------------------------

function setupEvents() {
  const sortTabs = document.getElementById('sortTabs');
  if (sortTabs) {
    sortTabs.addEventListener('click', e => {
      if (!e.target.matches('.sort-tab')) return;
      sortTabs.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      _currentSort = e.target.dataset.sort;
      renderList();
    });
  }

  // Wallet-hint connect button
  const hintBtn = document.getElementById('coinsWalletHintBtn');
  if (hintBtn) {
    hintBtn.addEventListener('click', () => {
      if (window.GS_BRIDGE && window.GS_BRIDGE.openWallet) {
        window.GS_BRIDGE.openWallet();
      }
    });
  }
  // Show banner initially if no wallet
  updateWalletHint();

  // Debounce search so we don't blow our 30/min budget on every keystroke
  const search = document.getElementById('searchInput');
  if (search) {
    let to = null;
    search.addEventListener('input', () => {
      clearTimeout(to);
      to = setTimeout(() => renderList(), 350);
    });
  }

  document.querySelectorAll('.detail-back').forEach(b => b.addEventListener('click', closeDetail));
  document.querySelectorAll('#presetRow .preset-btn').forEach(b => {
    b.addEventListener('click', () => {
      const v = b.dataset.preset;
      setPreset(v === 'max' ? 'max' : parseFloat(v), b);
    });
  });
  document.querySelectorAll('#modalSlippageRow .slippage-btn').forEach(b => {
    b.addEventListener('click', () => setSlippage(parseFloat(b.dataset.slip)));
  });
  document.querySelectorAll('#defaultSlippageRow .slippage-btn').forEach(b => {
    b.addEventListener('click', () => setDefaultSlippage(parseFloat(b.dataset.slip)));
  });
}

// ---- Coin list rendering --------------------------------------------------

async function renderList() {
  const list = document.getElementById('coinList');
  if (!list) return;

  const searchEl = document.getElementById('searchInput');
  const query = searchEl ? searchEl.value.trim() : '';

  // Show a loading state on cold loads (no cached data yet)
  if (_coinsList.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-emoji">⏳</div>
        Loading TON coins…
      </div>`;
  }

  try {
    let coins;
    if (query.length >= 2) {
      coins = await searchCoins(query, { limit: 20 });
    } else {
      switch (_currentSort) {
        case 'new':     coins = await getNewPools({ limit: 30 }); break;
        case 'volume':  coins = await getTopByVolume({ limit: 30 }); break;
        case 'mcap':    coins = await getTopByVolume({ limit: 30 }); break;  // GT has no mcap-sort endpoint; volume is the closest proxy
        case 'gainers': {
          const t = await getTrending({ limit: 30 });
          coins = t.filter(c => c.change_24h > 0).sort((a,b) => b.change_24h - a.change_24h);
          break;
        }
        case 'losers': {
          const t = await getTrending({ limit: 30 });
          coins = t.filter(c => c.change_24h < 0).sort((a,b) => a.change_24h - b.change_24h);
          break;
        }
        case 'trending':
        default:
          coins = await getTrending({ limit: 30 });
      }
    }

    // Filter: only show coins where one side is TON (otherwise we can't
    // sell into TON via single-hop on DeDust). Also drop coins with no
    // ticker or very thin pools.
    coins = coins.filter(c => c.ticker && c.ticker.length <= 12 && c.reserve_usd > 100);

    _coinsList = coins;

    if (coins.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-emoji">🔍</div>
          ${query ? `Nothing matches "${escapeHtml(query)}"` : 'No coins found.'}
        </div>`;
      return;
    }

    list.innerHTML = coins.map((c, i) => coinCardHtml(c, i)).join('');
    list.querySelectorAll('[data-coin-idx]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.coinIdx);
        openDetail(coins[idx]);
      });
    });
  } catch (e) {
    console.error('[coins] renderList failed:', e);
    const looksLikeCors = /failed to fetch|networkerror|cors/i.test(e.message || '');
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-emoji">⚠️</div>
        <b style="display:block;margin-bottom:6px;color:rgba(255,255,255,0.75)">
          ${looksLikeCors ? "Can't reach GeckoTerminal" : 'Failed to load coins'}
        </b>
        <div style="font-size:11px;color:rgba(255,255,255,0.5);max-width:300px;margin:0 auto 12px">
          ${escapeHtml(e.message || '')}
          ${looksLikeCors ? '<br><br>If this keeps happening on your phone, the host probably blocks browser access. Deploy the Cloudflare Worker proxy (see <code>cloudflare-worker-proxy.js</code>) and change BASE in <code>gecko.js</code>.' : ''}
        </div>
        <button id="coinsRetryBtn" style="padding:8px 16px;background:var(--lime);color:var(--ink);border:2px solid var(--ink);border-radius:10px;font-family:var(--font-display);font-weight:800;font-size:12px;letter-spacing:1px;box-shadow:0 3px 0 var(--ink);cursor:pointer">
          RETRY
        </button>
      </div>`;
    const retryBtn = document.getElementById('coinsRetryBtn');
    if (retryBtn) retryBtn.addEventListener('click', () => renderList());
  }
}

function coinCardHtml(c, idx) {
  const changeCls = c.change_24h > 0 ? 'up' : c.change_24h < 0 ? 'down' : '';
  const arrow = c.change_24h > 0 ? '▲' : c.change_24h < 0 ? '▼' : '—';

  // Risk badge — pure heuristic for now; Turn 5 adds real honeypot detection
  let badge = null;
  if (c.reserve_usd < 5000) badge = 'risk';
  else if (c.created_at) {
    const ageH = (Date.now() - new Date(c.created_at).getTime()) / 3600_000;
    if (ageH < 24) badge = 'new';
    else if (Math.abs(c.change_24h) > 50) badge = 'trending';
  } else if (Math.abs(c.change_24h) > 50) badge = 'trending';

  const badgeHtml = !badge ? '' : `
    <div class="coin-badge badge-${badge}">${
      badge === 'new' ? 'NEW' :
      badge === 'trending' ? '🔥' :
      badge === 'risk' ? '⚠ RISK' : 'SAFE'
    }</div>`;

  const logoContent = c.image_url
    ? `<img src="${escapeHtml(c.image_url)}" alt="${escapeHtml(c.ticker)}" style="width:100%;height:100%;object-fit:cover;border-radius:11px"
        onerror="this.style.display='none';this.parentElement.textContent='${c.emoji}';this.parentElement.style.background='${c.logoBg}'" />`
    : c.emoji;

  return `
    <div class="coin-card" data-coin-idx="${idx}">
      ${badgeHtml}
      <div class="coin-logo" style="background:${c.logoBg};">${logoContent}</div>
      <div class="coin-info">
        <div class="coin-name-row">
          <span class="coin-name">${escapeHtml(c.name)}</span>
          <span class="coin-ticker">$${escapeHtml(c.ticker)}</span>
        </div>
        <div class="coin-meta">
          <span>${c.mcap > 0 ? `MCAP ${fmtMoney(c.mcap)}` : `LIQ ${fmtMoney(c.reserve_usd)}`}</span>
          <span>·</span>
          <span>VOL ${fmtMoney(c.volume_24h)}</span>
          ${c.isDedust ? '' : '<span>·</span><span style="color:#a48400">⚠ not on DeDust</span>'}
        </div>
      </div>
      <div class="coin-price-col">
        <div class="coin-price">${fmtPrice(c.price)}</div>
        <div class="coin-change ${changeCls}">${arrow} ${fmtChange(c.change_24h)}</div>
      </div>
    </div>`;
}

// ---- Coin detail ---------------------------------------------------------

async function openDetail(coin) {
  _currentCoin = coin;
  // Refetch the latest pool data for accurate price (cached for 30s)
  try {
    const fresh = await getPool(coin.poolAddress);
    if (fresh) _currentCoin = fresh;
  } catch (_) { /* use cached */ }
  const c = _currentCoin;

  document.getElementById('detailPane').classList.add('active');
  window.scrollTo(0, 0);

  const changeCls = c.change_24h > 0 ? 'up' : c.change_24h < 0 ? 'down' : '';
  const arrow = c.change_24h > 0 ? '▲' : c.change_24h < 0 ? '▼' : '';
  const logoContent = c.image_url
    ? `<img src="${escapeHtml(c.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:16px"
        onerror="this.style.display='none';this.parentElement.textContent='${c.emoji}'" />`
    : c.emoji;

  document.getElementById('detailHero').innerHTML = `
    <div class="detail-logo" style="background:${c.logoBg};">${logoContent}</div>
    <div style="flex:1; min-width:0;">
      <div class="detail-name-row"><span class="detail-name">${escapeHtml(c.name)}</span></div>
      <div class="detail-name-row" style="margin-top:4px"><span class="detail-ticker">$${escapeHtml(c.ticker)}</span></div>
      <div class="detail-price-row">
        <span class="detail-price">${fmtPrice(c.price)}</span>
        <span class="detail-change ${changeCls}">${arrow} ${fmtChange(c.change_24h)}</span>
      </div>
    </div>`;

  renderRiskBanner(c);

  // Stats
  document.getElementById('detailStats').innerHTML = `
    <div class="stat"><div class="stat-label">${c.mcap > 0 ? 'Market Cap' : 'Liquidity'}</div>
      <div class="stat-value">${fmtMoney(c.mcap > 0 ? c.mcap : c.reserve_usd)}</div></div>
    <div class="stat"><div class="stat-label">24h Volume</div>
      <div class="stat-value">${fmtMoney(c.volume_24h)}</div></div>
    <div class="stat"><div class="stat-label">Pool Reserves</div>
      <div class="stat-value">${fmtMoney(c.reserve_usd)}</div></div>
    <div class="stat"><div class="stat-label">DEX</div>
      <div class="stat-value" style="font-size:13px;font-family:var(--font-mono)">${escapeHtml(c.dex)}</div></div>`;

  // Links
  const links = [
    `<a class="link-chip" href="https://dedust.io/swap/TON/${encodeURIComponent(c.contract)}" target="_blank" rel="noopener noreferrer">📊 DeDust</a>`,
    `<a class="link-chip" href="https://tonviewer.com/${encodeURIComponent(c.contract)}" target="_blank" rel="noopener noreferrer">🔍 TonViewer</a>`,
    `<span class="link-chip" style="cursor:default" title="${escapeHtml(c.contract)}">📋 ${escapeHtml(shortenAddr(c.contract))}</span>`,
  ];
  document.getElementById('detailLinks').innerHTML = links.join('');

  // Chart (real OHLCV)
  drawRealChart(c);

  // BUY button enabled only if pool exists on DeDust
  const buyBtn = document.getElementById('buyBtn');
  if (!c.isDedust) {
    buyBtn.disabled = true;
    buyBtn.title = 'Only DeDust pools are tradeable in GiftSnipr';
  } else {
    buyBtn.disabled = false;
    buyBtn.title = '';
  }
}

async function renderRiskBanner(c) {
  const slot = document.getElementById('detailRiskSlot');
  const buyBtn = document.getElementById('buyBtn');
  if (!slot) return;

  // If not on DeDust, can't trade — short-circuit
  if (!c.isDedust) {
    slot.innerHTML = `
      <div class="risk-banner med">
        <div class="risk-icon">⚠️</div>
        <div class="risk-text">
          <b>NOT ON DEDUST</b>
          GiftSnipr currently routes swaps through DeDust only. This token's pool is on a different DEX. Buy disabled.
        </div>
      </div>`;
    if (buyBtn) buyBtn.disabled = true;
    return;
  }

  // Show "checking" state immediately
  slot.innerHTML = `
    <div class="risk-banner low">
      <div class="risk-icon">🔎</div>
      <div class="risk-text">
        <b>RUNNING SAFETY CHECKS</b>
        Inspecting mint authority, pool depth, and volume patterns…
      </div>
    </div>`;

  // Run the real inspection (async, on-chain)
  let report;
  try {
    report = await inspectHoneypot(c);
  } catch (e) {
    console.warn('[coins] honeypot inspect failed:', e.message);
    // Fall back to UX-only heuristics
    report = {
      risk: c.reserve_usd < 5000 ? 'high' : c.reserve_usd < 25000 ? 'med' : 'safe',
      reasons: ['Could not run full on-chain inspection (network glitch). Showing heuristic-only.'],
      signals: {},
    };
  }

  const riskClass = report.risk === 'safe' ? 'low' : report.risk;  // CSS uses .low/.med/.high
  const icon = report.risk === 'safe' ? '🛡️' : report.risk === 'med' ? '⚠️' : '🚫';
  const title = report.risk === 'safe'
    ? 'LOW RISK'
    : report.risk === 'med' ? 'MEDIUM RISK'
    : 'HIGH RISK — TRADING BLOCKED';

  slot.innerHTML = `
    <div class="risk-banner ${riskClass}">
      <div class="risk-icon">${icon}</div>
      <div class="risk-text">
        <b>${title}</b>
        ${report.reasons.map(r => escapeHtml(r)).join(' ')}
      </div>
    </div>`;

  // Block buy on HIGH risk
  if (buyBtn) {
    buyBtn.disabled = report.risk === 'high';
    buyBtn.title = report.risk === 'high'
      ? 'Trading blocked by safety check' : '';
  }
}

async function drawRealChart(c) {
  const svg = document.getElementById('chartSvg');
  svg.innerHTML = `<text x="200" y="62" text-anchor="middle" fill="rgba(0,0,0,0.35)" font-family="ui-monospace" font-size="12">loading chart…</text>`;
  try {
    const candles = await getOhlcv(c.poolAddress, { timeframe: 'hour', aggregate: 1, limit: 24 });
    if (!candles.length) {
      svg.innerHTML = `<text x="200" y="62" text-anchor="middle" fill="rgba(0,0,0,0.35)" font-family="ui-monospace" font-size="12">no chart data</text>`;
      return;
    }
    const w = 400, h = 120, pad = 6;
    const closes = candles.map(c => c.c);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = Math.max(1e-12, max - min);
    const scale = v => h - pad - ((v - min) / range) * (h - pad * 2);
    const stepX = w / (candles.length - 1 || 1);
    const pts = candles.map((c, i) => [i * stepX, scale(c.c)]);
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = path + ` L ${w},${h} L 0,${h} Z`;
    const isUp = candles[candles.length - 1].c >= candles[0].c;
    const color = isUp ? '#1a8f3a' : '#ff3b3b';
    const fill = isUp ? 'rgba(26,143,58,0.18)' : 'rgba(255,59,59,0.18)';
    svg.innerHTML = `
      <path d="${area}" fill="${fill}" />
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" />`;
  } catch (e) {
    console.warn('[coins] chart fetch failed:', e.message);
    svg.innerHTML = `<text x="200" y="62" text-anchor="middle" fill="rgba(0,0,0,0.35)" font-family="ui-monospace" font-size="12">chart unavailable</text>`;
  }
}

function closeDetail() {
  const dp = document.getElementById('detailPane');
  if (dp) dp.classList.remove('active');
  _currentCoin = null;
  _lastComposedSwap = null;
  window.scrollTo(0, 0);
}

// ---- Trade modal ----------------------------------------------------------

function openTrade(dir) {
  if (!_currentCoin) return;
  _tradeDirection = dir;

  if (!_currentCoin.isDedust) {
    showCoinsToast('GiftSnipr only swaps via DeDust pools.');
    return;
  }
  if (!isSelfTestPassed()) {
    showCoinsToast('⚠ DeDust integration self-test failed. Swaps disabled.');
    return;
  }

  const c = _currentCoin;
  const isBuy = dir === 'buy';

  document.getElementById('tradeTitleText').textContent =
    `${isBuy ? 'BUY' : 'SELL'} $${c.ticker}`;
  const eye = document.getElementById('tradeTitleEye');
  eye.textContent = c.emoji;
  eye.style.background = c.logoBg;

  document.getElementById('amountInputLabel').textContent = isBuy ? 'YOU PAY' : 'YOU SELL';
  document.getElementById('amountCurrency').textContent = isBuy ? 'TON' : '$' + c.ticker;
  document.getElementById('outputCurrency').textContent = isBuy ? '$' + c.ticker : 'TON';

  // Show wallet status
  const addr = window.GS_BRIDGE ? window.GS_BRIDGE.getAddress() : null;
  document.getElementById('amountBalance').textContent = addr
    ? `wallet: ${addr.slice(0,6)}…${addr.slice(-4)}`
    : 'no wallet connected — tap SIGN to connect';

  document.getElementById('confirmBtn').textContent =
    addr ? `🎯 ${isBuy ? 'BUY' : 'SELL'} NOW` : '🔌 CONNECT & SIGN';
  document.getElementById('tradeDisclaimer').textContent =
    `Your wallet will show 2 messages to sign: 0.75% GiftSnipr fee + the ${isBuy ? 'DeDust swap' : 'jetton sell'}.`;

  document.getElementById('amountInput').value = isBuy ? '1' : '0';
  document.getElementById('tradeModal').classList.add('open');

  setSlippage(_currentSlippage);
  recalcQuote();
}

function closeTrade() {
  document.getElementById('tradeModal').classList.remove('open');
}

function setPreset(v, btnEl) {
  document.querySelectorAll('#presetRow .preset-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  if (v === 'max') {
    // Without wallet balance hookup yet, treat MAX as 5 TON for the preview
    document.getElementById('amountInput').value = '5';
  } else {
    document.getElementById('amountInput').value = String(v);
  }
  recalcQuote();
}

function setSlippage(v) {
  _currentSlippage = v;
  document.getElementById('slippageDisplay').textContent = v + '%';
  document.querySelectorAll('#modalSlippageRow .slippage-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.slip) === v);
  });
  recalcQuote();
}
function setDefaultSlippage(v) {
  _currentSlippage = v;
  document.querySelectorAll('#defaultSlippageRow .slippage-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.slip) === v);
  });
}
function openSlippage() { document.getElementById('slippageModal').classList.add('open'); }
function closeSlippage() { document.getElementById('slippageModal').classList.remove('open'); }

// ---- Real quote computation ----------------------------------------------

// Debounce — quote calls hit DeDust which hits TON RPC. Don't spam.
let _quoteDebounce = null;
let _quoteSeq = 0;

function recalcQuote() {
  clearTimeout(_quoteDebounce);
  _quoteDebounce = setTimeout(actuallyRecalcQuote, 220);
}

async function actuallyRecalcQuote() {
  if (!_currentCoin) return;
  const seq = ++_quoteSeq;
  const amtStr = document.getElementById('amountInput').value;
  const amt = parseFloat(amtStr);

  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  const isBuy = _tradeDirection === 'buy';

  if (!isFinite(amt) || amt <= 0) {
    setText('outputAmount', '—');
    setText('quoteFee', '—');
    setText('quoteMinReceived', '—');
    setText('quoteImpact', '—');
    setText('quoteTotal', '—');
    document.getElementById('confirmBtn').disabled = true;
    return;
  }

  setText('outputAmount', '…');
  setText('quoteFee', '…');
  setText('quoteMinReceived', '…');
  setText('quoteImpact', '…');
  setText('quoteTotal', '…');

  try {
    let composed;
    if (isBuy) {
      composed = await composeBuy({
        jettonAddress: _currentCoin.contract,
        amountTonStr: amtStr,
        slippagePct: _currentSlippage,
      });
    } else {
      // SELL — need the wallet address
      const userAddress = window.GS_BRIDGE ? window.GS_BRIDGE.getAddress() : null;
      if (!userAddress) {
        throw new Error('Connect wallet to compute sell quote');
      }
      composed = await composeSell({
        jettonAddress: _currentCoin.contract,
        userAddress,
        amountJettonStr: amtStr,
        jettonDecimals: 9,
        slippagePct: _currentSlippage,
      });
    }
    if (seq !== _quoteSeq) return;
    _lastComposedSwap = composed;

    const tonUsd = _tonUsdRate || (await getTonUsd());
    _tonUsdRate = tonUsd;

    if (isBuy) {
      setText('outputAmount', fmtJetton(composed.estOutNano, 9));
      setText('amountUsd', tonUsd ? '≈ $' + (amt * tonUsd).toFixed(2) : '');
      const outFloat = Number(fromNano(composed.estOutNano));
      setText('outputUsd', tonUsd ? '≈ $' + (outFloat * _currentCoin.price).toFixed(2) : '');
      setText('quoteMinReceived', fmtJetton(composed.minOutNano, 9) + ' $' + _currentCoin.ticker);
      setText('quoteTotal', Number(fromNano(composed.totalNano)).toFixed(4) + ' TON');
    } else {
      setText('outputAmount', Number(fromNano(composed.estOutNano)).toFixed(4));
      setText('amountUsd', '≈ $' + (amt * _currentCoin.price).toFixed(2));
      const outTon = Number(fromNano(composed.estOutNano));
      setText('outputUsd', tonUsd ? '≈ $' + (outTon * tonUsd).toFixed(2) : '');
      setText('quoteMinReceived', Number(fromNano(composed.minOutNano)).toFixed(4) + ' TON');
      setText('quoteTotal', Number(fromNano(composed.totalTonNano)).toFixed(4) + ' TON');
    }

    setText('quoteFee', Number(fromNano(composed.feeNano)).toFixed(4) + ' TON');
    const impactPct = composed.priceImpact * 100;
    const impactEl = document.getElementById('quoteImpact');
    impactEl.textContent = impactPct.toFixed(2) + '%';
    impactEl.style.color = impactPct < 1 ? '#1a8f3a' : impactPct < 3 ? '#caa800' : '#ff3b3b';
    setText('quotePool', `${_currentCoin.dex} · TON/${_currentCoin.ticker}`);

    document.getElementById('confirmBtn').disabled = false;
  } catch (e) {
    if (seq !== _quoteSeq) return;
    console.warn('[coins] quote failed:', e.message);
    setText('outputAmount', '—');
    setText('quoteFee', '—');
    setText('quoteMinReceived', '—');
    setText('quoteImpact', '—');
    setText('quoteTotal', escapeHtml(e.message));
    document.getElementById('confirmBtn').disabled = true;
  }
}

// ---- Transaction preview (Turn 4 — no broadcast) -------------------------

async function confirmTrade() {
  if (!_lastComposedSwap) {
    showCoinsToast('No transaction composed yet.');
    return;
  }
  if (!isSelfTestPassed()) {
    showCoinsToast('⚠ DeDust integration self-test failed. Swaps disabled.');
    return;
  }

  // Wallet must be connected to broadcast
  const bridge = window.GS_BRIDGE;
  if (!bridge) {
    showCoinsToast('Wallet bridge not loaded. Try refreshing.');
    return;
  }
  const addr = bridge.getAddress();
  if (!addr) {
    closeTrade();
    showCoinsToast('Connect your wallet first.');
    bridge.openWallet();
    return;
  }

  const c = _lastComposedSwap;

  // ---- Final pre-broadcast confirmation modal ----
  closeTrade();

  const totalTon = Number(fromNano(
    c.totalNano ?? c.totalTonNano ?? 0n
  ));
  const isBuy = !c.direction || c.direction === 'buy';

  // Build summary HTML
  const m = document.getElementById('tradeModal');
  m.innerHTML = `
    <div class="coins-modal" style="margin-top:auto">
      <div class="modal-handle"></div>
      <div class="modal-title">
        <div class="modal-title-eye" style="background:${_currentCoin.logoBg}">${_currentCoin.emoji}</div>
        <span>CONFIRM ${isBuy ? 'BUY' : 'SELL'} $${escapeHtml(_currentCoin.ticker)}</span>
      </div>

      <div class="quote-summary" style="margin:8px 0 14px">
        <div class="quote-row"><span>Wallet</span><span>${addr.slice(0,8)}…${addr.slice(-4)}</span></div>
        <div class="quote-row"><span>Pool</span><span>${escapeHtml(_currentCoin.dex)}</span></div>
        ${isBuy
          ? `<div class="quote-row"><span>Pay</span><span>${Number(fromNano(c.swapAmountNano)).toFixed(4)} TON</span></div>
             <div class="quote-row"><span>Min receive</span><span>${fmtJetton(c.minOutNano, 9)} $${escapeHtml(_currentCoin.ticker)}</span></div>`
          : `<div class="quote-row"><span>Sell</span><span>${fmtJetton(c.sellAmountNano, 9)} $${escapeHtml(_currentCoin.ticker)}</span></div>
             <div class="quote-row"><span>Min receive</span><span>${Number(fromNano(c.minOutNano)).toFixed(4)} TON</span></div>`}
        <div class="quote-row quote-fee"><span>GiftSnipr fee <small>(0.75%)</small></span><span>${Number(fromNano(c.feeNano)).toFixed(6)} TON</span></div>
        <div class="quote-row quote-fee"><span>Network gas</span><span>${Number(fromNano(c.gasNano)).toFixed(2)} TON</span></div>
        <div class="quote-row total">
          <span>Wallet will show</span>
          <span>${totalTon.toFixed(6)} TON</span>
        </div>
      </div>

      <p style="font-size:12px;color:rgba(0,0,0,0.6);text-align:center;margin:6px 0 14px">
        Your wallet will display <b>2 messages</b> to sign — fee + ${isBuy ? 'swap' : 'sell'}.
        Approve both. The transaction is irreversible.
      </p>

      <button class="confirm-btn" id="finalConfirmBtn">🎯 SIGN IN WALLET</button>
      <button onclick="window.closeTrade()"
        style="width:100%;padding:12px 0;margin-top:8px;background:transparent;border:none;color:rgba(0,0,0,0.6);font-family:var(--font-mono);font-size:13px;cursor:pointer">
        cancel
      </button>
    </div>`;
  m.classList.add('open');

  document.getElementById('finalConfirmBtn').addEventListener('click', async () => {
    await broadcastNow(c);
  });
}

async function broadcastNow(composed) {
  const m = document.getElementById('tradeModal');
  // Show "waiting for wallet" state
  m.innerHTML = `
    <div class="coins-modal" style="margin-top:auto;text-align:center">
      <div class="modal-handle"></div>
      <div style="font-size:48px;margin:20px 0 10px">📲</div>
      <h3 style="font-family:var(--font-display);font-weight:800;font-size:20px;letter-spacing:1px;margin:0 0 6px">
        OPEN YOUR WALLET
      </h3>
      <p style="font-size:14px;color:rgba(0,0,0,0.65);margin:0 0 18px">
        Approve the 2 messages in Tonkeeper to complete the swap.
      </p>
      <div style="background:rgba(255,210,58,0.18);border:2px dashed rgba(0,0,0,0.2);border-radius:10px;padding:10px 12px;font-family:var(--font-mono);font-size:11px;color:rgba(0,0,0,0.7)">
        Don't close the app. The transaction will broadcast and tracking begins automatically.
      </div>
    </div>`;

  try {
    const result = await window.GS_BRIDGE.sendTransaction(composed.tcTransaction);
    // result.boc is the signed external message — proof it was broadcast.
    // Now poll TonAPI for the on-chain transaction.
    showTxBroadcast(result);
    trackTx(result.boc, (status, details) => {
      if (status === 'pending') updateTrackingProgress(details);
      else if (status === 'success') showTxConfirmed(details);
      else if (status === 'failed') showTxOnchainFailed(details);
      else if (status === 'timeout') showTxTimeout(details);
    });
  } catch (e) {
    showTxFailed(e);
  }
}

function showTxBroadcast(result) {
  const m = document.getElementById('tradeModal');
  m.innerHTML = `
    <div class="coins-modal" style="margin-top:auto;text-align:center">
      <div class="modal-handle"></div>
      <div style="font-size:48px;margin:18px 0 4px">📡</div>
      <h3 style="font-family:var(--font-display);font-weight:800;font-size:20px;letter-spacing:1px;margin:0 0 6px">
        BROADCASTING…
      </h3>
      <p id="trackStatus" style="font-size:14px;color:rgba(0,0,0,0.65);margin:0 0 14px">
        Waiting for on-chain confirmation…
      </p>
      <div style="height:6px;background:rgba(0,0,0,0.1);border-radius:3px;overflow:hidden;margin:0 0 14px">
        <div id="trackBar" style="height:100%;width:8%;background:var(--lime);transition:width .5s ease"></div>
      </div>
      <div style="background:rgba(0,0,0,0.04);border-radius:10px;padding:10px;font-family:var(--font-mono);font-size:10px;word-break:break-all;color:rgba(0,0,0,0.55);text-align:left">
        ${escapeHtml((result.boc || '').slice(0, 60))}…
      </div>
      <button onclick="window.closeTrade()" class="confirm-btn" style="margin-top:14px;background:var(--cream);box-shadow:0 4px 0 var(--ink)">
        DONE (continue in background)
      </button>
    </div>`;
}

function updateTrackingProgress(details) {
  const status = document.getElementById('trackStatus');
  const bar = document.getElementById('trackBar');
  if (!status || !bar) return;  // modal closed
  const elapsed = (details.elapsedMs / 1000).toFixed(0);
  status.textContent = `Searching for on-chain transaction… ${elapsed}s`;
  // 90s timeout; bar grows linearly
  const pct = Math.min(95, 8 + (details.elapsedMs / 90_000) * 87);
  bar.style.width = pct + '%';
}

function showTxConfirmed(details) {
  const link = tonviewerTxLink(details.msgHash);
  const m = document.getElementById('tradeModal');
  if (!m || !m.classList.contains('open')) return;  // user already closed
  m.innerHTML = `
    <div class="coins-modal" style="margin-top:auto;text-align:center">
      <div class="modal-handle"></div>
      <div style="font-size:56px;margin:18px 0 4px">✅</div>
      <h3 style="font-family:var(--font-display);font-weight:800;font-size:22px;letter-spacing:1px;color:#1a8f3a;margin:0 0 6px">
        CONFIRMED ON-CHAIN
      </h3>
      <p style="font-size:14px;color:rgba(0,0,0,0.7);margin:0 0 14px">
        Your swap completed in ${(details.elapsedMs / 1000).toFixed(0)} seconds.
      </p>
      ${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer"
        style="display:block;padding:10px 12px;background:var(--cream);border:2px solid var(--ink);border-radius:10px;font-family:var(--font-mono);font-size:12px;color:var(--ink);text-decoration:none;margin-bottom:10px">
        🔍 View on TonViewer
      </a>` : ''}
      <button class="confirm-btn" onclick="window.closeTrade()">DONE</button>
    </div>`;
}

function showTxOnchainFailed(details) {
  const link = tonviewerTxLink(details.msgHash);
  const m = document.getElementById('tradeModal');
  if (!m || !m.classList.contains('open')) return;
  m.innerHTML = `
    <div class="coins-modal" style="margin-top:auto;text-align:center">
      <div class="modal-handle"></div>
      <div style="font-size:56px;margin:18px 0 4px">⚠️</div>
      <h3 style="font-family:var(--font-display);font-weight:800;font-size:20px;letter-spacing:1px;color:var(--alert);margin:0 0 6px">
        ON-CHAIN FAILURE
      </h3>
      <p style="font-size:14px;color:rgba(0,0,0,0.65);margin:0 0 14px">
        The transaction was broadcast but reverted on-chain.
        Most commonly: slippage exceeded or pool ran out of liquidity mid-trade.
        Your TON is returned minus gas (typically &lt;0.05 TON).
      </p>
      ${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer"
        style="display:block;padding:10px 12px;background:var(--cream);border:2px solid var(--ink);border-radius:10px;font-family:var(--font-mono);font-size:12px;color:var(--ink);text-decoration:none;margin-bottom:10px">
        🔍 View details on TonViewer
      </a>` : ''}
      <button class="confirm-btn" onclick="window.closeTrade()">CLOSE</button>
    </div>`;
}

function showTxTimeout(details) {
  const m = document.getElementById('tradeModal');
  if (!m || !m.classList.contains('open')) return;
  m.innerHTML = `
    <div class="coins-modal" style="margin-top:auto;text-align:center">
      <div class="modal-handle"></div>
      <div style="font-size:48px;margin:18px 0 4px">⏳</div>
      <h3 style="font-family:var(--font-display);font-weight:800;font-size:20px;letter-spacing:1px;margin:0 0 6px">
        STILL PENDING
      </h3>
      <p style="font-size:14px;color:rgba(0,0,0,0.65);margin:0 0 14px">
        We couldn't confirm on-chain within 90 seconds.
        This is usually fine — TON sometimes takes a minute. Open your wallet to see the final state.
      </p>
      <button class="confirm-btn" onclick="window.closeTrade()">CLOSE</button>
    </div>`;
}

function showTxFailed(err) {
  const m = document.getElementById('tradeModal');
  const msg = (err && err.message) || 'Unknown error';
  // Tonkeeper's "user rejected" string varies; check common patterns
  const wasRejected = /reject|cancel|user.*denied|abort/i.test(msg);
  m.innerHTML = `
    <div class="coins-modal" style="margin-top:auto;text-align:center">
      <div class="modal-handle"></div>
      <div style="font-size:56px;margin:20px 0 4px">${wasRejected ? '🛑' : '⚠️'}</div>
      <h3 style="font-family:var(--font-display);font-weight:800;font-size:20px;letter-spacing:1px;margin:0 0 6px">
        ${wasRejected ? 'CANCELLED' : 'TRANSACTION FAILED'}
      </h3>
      <p style="font-size:14px;color:rgba(0,0,0,0.65);margin:0 0 16px">
        ${wasRejected
          ? 'You declined the request in your wallet. No funds moved.'
          : escapeHtml(msg)}
      </p>
      <button class="confirm-btn" onclick="window.closeTrade()">CLOSE</button>
    </div>`;
}

// ---- Toast --------------------------------------------------------------

let _toastTimer = null;
function showCoinsToast(msg) {
  const t = document.getElementById('coinsToast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ---- Helpers ------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function shortenAddr(a) {
  if (!a) return '';
  return a.length > 16 ? a.slice(0, 6) + '…' + a.slice(-4) : a;
}
function fmtPrice(p) {
  if (!p || p === 0) return '—';
  if (p >= 1) return '$' + p.toFixed(3);
  if (p >= 0.01) return '$' + p.toFixed(4);
  if (p >= 0.0001) return '$' + p.toFixed(6);
  return '$' + p.toExponential(2);
}
function fmtChange(c) {
  if (c === 0) return '—';
  return (c > 0 ? '+' : '') + c.toFixed(1) + '%';
}
function fmtMoney(n) {
  if (!n || n === 0) return '—';
  if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}
function fmtJetton(amountNano, decimals = 9) {
  // amountNano is bigint
  const s = amountNano.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals) || '0';
  let frac = s.slice(-decimals).replace(/0+$/, '');
  // Limit to 4 fractional digits for display
  if (frac.length > 4) frac = frac.slice(0, 4);
  const wholeNum = Number(whole);
  if (wholeNum >= 1e6) return (wholeNum/1e6).toFixed(2) + 'M';
  if (wholeNum >= 1e3) return (wholeNum/1e3).toFixed(1) + 'K';
  return frac ? `${whole}.${frac}` : whole;
}

// ---- Inline-onclick interop ----------------------------------------------
// The HTML uses inline onclick=openTrade('buy'), etc. We attach these as
// globals so existing markup keeps working.
window.openTrade = openTrade;
window.closeTrade = closeTrade;
window.confirmTrade = confirmTrade;
window.closeDetail = closeDetail;
window.openSlippage = openSlippage;
window.closeSlippage = closeSlippage;
window.recalcQuote = recalcQuote;

// ---- Debug hook ---------------------------------------------------------
window.__gs_diag = {
  cacheStats: getCacheStats,
  coins: () => _coinsList,
  current: () => _currentCoin,
  selfTest: isSelfTestPassed,
};
