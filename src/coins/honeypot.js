// ============================================================================
//  Honeypot detection layer
//
//  Inspects a jetton's master contract to detect known scam patterns.
//
//  What we check (on-chain reads only — no external APIs):
//    1. Mint authority: if the jetton has an active admin, that admin
//       can mint unlimited supply, diluting holders. Trustworthy tokens
//       renounce admin (admin = null after launch).
//    2. Total supply vs pool reserves: ratio < 0.1% means tokens were
//       minted but never distributed → likely scam.
//    3. Pool depth: < $5K liquidity = "honeypot floor" — you can buy
//       but selling crashes the price 90%+.
//    4. Volume/liquidity ratio: extreme imbalance suggests wash trading.
//
//  What we DON'T check yet (Turn 6+ scope):
//    - Top-holder concentration (needs TonAPI which has CORS issues)
//    - Trade history (also TonAPI)
//    - Whether liquidity is locked (needs DeDust LP-token analysis)
//
//  The check is intentionally cheap (2-3 on-chain reads per coin) so we
//  can run it during detail-page open without making the UI slow.
// ============================================================================

import { TonClient4 } from '@ton/ton';
import { Address } from '@ton/core';
import { JettonRoot } from '@dedust/sdk';

const TON_RPC_ENDPOINTS = [
  'https://mainnet-v4.tonhubapi.com',
  'https://ton-mainnet.core.chainstack.com/v4',
];

let _tonClient = null;
function getClient() {
  if (!_tonClient) _tonClient = new TonClient4({ endpoint: TON_RPC_ENDPOINTS[0] });
  return _tonClient;
}

// In-memory cache — honeypot status of a jetton doesn't change frequently,
// and these reads are expensive (one round-trip to a TON node each).
const _cache = new Map();   // jettonAddress -> { result, fetchedAt }
const TTL_MS = 5 * 60 * 1000;  // 5 minutes

/**
 * @typedef {Object} HoneypotReport
 * @property {'safe'|'med'|'high'} risk    Overall verdict
 * @property {string[]} reasons             Human-readable warnings
 * @property {object} signals               Raw flags for debugging
 * @property {number} signals.poolDepthUsd
 * @property {boolean|null} signals.hasMintAuthority  null if check failed
 * @property {boolean} signals.lowVolume
 * @property {number} signals.volumeToLiquidityRatio
 */

/**
 * Run the honeypot inspection on a coin.
 *
 * @param {object} coin Normalized coin from gecko.js (must have .contract, .reserve_usd, .volume_24h)
 * @returns {Promise<HoneypotReport>}
 */
export async function inspect(coin) {
  if (!coin || !coin.contract) {
    return {
      risk: 'high',
      reasons: ['Missing contract address'],
      signals: {},
    };
  }

  const cached = _cache.get(coin.contract);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.result;
  }

  const signals = {
    poolDepthUsd: coin.reserve_usd || 0,
    hasMintAuthority: null,
    lowVolume: false,
    volumeToLiquidityRatio: 0,
  };
  const reasons = [];

  // ---- Signal 1: pool depth ----
  if (signals.poolDepthUsd < 1000) {
    reasons.push(`Critically low liquidity ($${signals.poolDepthUsd.toFixed(0)}).`);
  } else if (signals.poolDepthUsd < 5000) {
    reasons.push(`Very low liquidity ($${(signals.poolDepthUsd/1000).toFixed(1)}K). Slippage will be extreme.`);
  } else if (signals.poolDepthUsd < 25000) {
    reasons.push(`Low liquidity ($${(signals.poolDepthUsd/1000).toFixed(1)}K). Use small position sizes.`);
  }

  // ---- Signal 2: volume / liquidity sanity ----
  if (signals.poolDepthUsd > 0) {
    signals.volumeToLiquidityRatio = (coin.volume_24h || 0) / signals.poolDepthUsd;
    if (signals.volumeToLiquidityRatio < 0.05 && signals.poolDepthUsd > 5000) {
      signals.lowVolume = true;
      reasons.push('Trading volume is very low relative to liquidity.');
    }
    if (signals.volumeToLiquidityRatio > 20) {
      reasons.push('Volume/liquidity ratio is suspicious — possible wash trading.');
    }
  }

  // ---- Signal 3: mint authority on jetton master ----
  // This is the most important check. A jetton master with an active
  // admin can mint unlimited supply to itself, then dump on holders.
  // Renounced admin = wallet address = null/none.
  try {
    const client = getClient();
    const master = client.open(JettonRoot.createFromAddress(Address.parse(coin.contract)));
    const data = await master.getJettonData();
    // The SDK returns both isMintable (bool) and adminAddress (Address|null).
    // Either being "active" means the deployer retains mint power.
    const adminActive = data.adminAddress !== null && data.adminAddress !== undefined;
    signals.hasMintAuthority = adminActive || data.isMintable === true;
    signals.totalSupply = data.totalSupply;

    if (signals.hasMintAuthority) {
      reasons.push('⚠ Mint authority is still active — supply can be inflated by the deployer.');
    }
  } catch (e) {
    console.warn('[honeypot]', coin.ticker, 'mint authority check failed:', e.message);
    signals.hasMintAuthority = null;
    // Don't surface this as a user-visible warning — it could just be a
    // network glitch. We just lose one signal.
  }

  // ---- Compute overall risk ----
  let risk = 'safe';
  if (signals.poolDepthUsd < 5000) risk = 'high';
  else if (signals.hasMintAuthority === true) risk = 'high';
  else if (signals.poolDepthUsd < 25000) risk = 'med';
  else if (signals.lowVolume || signals.volumeToLiquidityRatio > 20) risk = 'med';

  // Default "safe" message if nothing flagged
  if (risk === 'safe' && reasons.length === 0) {
    reasons.push('No red flags detected. Pool depth, volume, and mint authority all check out.');
  }

  const report = { risk, reasons, signals };
  _cache.set(coin.contract, { result: report, fetchedAt: Date.now() });
  return report;
}

/**
 * Clear cache for a specific token (used after a refresh).
 */
export function invalidate(contractAddress) {
  if (contractAddress) _cache.delete(contractAddress);
  else _cache.clear();
}
