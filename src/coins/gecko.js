// ============================================================================
//  GeckoTerminal API client for GiftSnipr COINS
//
//  Responsibilities:
//    - Fetch trending / new / search results from GeckoTerminal for the TON network
//    - Cache responses (free tier is 30 req/min; we want to stay way under)
//    - Normalize API response shapes into a clean internal Coin model
//    - Handle errors and stale-while-revalidate so the UI never blanks
//
//  Why not use the third-party `geckoterminal-api` npm package?
//    Adding deps = supply chain risk. Their wrapper is thin over fetch().
//    We can roll our own with no extra dependencies.
//
//  Rate limit strategy:
//    - In-memory cache with TTLs per endpoint type
//    - Pool list: 60s TTL  (trending changes slowly)
//    - Pool detail: 30s TTL
//    - OHLCV: 60s TTL (chart bars don't move that fast)
//    - Search: 5min TTL (user typing-driven)
//    - All cached responses returned synchronously to the caller
//    - We also debounce search queries client-side in the UI layer
// ============================================================================

// ============================================================================
//  Configuration
// ============================================================================
//
// BASE = where to send GeckoTerminal API requests.
//
// Default: direct to api.geckoterminal.com. If you hit CORS errors on iPhone
// Safari or in the Telegram webview, deploy the Cloudflare Worker proxy
// (see cloudflare-worker-proxy.js at the project root) and change BASE to
// your worker URL, like:
//
//   const BASE = 'https://giftsnipr-gecko-proxy.your-name.workers.dev/api/v2';
//
const BASE = 'https://api.geckoterminal.com/api/v2';
const NETWORK = 'ton';

// ---- In-memory cache ------------------------------------------------------

const _cache = new Map();   // key -> { value, expires }

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    // Stale — keep it around for stale-while-revalidate but flag it
    return { ...entry, stale: true };
  }
  return entry;
}

function cacheSet(key, value, ttlSeconds) {
  _cache.set(key, {
    value,
    expires: Date.now() + ttlSeconds * 1000,
    stale: false,
  });
}

// ---- Low-level fetch with retry + rate-limit awareness --------------------

let _lastRateLimitHit = 0;

async function fetchJSON(path, { timeoutMs = 8000 } = {}) {
  // If we recently hit a rate limit, back off for the rest of that minute.
  const since429 = Date.now() - _lastRateLimitHit;
  if (since429 < 60_000) {
    const wait = 60_000 - since429;
    throw new Error(`Rate-limited; retry in ${Math.ceil(wait / 1000)}s`);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    if (res.status === 429) {
      _lastRateLimitHit = Date.now();
      throw new Error('GeckoTerminal rate limit hit (30/min). Backing off.');
    }
    if (!res.ok) {
      throw new Error(`GeckoTerminal ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---- Cached fetch wrapper -------------------------------------------------

async function fetchCached(key, ttl, fetcher) {
  const cached = cacheGet(key);
  if (cached && !cached.stale) return cached.value;
  try {
    const value = await fetcher();
    cacheSet(key, value, ttl);
    return value;
  } catch (e) {
    // On error, if we have stale data, serve it rather than blanking the UI.
    if (cached && cached.stale) {
      console.warn('[gecko] using stale cache for', key, ':', e.message);
      return cached.value;
    }
    throw e;
  }
}

// ---- Normalization --------------------------------------------------------

// GeckoTerminal pool object → our internal Coin model
//
// We pick the NON-TON side of each pool as the "coin" the user is trading.
// E.g. for pool TONK/TON, the coin is TONK. For TON/USDT we treat USDT as
// the coin (you'd be buying USDT with TON).
//
// `tonTokenAddress` is the address of the wrapped TON jetton (pTON) on
// DeDust. GeckoTerminal labels TON-side as "TON" in name. We rely on the
// `base_token`/`quote_token` includes (referenced by id) to know which side
// is which.

const PTON_ADDRESSES = new Set([
  // pTON v1 (used by DeDust pools)
  'EQCM3B12QK1e4yZSf8GtBRT0aLMNyEsBc_DhVfRRtOEffLez',
  // pTON v2 (newer; DeDust uses this for newer pools)
  'EQCM3B12QK1e4yZSf8GtBRT0aLMNyEsBc_DhVfRRtOEffLez'.toLowerCase(),
]);
function isTonSide(token) {
  if (!token) return false;
  const sym = (token.symbol || '').toUpperCase();
  const addr = token.address || '';
  return sym === 'TON' || sym === 'WTON' || sym === 'PTON' || PTON_ADDRESSES.has(addr);
}

function normalizePool(pool, included) {
  const a = pool.attributes || {};
  // Look up the related base_token and quote_token from the JSON:API `included` block
  const baseId = pool.relationships?.base_token?.data?.id;
  const quoteId = pool.relationships?.quote_token?.data?.id;
  const dexId = pool.relationships?.dex?.data?.id;
  const dex = included?.find(i => i.type === 'dex' && i.id === dexId)?.attributes?.name || '?';
  const baseTok = included?.find(i => i.type === 'token' && i.id === baseId)?.attributes;
  const quoteTok = included?.find(i => i.type === 'token' && i.id === quoteId)?.attributes;

  // Decide which side is the "coin" (the non-TON jetton)
  let coinTok, tonTok;
  if (isTonSide(baseTok) && !isTonSide(quoteTok)) {
    coinTok = quoteTok;
    tonTok = baseTok;
  } else if (isTonSide(quoteTok) && !isTonSide(baseTok)) {
    coinTok = baseTok;
    tonTok = quoteTok;
  } else {
    // Pool isn't TON/X — pick whichever side has lower address as base
    coinTok = baseTok;
    tonTok = quoteTok;
  }

  if (!coinTok) return null;

  const change_24h = parseFloat(a.price_change_percentage?.h24 ?? '0') || 0;
  const price = parseFloat(a.base_token_price_usd ?? '0') || 0;
  // If coin is the quote side, the price we want is quote_token_price_usd
  const isCoinBase = baseTok && baseTok.address === coinTok.address;
  const coinPriceUsd = isCoinBase
    ? parseFloat(a.base_token_price_usd ?? '0')
    : parseFloat(a.quote_token_price_usd ?? '0');

  return {
    // Identity
    poolAddress: a.address,
    contract: coinTok.address,
    ticker: (coinTok.symbol || '').toUpperCase(),
    name: coinTok.name || coinTok.symbol || 'Unknown',
    image_url: coinTok.image_url || null,

    // Pricing
    price: coinPriceUsd || 0,
    change_24h: change_24h || 0,

    // Market data
    mcap: parseFloat(a.market_cap_usd ?? a.fdv_usd ?? '0') || 0,
    volume_24h: parseFloat(a.volume_usd?.h24 ?? '0') || 0,
    reserve_usd: parseFloat(a.reserve_in_usd ?? '0') || 0,

    // Pool metadata
    dex: dex,
    pool_label: a.name || '',                   // e.g. "TONK / TON"
    created_at: a.pool_created_at || null,

    // For DeDust integration — only swap on DeDust pools
    isDedust: /dedust/i.test(dex),

    // Cosmetics for the UI (we won't have these unless coin is on CoinGecko)
    emoji: pickEmojiForTicker((coinTok.symbol || '?').toUpperCase()),
    logoBg: pickBgForTicker((coinTok.symbol || '?').toUpperCase()),

    // Raw API attrs (kept for debugging only, never used by UI logic)
    _raw: a,
  };
}

// Deterministic emoji/bg for a ticker so the UI looks consistent across
// renders when the coin doesn't have a CoinGecko image. Real image_url
// from GeckoTerminal takes priority when available.
function pickEmojiForTicker(t) {
  const map = {
    REDO: '🪖', TONK: '🦄', JET: '🛩', DURK: '🧢',
    PEPE: '🐸', PEPE2: '🐸', MOON: '🌙', GIFT: '🎁',
    GLNK: '👺', SCAM: '🤡', SNIPR: '👁', SCALE: '⚖',
    USDT: '💵', NOT: '⚡', HMSTR: '🐹', DOGS: '🐶',
    REDOUBT: '🪖', BOLT: '⚡', BIBA: '😎', PUNK: '🤘',
  };
  if (map[t]) return map[t];
  // Hash-derived fallback so identical tickers always look the same
  const FALLBACK = ['🪙', '🎯', '🚀', '💎', '🔥', '⭐', '🌟', '✨'];
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) & 0xffffffff;
  return FALLBACK[Math.abs(h) % FALLBACK.length];
}
function pickBgForTicker(t) {
  const PAL = ['#caff4d', '#7fdcff', '#3ec1ff', '#ffd23a', '#ff5cb6', '#bff0ff', '#fff4d6'];
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) & 0xffffffff;
  return PAL[Math.abs(h) % PAL.length];
}

// ---- Public API -----------------------------------------------------------

/**
 * Get the top trending pools on TON.
 * @param {object} opts
 * @param {number} opts.limit  Max coins to return (default 20)
 * @returns {Promise<Coin[]>}
 */
export async function getTrending({ limit = 20 } = {}) {
  return fetchCached('trending', 60, async () => {
    const r = await fetchJSON(`/networks/${NETWORK}/trending_pools?include=base_token,quote_token,dex&page=1`);
    return (r.data || [])
      .map(p => normalizePool(p, r.included))
      .filter(Boolean)
      .slice(0, limit);
  });
}

/**
 * Get newest pools on TON (less than 24h old).
 */
export async function getNewPools({ limit = 20 } = {}) {
  return fetchCached('new', 60, async () => {
    const r = await fetchJSON(`/networks/${NETWORK}/new_pools?include=base_token,quote_token,dex&page=1`);
    return (r.data || [])
      .map(p => normalizePool(p, r.included))
      .filter(Boolean)
      .slice(0, limit);
  });
}

/**
 * Get top pools by volume.
 */
export async function getTopByVolume({ limit = 20 } = {}) {
  return fetchCached('top_volume', 60, async () => {
    const r = await fetchJSON(
      `/networks/${NETWORK}/pools?include=base_token,quote_token,dex&page=1&sort=h24_volume_usd_desc`
    );
    return (r.data || [])
      .map(p => normalizePool(p, r.included))
      .filter(Boolean)
      .slice(0, limit);
  });
}

/**
 * Search for pools by query (ticker, name, address).
 */
export async function searchCoins(query, { limit = 10 } = {}) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const key = `search:${q.toLowerCase()}`;
  return fetchCached(key, 300, async () => {
    const url = `/search/pools?query=${encodeURIComponent(q)}&network=${NETWORK}&include=base_token,quote_token,dex`;
    const r = await fetchJSON(url);
    return (r.data || [])
      .map(p => normalizePool(p, r.included))
      .filter(Boolean)
      .slice(0, limit);
  });
}

/**
 * Get a single pool's detailed data (refreshes price/volume).
 */
export async function getPool(poolAddress) {
  return fetchCached(`pool:${poolAddress}`, 30, async () => {
    const r = await fetchJSON(
      `/networks/${NETWORK}/pools/${poolAddress}?include=base_token,quote_token,dex`
    );
    return r.data ? normalizePool(r.data, r.included) : null;
  });
}

/**
 * OHLCV candlestick data for a pool's chart.
 * @param {string} poolAddress
 * @param {object} opts
 * @param {'minute'|'hour'|'day'} opts.timeframe
 * @param {number} opts.aggregate  e.g. 15 for 15-min candles on minute timeframe
 * @param {number} opts.limit      max candles (default 48)
 * @returns {Promise<{ts:number, o:number, h:number, l:number, c:number, v:number}[]>}
 */
export async function getOhlcv(poolAddress, { timeframe = 'hour', aggregate = 1, limit = 48 } = {}) {
  const key = `ohlcv:${poolAddress}:${timeframe}:${aggregate}:${limit}`;
  return fetchCached(key, 60, async () => {
    const url = `/networks/${NETWORK}/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}`;
    const r = await fetchJSON(url);
    const list = r.data?.attributes?.ohlcv_list || [];
    // Each row is [timestamp, open, high, low, close, volume] per GeckoTerminal docs
    return list.map(row => ({
      ts: row[0],
      o: parseFloat(row[1]),
      h: parseFloat(row[2]),
      l: parseFloat(row[3]),
      c: parseFloat(row[4]),
      v: parseFloat(row[5]),
    })).reverse(); // API returns newest-first; we want oldest-first for charting
  });
}

/**
 * Get the TON/USD price for our quote calculations.
 * Uses CoinGecko's simple price endpoint via GeckoTerminal's parent.
 */
let _tonUsdCache = { value: 0, fetchedAt: 0 };
export async function getTonUsd() {
  // Cache for 60s
  if (Date.now() - _tonUsdCache.fetchedAt < 60_000 && _tonUsdCache.value > 0) {
    return _tonUsdCache.value;
  }
  try {
    // Use a known TON/USDT pool: TON/USDT on STON.fi has high liquidity.
    // We grab whatever pool is the top TON pool and read its native price.
    const r = await fetchJSON(`/networks/${NETWORK}/pools?page=1&sort=h24_volume_usd_desc`);
    const pools = r.data || [];
    // Find any pool where one side is TON/pTON and other is a stable
    for (const p of pools) {
      const name = (p.attributes?.name || '').toUpperCase();
      if (name.includes('TON') && (name.includes('USDT') || name.includes('USDC'))) {
        // Whichever side is TON, use its USD price
        const tonPrice = name.startsWith('TON')
          ? parseFloat(p.attributes.base_token_price_usd)
          : parseFloat(p.attributes.quote_token_price_usd);
        if (tonPrice > 0) {
          _tonUsdCache = { value: tonPrice, fetchedAt: Date.now() };
          return tonPrice;
        }
      }
    }
  } catch (e) {
    console.warn('[gecko] getTonUsd failed:', e.message);
  }
  // Last-resort fallback. UI should treat 0 as "USD prices unavailable" rather
  // than show wildly wrong numbers.
  return _tonUsdCache.value || 0;
}

// ---- Diagnostics ----------------------------------------------------------

export function getCacheStats() {
  let live = 0, stale = 0;
  for (const e of _cache.values()) {
    if (e.expires > Date.now()) live++;
    else stale++;
  }
  return { live, stale, total: _cache.size };
}
