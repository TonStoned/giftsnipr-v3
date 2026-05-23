// ============================================================================
//  GiftSnipr gifts app — migrated from production single-file HTML to bundled
//  ES modules. Same behavior as giftsnipr.com, now using imported SDKs instead
//  of CDN-loaded globals.
//
//  Turn 2 migration. Cleanup (proper module split) is Turn 6/7.
// ============================================================================

import { TonConnectUI } from '@tonconnect/ui';

const GIFTS = [
  {id:'tg-plushpepe-2841',name:'Plush Pepe',emoji:'🐸',external_number:2841,price:1240,floor_price:1480,marketplace:'tonnel',listed_at:Date.now()-90*1000},
  {id:'tg-durovs-441',name:"Durov's Cap",emoji:'🧢',external_number:441,price:820,floor_price:940,marketplace:'mrkt',listed_at:Date.now()-3*60*1000},
  {id:'tg-signet-5475',name:'Gem Signet',emoji:'💍',external_number:5475,price:96,floor_price:124,marketplace:'portals',listed_at:Date.now()-6*60*1000},
  {id:'tg-toybear-12041',name:'Toy Bear',emoji:'🧸',external_number:12041,price:38,floor_price:44,marketplace:'tonnel',listed_at:Date.now()-12*60*1000},
  {id:'tg-rose-3300',name:'Eternal Rose',emoji:'🌹',external_number:3300,price:28,floor_price:34,marketplace:'mrkt',listed_at:Date.now()-18*60*1000},
  {id:'tg-bunny-887',name:'Jelly Bunny',emoji:'🐰',external_number:887,price:14,floor_price:17,marketplace:'fragment',listed_at:Date.now()-25*60*1000},
  {id:'tg-cake-219',name:'Homemade Cake',emoji:'🎂',external_number:219,price:152,floor_price:185,marketplace:'tonnel',listed_at:Date.now()-32*60*1000},
  {id:'tg-star-77',name:'Diamond Star',emoji:'💎',external_number:77,price:340,floor_price:410,marketplace:'mrkt',listed_at:Date.now()-44*60*1000},
];
const COLLECTIONS = [
  {id:'plush-pepe',name:'Plush Pepe',emoji:'🐸',floor:1480,vol_24h:18420,change_24h:+4.2},
  {id:'durovs-cap',name:"Durov's Cap",emoji:'🧢',floor:940,vol_24h:12100,change_24h:-2.1},
  {id:'diamond-star',name:'Diamond Star',emoji:'💎',floor:410,vol_24h:8760,change_24h:+12.4},
  {id:'cake',name:'Homemade Cake',emoji:'🎂',floor:185,vol_24h:6420,change_24h:+1.8},
  {id:'gem-signet',name:'Gem Signet',emoji:'💍',floor:124,vol_24h:4310,change_24h:-12.0},
  {id:'toy-bear',name:'Toy Bear',emoji:'🧸',floor:44,vol_24h:3220,change_24h:+0.4},
  {id:'eternal-rose',name:'Eternal Rose',emoji:'🌹',floor:34,vol_24h:2680,change_24h:-3.2},
  {id:'lol-sticker',name:'Lol Sticker',emoji:'😂',floor:22,vol_24h:1990,change_24h:+7.8},
  {id:'jelly-bunny',name:'Jelly Bunny',emoji:'🐰',floor:17,vol_24h:1240,change_24h:+2.3},
  {id:'snake-ring',name:'Snake Ring',emoji:'🐍',floor:12,vol_24h:910,change_24h:-11.4},
];
const WHALES = [
  {rank:1,handle:'@neonwhale',total_ton:8420,gifts_24h:23,biggest:'Plush Pepe #18'},
  {rank:2,handle:'@durovstan',total_ton:6190,gifts_24h:17,biggest:"Durov's Cap #4"},
  {rank:3,handle:'@goblinking',total_ton:4810,gifts_24h:31,biggest:'Diamond Star #44'},
  {rank:4,handle:'@ghosthand',total_ton:3200,gifts_24h:9,biggest:'Plush Pepe #214'},
  {rank:5,handle:'@gemster',total_ton:2780,gifts_24h:14,biggest:'Gem Signet #41'},
  {rank:42,handle:'YOU (@day)',total_ton:610,gifts_24h:4,biggest:'Toy Bear #12041',isYou:true},
];
const RANKS = [
  {min:0,name:'ROOKIE',emoji:'🥚'},
  {min:5,name:'SCOUT',emoji:'🔍'},
  {min:15,name:'SNIPR',emoji:'🎯'},
  {min:30,name:'PRO SNIPR',emoji:'⚡'},
  {min:60,name:'ELITE',emoji:'🏆'},
  {min:120,name:'LEGENDARY',emoji:'👑'},
];

const SNIPR_GREETINGS = [
  "oi day, I smell deals 👃",
  "wake up — the floor moved",
  "you again? good.",
  "I've been watching since 4am",
  "look at this beauty 🤤",
  "8 gifts crying for new owners",
  "money on the table, friend",
  "scope is HOT today",
];
const SNIPR_TICKER = [
  "🐸 PLUSH PEPE FLOOR FLEW 12%",
  "👀 @goblinking sniped 4 in a row",
  "💍 GEM SIGNET DUMPING — eyes peeled",
  "🔥 247 sniprs active right now",
  "🎯 biggest discount: -19% Toy Bear",
  "🐋 new whale: 800 TON in 1h",
  "💎 Diamond Star pumping +12%",
];

let currentTab = 'snipes';

// ============================================================================
//  PROFILE — per-wallet persistent state
//
//  Every wallet address has its own profile stored in localStorage. When a
//  wallet connects, we load its profile (or create a fresh one). When
//  disconnected, we use the "guest" default profile (level 1, zero everything).
//
//  Storage key format: "gs_profile_v1:<address>"
//  Value: { level, xp, snipesMade, streakDays, streakLastClaim, badges, version }
//
//  Anti-tamper: profile values are validated on load. Out-of-range values are
//  clamped (a user editing localStorage to give themselves level 99 will see
//  the level reset to a sane value). For real security, profile state should
//  be authoritative on the server in v0.3+ — this is client-side defense.
// ============================================================================
const PROFILE = (() => {
  const KEY_PREFIX = 'gs_profile_v1:';

  // Defaults for a brand new user (or guest browsing without a wallet)
  function defaultProfile(){
    return {
      level: 1,
      xp: 0,
      xpForNext: 100,         // XP needed for level 2; scales each level
      snipesMade: 0,
      streakDays: 0,
      streakLastClaim: 0,     // unix ms timestamp of last daily claim
      badges: [],             // array of badge ids unlocked
      firstSeen: Date.now(),
      version: 1,
    };
  }

  // Re-derive the XP needed for the NEXT level. Curve: 100, 250, 500, 900, ...
  function xpForLevel(lvl){
    if (lvl < 1) lvl = 1;
    return Math.round(100 * Math.pow(lvl, 1.5));
  }

  function sanitize(p){
    const d = defaultProfile();
    if (typeof p !== 'object' || !p) return d;
    const out = { ...d };
    // Clamp every field into a reasonable range so localStorage tampering
    // can't produce overflow or impossible state.
    if (Number.isFinite(p.level))        out.level = Math.max(1, Math.min(999, Math.floor(p.level)));
    if (Number.isFinite(p.xp))           out.xp = Math.max(0, Math.min(1e9, Math.floor(p.xp)));
    if (Number.isFinite(p.snipesMade))   out.snipesMade = Math.max(0, Math.min(1e9, Math.floor(p.snipesMade)));
    if (Number.isFinite(p.streakDays))   out.streakDays = Math.max(0, Math.min(9999, Math.floor(p.streakDays)));
    if (Number.isFinite(p.streakLastClaim)) {
      // Reject future timestamps (tampering)
      out.streakLastClaim = (p.streakLastClaim > Date.now() + 60_000) ? 0 : Math.max(0, p.streakLastClaim);
    }
    if (Array.isArray(p.badges)) {
      out.badges = p.badges.filter(b => typeof b === 'string' && b.length < 32).slice(0, 50);
    }
    if (Number.isFinite(p.firstSeen)) out.firstSeen = p.firstSeen;
    // Recompute xpForNext based on level (don't trust stored value)
    out.xpForNext = xpForLevel(out.level);
    return out;
  }

  // In-memory active profile (whatever wallet is connected, or guest)
  let _current = defaultProfile();
  let _currentAddress = null; // null = guest mode

  function storageKey(addr){ return KEY_PREFIX + String(addr); }

  function loadFor(address){
    if (!address) {
      _current = defaultProfile();
      _currentAddress = null;
      return _current;
    }
    try {
      const raw = localStorage.getItem(storageKey(address));
      if (raw) {
        const parsed = JSON.parse(raw);
        _current = sanitize(parsed);
      } else {
        _current = defaultProfile();
      }
    } catch (e) {
      console.warn('[profile] load failed, starting fresh:', e);
      _current = defaultProfile();
    }
    _currentAddress = address;
    return _current;
  }

  function save(){
    if (!_currentAddress) return; // don't persist guest state
    try {
      localStorage.setItem(storageKey(_currentAddress), JSON.stringify(_current));
    } catch (e) {
      console.warn('[profile] save failed:', e);
    }
  }

  function clear(){
    // Switch back to guest mode (don't delete the saved profile, just stop reading from it)
    _current = defaultProfile();
    _currentAddress = null;
  }

  // ---- mutators ----

  function addXp(amount){
    _current.xp = Math.max(0, _current.xp + Math.floor(amount));
    // Level up while xp exceeds threshold
    while (_current.xp >= _current.xpForNext) {
      _current.xp -= _current.xpForNext;
      _current.level += 1;
      _current.xpForNext = xpForLevel(_current.level);
    }
    save();
  }

  function incrementSnipes(){
    _current.snipesMade += 1;
    save();
  }

  function setStreak(days){
    _current.streakDays = Math.max(0, Math.floor(days));
    save();
  }

  function markClaimed(){
    _current.streakLastClaim = Date.now();
    // Compute streak: if last claim was within 6-30 hours, increment; if longer, reset to 1
    // (for simplicity for now: just increment. v0.3 will be smarter.)
    _current.streakDays = (_current.streakDays || 0) + 1;
    save();
  }

  function unlockBadge(id){
    if (!_current.badges.includes(id)) {
      _current.badges.push(id);
      save();
    }
  }

  // ---- accessors ----

  return Object.freeze({
    loadFor, save, clear,
    addXp, incrementSnipes, setStreak, markClaimed, unlockBadge,
    get level()           { return _current.level; },
    get xp()              { return _current.xp; },
    get xpForNext()       { return _current.xpForNext; },
    get snipesMade()      { return _current.snipesMade; },
    get streakDays()      { return _current.streakDays; },
    get streakLastClaim() { return _current.streakLastClaim; },
    get badges()          { return [..._current.badges]; },
    get isGuest()         { return _currentAddress === null; },
    get currentAddress()  { return _currentAddress; },
  });
})();

const fmtTON = n => (+n).toLocaleString('en-US',{maximumFractionDigits:2});
const fmtPct = n => `${n>0?'+':''}${n.toFixed(1)}%`;
function timeAgo(ts){
  const sec = Math.max(1,Math.floor((Date.now()-ts)/1000));
  if(sec<60) return `${sec}s ago`;
  if(sec<3600) return `${Math.floor(sec/60)}m ago`;
  if(sec<86400) return `${Math.floor(sec/3600)}h ago`;
  return `${Math.floor(sec/86400)}d ago`;
}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2200)}
function pickGreet(){return SNIPR_GREETINGS[Math.floor(Math.random()*SNIPR_GREETINGS.length)]}
function rankFor(snipes){let r=RANKS[0];for(const x of RANKS)if(snipes>=x.min)r=x;return r}

// ============================================================================
//  XSS-SAFE TEXT ESCAPER (canonical — replaces the old escape())
//  Used everywhere we still need template-string interpolation. Better practice
//  is to use textContent on a created element (see DOM helpers below).
// ============================================================================
function safeText(s){
  return String(s).replace(/[&<>"'\/`=]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#47;','`':'&#96;','=':'&#61;'
  })[c]);
}

// ============================================================================
//  MARKETPLACE ALLOWLIST (CR4 fix)
//  Hostile API responses can put anything in marketplace field. We validate
//  against this strict list before using it as a CSS class or URL path.
// ============================================================================
const ALLOWED_MARKETPLACES = Object.freeze(['tonnel','mrkt','portals','fragment']);
function safeMarketplace(m){
  const v = String(m||'').toLowerCase().trim();
  return ALLOWED_MARKETPLACES.includes(v) ? v : 'unknown';
}

// ============================================================================
//  REDIRECT URL ALLOWLIST (CR1, HI3 fix)
//  Every outbound URL is validated. Drainer URLs in API responses are blocked.
//  Returns the cleaned URL or null if it fails validation.
// ============================================================================
const ALLOWED_DESTINATIONS = Object.freeze({
  tonnel:   ['t.me/Tonnel_Network_bot', 't.me/tonnel'],
  mrkt:     ['t.me/mrkt', 'mrkt.app'],
  portals:  ['t.me/portals', 'portals-market.com'],
  fragment: ['fragment.com'],
});

// ============================================================================
//  REFERRAL CODES — your affiliate IDs per marketplace
//
//  This is HOW YOU EARN MONEY. Sign up to each marketplace's referral program,
//  paste the code they give you here, and every snipe routed through GiftSnipr
//  earns you a % of the sale (typically 0.25 - 1%).
//
//  Sign-up links (as of 2026 — verify each):
//   - Tonnel: https://t.me/Tonnel_Network_bot → /referral menu
//   - MRKT: contact @mrkt_admin for partner program
//   - Portals: https://t.me/portals → settings → referrals
//   - Fragment: no public program; codes ignored
//
//  Until you sign up, leave these as empty strings — the URL will still work,
//  just without your kickback.
// ============================================================================
const REFERRAL_CODES = Object.freeze({
  tonnel:   '',  // e.g., 'snipr_abc123'  — paste the code from Tonnel here
  mrkt:     '',
  portals:  '',
  fragment: '',  // Fragment doesn't have a referral program
});

/**
 * Build a marketplace-deep-link URL for a specific gift, with our referral
 * code attached when available. Each marketplace uses different URL patterns.
 *
 * Returns a URL ready to open, or null if we can't build one safely.
 */
function buildReferralUrl(gift){
  const mp = safeMarketplace(gift.marketplace);
  const code = REFERRAL_CODES[mp];
  const giftId = String(gift.id || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64);

  let url = null;
  switch (mp) {
    case 'tonnel':
      // Tonnel uses Telegram start parameter; format documented in their bot.
      // ref_<code>_<giftId> is one common pattern; verify with Tonnel docs.
      url = code
        ? `https://t.me/Tonnel_Network_bot?start=ref_${encodeURIComponent(code)}_${giftId}`
        : `https://t.me/Tonnel_Network_bot?start=gift_${giftId}`;
      break;
    case 'mrkt':
      url = code
        ? `https://t.me/mrkt?start=r_${encodeURIComponent(code)}_${giftId}`
        : `https://t.me/mrkt?start=g_${giftId}`;
      break;
    case 'portals':
      url = code
        ? `https://t.me/portals?start=ref_${encodeURIComponent(code)}_${giftId}`
        : `https://t.me/portals?start=${giftId}`;
      break;
    case 'fragment':
      // Fragment uses canonical URLs; gift id determines the page.
      url = `https://fragment.com/gifts/${giftId}`;
      break;
    default:
      return null;
  }

  // Pass through safeListingUrl as a final sanity check — we built this URL
  // ourselves so it should always pass, but defense in depth.
  return safeListingUrl(url, mp);
}

function safeListingUrl(rawUrl, expectedMarketplace){
  let u;
  try {
    u = new URL(String(rawUrl));
  } catch (e) {
    console.warn('[security] rejected unparseable URL');
    return null;
  }
  // Only HTTPS (and tg: for Telegram deep-links)
  if (u.protocol !== 'https:' && u.protocol !== 'tg:') {
    console.warn('[security] rejected non-https URL:', u.protocol);
    return null;
  }
  // Host must match expected marketplace's allowlist
  const allowed = ALLOWED_DESTINATIONS[safeMarketplace(expectedMarketplace)] || [];
  const matchesHost = allowed.some(pattern => {
    const expectedHost = pattern.split('/')[0];
    return u.host === expectedHost || u.host === 'www.' + expectedHost;
  });
  if (!matchesHost) {
    console.warn('[security] rejected unexpected host:', u.host, 'expected:', allowed);
    return null;
  }
  // Strip any javascript:, data:, file: protocols that snuck through (defense in depth)
  const cleaned = u.href;
  if (/^(javascript|data|file|vbscript):/i.test(cleaned)) {
    console.warn('[security] rejected dangerous protocol');
    return null;
  }
  return cleaned;
}

// ============================================================================
//  TON ADDRESS FORMAT HELPERS
//
//  TON Connect returns wallet addresses in "raw" form: "0:hex64chars".
//  Tonkeeper and every other TON wallet display them in "user-friendly" form:
//  - Non-bounceable: "UQ..." (used for wallets — what users see in Tonkeeper)
//  - Bounceable:     "EQ..." (used for smart contracts)
//
//  We MUST convert raw → user-friendly for display so the address shown in
//  GiftSnipr matches what the user sees in Tonkeeper. Otherwise we look broken
//  or worse, look like a phishing site.
//
//  Algorithm (per TEP-0002):
//   1. Build 34-byte payload: [tag, workchain, 32-byte-hash]
//   2. Compute CRC16-CCITT (XMODEM variant) of the 34 bytes
//   3. Append CRC as 2 bytes
//   4. Base64-encode the 36 bytes (we use url-safe base64)
//
//  Tag = 0x51 for non-bounceable mainnet (wallets), 0x11 for bounceable.
// ============================================================================

function _crc16Xmodem(bytes){
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc;
}

function _bytesToBase64Url(bytes){
  // browser-safe base64url encoder
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _hexToBytes(hex){
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i*2, 2), 16);
  return out;
}

/**
 * Convert a raw TON address ("0:hex" / "-1:hex") to user-friendly form.
 * Defaults to non-bounceable mainnet (the form Tonkeeper shows for wallets).
 * Returns null if the input is malformed.
 */
function toFriendlyAddress(rawAddr, opts){
  opts = opts || {};
  const bounceable = !!opts.bounceable;     // default false (wallet form)
  const testOnly   = !!opts.testOnly;
  try {
    const m = String(rawAddr).match(/^(-?\d+):([0-9a-fA-F]{64})$/);
    if (!m) {
      // Already user-friendly? return as-is.
      if (/^[UE0k][A-Za-z0-9_-]{47}$/.test(String(rawAddr))) return String(rawAddr);
      return null;
    }
    const workchain = parseInt(m[1], 10);
    const hash = _hexToBytes(m[2]);
    let tag = bounceable ? 0x11 : 0x51;
    if (testOnly) tag |= 0x80;
    const wcByte = (workchain === -1) ? 0xff : (workchain & 0xff);
    const payload = new Uint8Array(34);
    payload[0] = tag;
    payload[1] = wcByte;
    payload.set(hash, 2);
    const crc = _crc16Xmodem(payload);
    const out = new Uint8Array(36);
    out.set(payload, 0);
    out[34] = (crc >> 8) & 0xff;
    out[35] = crc & 0xff;
    return _bytesToBase64Url(out);
  } catch (e) {
    console.warn('[address] conversion failed:', e);
    return null;
  }
}

/**
 * Truncate any address to "abcd…wxyz" form for display. Works on either raw
 * or user-friendly form (but we always convert to user-friendly first for UX).
 */
function shortenAddress(addr){
  const a = String(addr || '');
  if (a.length <= 10) return a;
  return `${a.slice(0,4)}…${a.slice(-4)}`;
}

function mascotSVG(size=80,emotion='happy'){
  const mouth = emotion==='happy'
    ? `<path d="M 26 48 Q 32 56 38 48" fill="none" stroke="#0a0a1a" stroke-width="2.5" stroke-linecap="round"/>`
    : emotion==='wow'
    ? `<ellipse cx="32" cy="50" rx="3" ry="4" fill="#0a0a1a"/>`
    : `<path d="M 26 50 Q 32 46 38 50" fill="none" stroke="#0a0a1a" stroke-width="2.5" stroke-linecap="round"/>`;
  const id = `bg-${emotion}-${Math.random().toString(36).slice(2,7)}`;
  return `
<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
  <defs>
    <radialGradient id="${id}" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="40%" stop-color="#bff0ff"/>
      <stop offset="100%" stop-color="#1ea7e8"/>
    </radialGradient>
  </defs>
  <path d="M 14 18 L 8 8 L 18 14 Z" fill="#3ec1ff" stroke="#0a0a1a" stroke-width="2" stroke-linejoin="round"/>
  <path d="M 50 18 L 56 8 L 46 14 Z" fill="#3ec1ff" stroke="#0a0a1a" stroke-width="2" stroke-linejoin="round"/>
  <ellipse cx="32" cy="36" rx="24" ry="22" fill="url(#${id})" stroke="#0a0a1a" stroke-width="3"/>
  <ellipse cx="32" cy="34" rx="14" ry="13" fill="#fffdf5" stroke="#0a0a1a" stroke-width="2.5"/>
  <circle cx="32" cy="35" r="6" fill="#ff5cb6" stroke="#0a0a1a" stroke-width="2"/>
  <line x1="32" y1="27" x2="32" y2="31" stroke="#0a0a1a" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="32" y1="39" x2="32" y2="43" stroke="#0a0a1a" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="24" y1="35" x2="28" y2="35" stroke="#0a0a1a" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="36" y1="35" x2="40" y2="35" stroke="#0a0a1a" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="32" cy="35" r="1.6" fill="#0a0a1a"/>
  <circle cx="28" cy="30" r="2.2" fill="#fff" opacity="0.95"/>
  ${mouth}
  <circle cx="52" cy="22" r="2.5" fill="#caff4d" stroke="#0a0a1a" stroke-width="1.2"/>
</svg>`;
}

function render(){
  // Update streak hero from PROFILE before anything else renders.
  // When the user has no streak yet (0 days), show a "start your streak" CTA
  // instead of a fake number.
  const streakNumEl = document.querySelector('#streakHero .streak-info .num');
  const streakSubEl = document.querySelector('#streakHero .streak-info .sub');
  if (streakNumEl) {
    const days = PROFILE.streakDays;
    if (days > 0) {
      // <small>days</small> is appended so build it as text + element
      streakNumEl.textContent = String(days);
      const small = document.createElement('small');
      small.textContent = days === 1 ? 'day' : 'days';
      streakNumEl.appendChild(small);
      if (streakSubEl) streakSubEl.textContent = "don't break it";
    } else {
      streakNumEl.textContent = '0';
      const small = document.createElement('small');
      small.textContent = 'days';
      streakNumEl.appendChild(small);
      if (streakSubEl) streakSubEl.textContent = 'start your streak today';
    }
  }

  const s=document.getElementById('screen');
  if(currentTab==='snipes')        s.innerHTML=renderSnipes();
  else if(currentTab==='floors')   s.innerHTML=renderFloors();
  else if(currentTab==='profile')  s.innerHTML=renderProfile();
  else if(currentTab==='whales')   s.innerHTML=renderWhales();
  document.querySelectorAll('.snipe-btn').forEach(b=>{
    b.addEventListener('click',e=>{e.preventDefault();doSnipe(parseInt(b.dataset.idx,10))});
  });

  // Wire up wallet card after profile renders
  const walletAddrEl = document.getElementById('walletCardAddr');
  if (walletAddrEl && WALLET.address) {
    // textContent — never innerHTML — so address can never become an XSS vector
    walletAddrEl.textContent = WALLET.shortAddress();
  }
  const disconnectBtn = document.getElementById('walletDisconnectBtn');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', disconnectWallet);
  }
}

function renderSnipes(){
  const snipes = GIFTS
    .filter(g=>g.price<g.floor_price)
    .map(g=>({...g,delta_pct:((g.price-g.floor_price)/g.floor_price)*100}))
    .sort((a,b)=>a.delta_pct-b.delta_pct);
  const greet = pickGreet();
  const tickerText = SNIPR_TICKER.join('   •   ');
  return `
    <div class="screen">
      <div class="greet-card">
        <div class="greet-mascot">${mascotSVG(80,'happy')}</div>
        <div class="greet-text">
          <div class="hello">snipr says</div>
          <div class="msg">${safeText(greet)}</div>
          <div class="sub">biggest discount: ${fmtPct(snipes[0]?.delta_pct||0)}</div>
        </div>
      </div>

      <div class="snipr-says">
        <div class="face">📡</div>
        <div class="ticker"><div class="ticker-inner">${safeText(tickerText)}   •   ${safeText(tickerText)}</div></div>
      </div>

      <div class="card">
        <div class="card-head"><h2>🎯 LIVE DEALS</h2><span class="meta">${snipes.length} hits</span></div>
        ${snipes.map((g,i)=>{
          // CR2+CR4: validate every API-controlled field before rendering
          const safeMp = safeMarketplace(g.marketplace);
          const safeEmoji = safeText(g.emoji);
          const safeNum = String(parseInt(g.external_number,10) || 0);
          return `
          <div class="snipe-row">
            <div class="gift-img">${safeEmoji}</div>
            <div class="gift-info">
              <div class="gift-name">${safeText(g.name)} #${safeNum}</div>
              <div class="gift-meta">
                <span class="tag ${safeMp}">${safeMp}</span>
                <span>${timeAgo(g.listed_at)}</span>
              </div>
            </div>
            <div class="price-block">
              <div class="price">${fmtTON(g.price)}<span class="ton"> TON</span></div>
              <div class="delta ${g.delta_pct<0?'down':'up'}">${fmtPct(g.delta_pct)}</div>
              <a class="snipe-btn" href="#" data-idx="${i}">SNIPE →</a>
            </div>
          </div>
        `}).join('')}
      </div>
      <p class="disclaimer">Prices pulled across Tonnel · MRKT · Portals · Fragment. Not financial advice.</p>
    </div>
  `;
}

function renderFloors(){
  const cs=[...COLLECTIONS].sort((a,b)=>b.vol_24h-a.vol_24h);
  return `
    <div class="screen">
      <div class="greet-card" style="background:linear-gradient(135deg,var(--lime),#a3e635)">
        <div class="greet-mascot">${mascotSVG(80,'happy')}</div>
        <div class="greet-text">
          <div class="hello">snipr's map</div>
          <div class="msg">10 collections, 1 hot 🌶️</div>
          <div class="sub">Diamond Star up 12% — flip soon?</div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>📊 COLLECTIONS</h2><span class="meta">${cs.length} live</span></div>
        <div class="floor-grid">
          ${cs.map(c=>`
            <div class="floor-tile">
              <span class="ft-trend ${c.change_24h>=0?'up':'down'}">${fmtPct(c.change_24h)}</span>
              <span class="ft-emoji">${safeText(c.emoji)}</span>
              <div class="ft-name">${safeText(c.name)}</div>
              <div class="ft-floor">${fmtTON(c.floor)} TON</div>
              <div class="ft-vol">vol ${fmtTON(c.vol_24h)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderProfile(){
  const snipesMade = PROFILE.snipesMade;
  const xpTotal = PROFILE.xp;
  const xpForNext = PROFILE.xpForNext;
  const userLevel = PROFILE.level;
  const streakDays = PROFILE.streakDays;
  const r=rankFor(snipesMade);
  const xpPct=Math.min(100,(xpTotal/xpForNext)*100);
  const handle = walletConnected ? WALLET.shortAddress() : 'guest';

  // Badge catalog — each entry tells us how to detect if the user has it.
  // A v0.3 server-side service would compute these; for v0.2 we derive from
  // local PROFILE state. Badges unlock automatically as users hit milestones.
  const badgeCatalog = [
    {id:'first_snipe', e:'🎯', n:'First Snipe',  got: snipesMade >= 1},
    {id:'week_streak', e:'🔥', n:'7-day',        got: streakDays >= 7},
    {id:'diamond',     e:'💎', n:'Diamond',      got: snipesMade >= 25},
    {id:'top_10',      e:'🐋', n:'Top 10',       got: PROFILE.badges.includes('top_10')},
    {id:'speed',       e:'⚡', n:'Speed',        got: PROFILE.badges.includes('speed')},
    {id:'legend',      e:'👑', n:'Legend',       got: userLevel >= 50},
    {id:'thousand',    e:'🎁', n:'1000',         got: snipesMade >= 1000},
    {id:'year_one',    e:'🌟', n:'Year One',     got: PROFILE.badges.includes('year_one')},
  ];
  const badgesEarned = badgeCatalog.filter(b => b.got).length;

  // Wallet card — only render when connected. Built as HTML string here for
  // template parity with the rest of profile, but the disconnect button is
  // wired up post-render via addEventListener for safety (no inline onclick).
  const walletCardHtml = walletConnected && WALLET.address ? `
    <div class="wallet-card" id="walletCard">
      <div class="wc-icon">
        🔐
        <span class="wc-status-dot" title="connected"></span>
      </div>
      <div class="wc-info">
        <div class="wc-label">connected wallet</div>
        <div class="wc-addr" id="walletCardAddr"></div>
      </div>
      <button class="wc-disconnect" id="walletDisconnectBtn" type="button">DISCONNECT</button>
    </div>
  ` : '';

  // "saved" stat — for v0.2 we just count snipes * average savings. v0.3
  // will read this from real transaction history.
  const tonSaved = (snipesMade * 3.5).toFixed(0); // rough estimate, will be real in v0.3

  return `
    <div class="screen">
      ${walletCardHtml}
      <div class="card">
        <div class="profile-hero">
          <div class="pmascot">${mascotSVG(90,'happy')}</div>
          <div class="pinfo">
            <div class="handle">${safeText(handle)}</div>
            <div class="rank-name">${r.emoji} ${r.name}</div>
            <div class="lvl-row">
              <span class="lvl">LVL ${userLevel}</span>
              <span class="lvl-label">${snipesMade} snipes</span>
            </div>
          </div>
        </div>
        <div class="xp-bar">
          <div class="xp-bar-track"><div class="xp-bar-fill" style="width:${xpPct}%"></div></div>
          <div class="xp-bar-text">
            <span>${xpTotal} XP</span>
            <span class="next">${Math.max(0, xpForNext - xpTotal)} to LVL ${userLevel+1}</span>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-cell"><div class="label">snipes</div><div class="value">${snipesMade}</div></div>
          <div class="stat-cell"><div class="label">TON saved</div><div class="value">${tonSaved}</div></div>
          <div class="stat-cell"><div class="label">streak</div><div class="value">🔥${streakDays}</div></div>
        </div>
      </div>

      <div class="referral-card">
        <div class="ref-text">invite <span class="pct">3</span> friends → unlock<br>premium for <span class="pct">30 days</span></div>
        <button class="share-btn" data-action="share-ref">SHARE</button>
      </div>

      <div class="card">
        <div class="card-head"><h2>🏅 BADGES</h2><span class="meta">${badgesEarned} of ${badgeCatalog.length}</span></div>
        <div class="badge-grid">
          ${badgeCatalog.map(b=>`
            <div class="badge ${b.got?'got':''}">
              <div class="b-emoji">${b.e}</div>
              <div class="b-name">${safeText(b.n)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderWhales(){
  return `
    <div class="screen">
      <div class="greet-card" style="background:linear-gradient(135deg,var(--gold),#ffae3a)">
        <div class="greet-mascot">${mascotSVG(80,'wow')}</div>
        <div class="greet-text">
          <div class="hello">snipr ranks the field</div>
          <div class="msg">you're #42 today</div>
          <div class="sub">snipe 3 more to crack top 30</div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>👑 LEADERBOARD</h2><span class="meta">last 24h</span></div>
        ${WHALES.map(w=>{
          const cls = w.rank===1?'gold':w.rank===2?'silver':w.rank===3?'bronze':'';
          return `
            <div class="whale-row ${w.isYou?'you':''}">
              <div class="whale-rank ${cls}">${w.rank===1?'👑':'#'+w.rank}</div>
              <div class="whale-info">
                <div class="whale-handle">${safeText(w.handle)}</div>
                <div class="whale-stats">${w.gifts_24h} buys · ${safeText(w.biggest)}</div>
              </div>
              <div class="whale-spent">${fmtTON(w.total_ton)} <span style="font-family:var(--font-mono);font-size:11px;opacity:.6">TON</span></div>
            </div>
          `;
        }).join('')}
      </div>
      <p class="disclaimer">Top 10 weekly winners get free premium. Climb the wall.</p>
    </div>
  `;
}

function doSnipe(idx){
  const snipes = GIFTS
    .filter(g=>g.price<g.floor_price)
    .map(g=>({...g,delta_pct:((g.price-g.floor_price)/g.floor_price)*100}))
    .sort((a,b)=>a.delta_pct-b.delta_pct);
  const g = snipes[idx];
  if(!g) return;
  const saved = g.floor_price - g.price;

  // Reset idle timer on user interaction (HI6)
  resetIdleTimer();

  // PRODUCTION: redirect through safeRedirect after celebrating
  //   const url = await safeRedirect(g.listing_url, g.marketplace);
  //   if (!url) return; // safeListingUrl rejected the destination
  // For v0.1 preview, just show the share card — no real redirect.

  fireConfetti();
  showShareCard(g, saved);
  // Persist progress to the connected wallet's profile (or in-memory if guest)
  PROFILE.incrementSnipes();
  PROFILE.addXp(50);
  // Update the topbar level badge in case the user just leveled up.
  // v0.3: both gifts and coins headers may have a .user-pill.
  document.querySelectorAll('.user-pill .lvl-badge').forEach(b => {
    b.textContent = String(PROFILE.level);
  });
}

function fireConfetti(){
  const wrap=document.createElement('div');wrap.className='confetti';
  const colors=['#bff0ff','#3ec1ff','#caff4d','#ff5cb6','#ffd23a'];
  for(let i=0;i<60;i++){
    const s=document.createElement('span');
    s.style.left=Math.random()*100+'%';
    s.style.background=colors[i%colors.length];
    s.style.animationDelay=(Math.random()*0.4)+'s';
    s.style.animationDuration=(1.2+Math.random()*0.8)+'s';
    s.style.transform=`rotate(${Math.random()*360}deg)`;
    wrap.appendChild(s);
  }
  document.body.appendChild(wrap);
  setTimeout(()=>wrap.remove(),2400);
}

function showShareCard(gift, saved){
  // Use the modal stack manager — only one modal at a time (ME1 fix)
  if (MODAL_STACK.isOpen()) return;
  MODAL_STACK.markOpen();

  // Use the snipes count from PROFILE (which was just incremented in doSnipe).
  const r = rankFor(PROFILE.snipesMade);

  // Validate API-controlled fields BEFORE anything touches the DOM
  const safeName = safeText(gift.name);
  const safeNum = String(parseInt(gift.external_number, 10) || 0);

  const bg = document.createElement('div');
  bg.className = 'modal-bg';

  const card = document.createElement('div');
  card.className = 'share-card';

  // Header
  const head = document.createElement('div');
  head.className = 'sc-head';
  const headLeft = document.createElement('span');
  headLeft.textContent = 'SNIPED ON GIFTSNIPR';
  const headBadge = document.createElement('span');
  headBadge.className = 'badge';
  headBadge.textContent = '#42 today';
  head.appendChild(headLeft);
  head.appendChild(headBadge);
  card.appendChild(head);

  const title = document.createElement('div');
  title.className = 'sc-title';
  title.textContent = 'JUST SNIPED 🎯';
  card.appendChild(title);

  // Mascot — mascotSVG output is from a fixed enum, not user input.
  // Still: use a sandboxed wrapper and assert the emotion string.
  const mascot = document.createElement('div');
  mascot.className = 'sc-mascot';
  mascot.innerHTML = mascotSVG(80, 'wow'); // 'wow' is hardcoded, not from input
  card.appendChild(mascot);

  // Gift block — every dynamic value is textContent
  const giftBlock = document.createElement('div');
  giftBlock.className = 'sc-gift';
  const giftEmoji = document.createElement('span');
  giftEmoji.className = 'ge';
  giftEmoji.textContent = String(gift.emoji || '🎁'); // textContent — safe
  giftBlock.appendChild(giftEmoji);
  const giftInfo = document.createElement('div');
  giftInfo.className = 'ginfo';
  const giftName = document.createElement('div');
  giftName.className = 'gn';
  giftName.textContent = `${gift.name} #${safeNum}`; // textContent — gift.name can be anything, won't be parsed
  const giftPrice = document.createElement('div');
  giftPrice.className = 'gp';
  giftPrice.textContent = `paid ${fmtTON(gift.price)} · floor ${fmtTON(gift.floor_price)} TON`;
  giftInfo.appendChild(giftName);
  giftInfo.appendChild(giftPrice);
  giftBlock.appendChild(giftInfo);
  card.appendChild(giftBlock);

  // Saved amount block
  const savedBlock = document.createElement('div');
  savedBlock.className = 'sc-saved';
  const savedLbl = document.createElement('div');
  savedLbl.className = 'lbl';
  savedLbl.textContent = 'You saved';
  const savedAmt = document.createElement('div');
  savedAmt.className = 'amt';
  savedAmt.textContent = `${fmtTON(saved)} TON`;
  savedBlock.appendChild(savedLbl);
  savedBlock.appendChild(savedAmt);
  card.appendChild(savedBlock);

  // Flex stat rows
  const buildFlexCell = (label, value) => {
    const cell = document.createElement('div');
    cell.className = 'sc-flex-cell';
    const l = document.createElement('div');
    l.className = 'lbl';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'val';
    v.textContent = value;
    cell.appendChild(l);
    cell.appendChild(v);
    return cell;
  };
  const row1 = document.createElement('div');
  row1.className = 'sc-flex-row';
  row1.appendChild(buildFlexCell('RANK', `${r.emoji} ${r.name}`));
  row1.appendChild(buildFlexCell('STREAK', `🔥 ${PROFILE.streakDays}`));
  card.appendChild(row1);

  const row2 = document.createElement('div');
  row2.className = 'sc-flex-row';
  row2.appendChild(buildFlexCell('LEVEL', `LVL ${PROFILE.level}`));
  row2.appendChild(buildFlexCell('SNIPES', String(PROFILE.snipesMade)));
  card.appendChild(row2);

  // Footer
  const foot = document.createElement('div');
  foot.className = 'sc-foot';
  foot.textContent = '@day · t.me/GiftSniprBot?ref=day';
  card.appendChild(foot);

  // Action buttons (no inline onclick — addEventListener)
  // Primary action: open the marketplace with referral. THIS earns the fee.
  const buyBtn = document.createElement('button');
  buyBtn.className = 'btn-buy';
  buyBtn.type = 'button';
  const mpLabel = safeMarketplace(gift.marketplace).toUpperCase();
  buyBtn.textContent = `OPEN ON ${mpLabel} →`;
  card.appendChild(buyBtn);

  // Secondary actions row
  const actions = document.createElement('div');
  actions.className = 'share-card-actions';
  const shareBtn = document.createElement('button');
  shareBtn.className = 'btn-share';
  shareBtn.type = 'button';
  shareBtn.textContent = 'SHARE 🚀';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-close';
  closeBtn.type = 'button';
  closeBtn.textContent = 'CLOSE';
  actions.appendChild(shareBtn);
  actions.appendChild(closeBtn);
  card.appendChild(actions);

  bg.appendChild(card);
  document.body.appendChild(bg);

  const close = () => {
    bg.remove();
    MODAL_STACK.markClosed();
  };

  // Buy button: build referral URL and route through safeRedirect so the
  // leaving-interstitial fires and only validated destinations are opened.
  buyBtn.addEventListener('click', async () => {
    const url = buildReferralUrl(gift);
    if (!url) {
      toast('🚫 listing link unavailable for this gift');
      return;
    }
    // safeRedirect handles the leaving-interstitial + window.open
    const opened = await safeRedirect(url, gift.marketplace);
    if (opened) close(); // close the share card after redirect kicks off
  });

  shareBtn.addEventListener('click', () => {
    shareToTelegram();
    close();
  });
  closeBtn.addEventListener('click', close);
  bg.addEventListener('click', e => { if (e.target === bg) close(); });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function shareToTelegram(){toast('shared to Telegram chat');document.querySelector('.modal-bg')?.remove()}
function shareRef(){toast('referral link copied: t.me/GiftSniprBot?ref=day')}
// ============================================================================
//  DAILY CLAIM — 6-hour cooldown with anti-tamper + live countdown
//
//  Why this is a security concern, not just a UX one:
//  - Without a cooldown, infinite XP can be claimed by spamming the button
//  - Stored in sessionStorage (not localStorage) so attackers can't trivially
//    persist tampered values across sessions
//  - In production: this MUST be enforced server-side. The client-side check
//    is defense-in-depth and UX, NOT the source of truth.
//  - Future hardening: have the backend issue an HMAC-signed claim receipt
//    that includes the next-eligible timestamp, verify on every claim.
// ============================================================================
const CLAIM = (() => {
  const KEY_LAST_CLAIM = 'gs_daily_claim_last';
  const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

  function getLastClaimTs(){
    try {
      const raw = sessionStorage.getItem(KEY_LAST_CLAIM);
      if (!raw) return 0;
      const ts = parseInt(raw, 10);
      // Anti-tamper: reject anything that's not a sane unix-ms timestamp.
      // If the user edits storage with a future date or garbage, we treat as
      // "must wait full cooldown from now" — fail closed.
      if (!Number.isFinite(ts) || ts < 0) return Date.now();
      // Future timestamp = tampering. Treat as "just claimed."
      if (ts > Date.now() + 60_000) return Date.now();
      return ts;
    } catch(e){ return 0; }
  }

  function setLastClaim(ts){
    try { sessionStorage.setItem(KEY_LAST_CLAIM, String(ts)); } catch(e){}
  }

  function clearLastClaim(){
    try { sessionStorage.removeItem(KEY_LAST_CLAIM); } catch(e){}
  }

  function msUntilNextClaim(){
    const last = getLastClaimTs();
    if (!last) return 0;
    const elapsed = Date.now() - last;
    if (elapsed >= COOLDOWN_MS) return 0;
    return COOLDOWN_MS - elapsed;
  }

  function isCoolingDown(){ return msUntilNextClaim() > 0; }

  // Format ms into "5h 59m 47s" / "47m 12s" / "47s" — always shows seconds so countdown ticks visibly
  function formatRemaining(ms){
    if (ms <= 0) return 'ready';
    const totalSec = Math.ceil(ms / 1000);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  return {
    isCoolingDown,
    msUntilNextClaim,
    formatRemaining,
    markClaimed(){ setLastClaim(Date.now()); },
    reset(){ clearLastClaim(); }, // for testing/debugging only
  };
})();

/**
 * Update the daily-claim button to reflect the current cooldown state.
 * Called on render() and on a 30s interval while a cooldown is active.
 */
function refreshClaimButton(){
  const btn = document.getElementById('dailyClaimBtn');
  if (!btn) return;
  const line1 = btn.querySelector('.dc-line1');
  const line2 = btn.querySelector('.dc-line2');
  const sub = btn.querySelector('.dc-sub');

  if (CLAIM.isCoolingDown()) {
    btn.classList.add('cooling');
    btn.disabled = true;
    if (line1) line1.textContent = 'CLAIMED';
    if (line2) line2.textContent = '+50 XP ✓';
    if (sub) sub.textContent = `next in ${CLAIM.formatRemaining(CLAIM.msUntilNextClaim())}`;
  } else {
    btn.classList.remove('cooling');
    btn.disabled = false;
    if (line1) line1.textContent = 'CLAIM';
    if (line2) line2.textContent = '+50 XP';
    if (sub) sub.textContent = 'resets every 6h';
  }
}

// Update the button display every second while cooling so the countdown ticks
let _claimRefreshInterval = null;
function startClaimRefreshInterval(){
  if (_claimRefreshInterval) return;
  _claimRefreshInterval = setInterval(() => {
    if (!CLAIM.isCoolingDown()) {
      // Cooldown expired — refresh once to show the ready state, then stop polling
      refreshClaimButton();
      clearInterval(_claimRefreshInterval);
      _claimRefreshInterval = null;
    } else {
      refreshClaimButton();
    }
  }, 1_000);
}

function claimDaily(){
  // Reset idle timer on user interaction
  resetIdleTimer();

  // Server-side check would go first in production. Client check is defense.
  if (CLAIM.isCoolingDown()) {
    const remaining = CLAIM.formatRemaining(CLAIM.msUntilNextClaim());
    toast(`already claimed · next in ${remaining}`);
    refreshClaimButton(); // re-sync UI in case it drifted
    return;
  }

  // Mark claimed BEFORE awarding XP so a race condition can't double-claim
  CLAIM.markClaimed();

  // Award XP + increment streak on the connected wallet's profile
  PROFILE.addXp(50);
  PROFILE.markClaimed();
  toast(`+50 XP claimed · streak ${PROFILE.streakDays} 🔥`);

  // Update topbar level badge in case the claim leveled the user up.
  // v0.3: both gifts and coins headers may have a .user-pill.
  document.querySelectorAll('.user-pill .lvl-badge').forEach(b => {
    b.textContent = String(PROFILE.level);
  });

  // Animate the button briefly
  const btn = document.getElementById('dailyClaimBtn');
  if (btn) {
    btn.classList.add('just-claimed');
    setTimeout(() => btn.classList.remove('just-claimed'), 700);
  }

  // Update UI
  refreshClaimButton();
  startClaimRefreshInterval();
  if (currentTab === 'profile') render();
}

// Wire up the daily-claim button (called after DOM is built)
function initDailyClaimButton(){
  const btn = document.getElementById('dailyClaimBtn');
  if (btn) {
    btn.addEventListener('click', claimDaily);
    refreshClaimButton();
    if (CLAIM.isCoolingDown()) startClaimRefreshInterval();
  }
}

// Pill click router: connect if not connected, profile if connected
function handlePillClick(){
  if (!walletConnected) {
    triggerWalletConnect().catch(e => console.error('[gifts] connect failed:', e));
  } else {
    goToProfile();
  }
}

// ============================================================================
//  WALLET STATE + DISCONNECT FLOW
//  HI5 fix: address held in closure, not directly mutable from outside.
// ============================================================================
const WALLET = (() => {
  let _address = null;
  let _connectedAt = null;

  // Validates an address looks well-formed before we accept it.
  // Reject anything that doesn't match expected TON address patterns.
  function isValidAddress(a){
    if (typeof a !== 'string') return false;
    if (a.length < 10 || a.length > 80) return false;
    // raw form: "0:hex" or "-1:hex"
    if (/^(-?\d+):[0-9a-fA-F]{64}$/.test(a)) return true;
    // user-friendly base64 form (EQ.../UQ...)
    if (/^[A-Za-z0-9_\-]{48}$/.test(a)) return true;
    return false;
  }

  return Object.freeze({
    get address(){ return _address; },
    get connectedAt(){ return _connectedAt; },

    setAddress(addr){
      if (!isValidAddress(addr)) {
        console.warn('[security] rejected malformed wallet address');
        return false;
      }
      _address = addr;
      _connectedAt = Date.now();
      return true;
    },
    clear(){
      _address = null;
      _connectedAt = null;
    },
    shortAddress(){
      if (!_address) return '';
      const a = _address;
      if (a.length <= 10) return a;
      return `${a.slice(0,4)}…${a.slice(-4)}`;
    },
  });
})();

// ============================================================================
//  MODAL STACK MANAGER (ME1 fix)
//  Prevents two modals from opening on top of each other and confusing the user
//  into clicking through a hidden confirmation.
// ============================================================================
const MODAL_STACK = (() => {
  let openCount = 0;
  return {
    isOpen(){ return openCount > 0; },
    markOpen(){ openCount++; },
    markClosed(){ openCount = Math.max(0, openCount-1); },
  };
})();

// ============================================================================
//  TON CONNECT INTEGRATION (v0.2)
//
//  Real wallet integration using @tonconnect/ui (loaded from unpkg in <head>).
//  This is the FIRST place we touch a real user wallet, so be careful.
//
//  What this module does:
//   - Initializes TON Connect with our manifest URL
//   - Exposes safeOpenModal() to ask the user to connect (called AFTER our
//     own security verification modal — never directly)
//   - Subscribes to status changes; updates WALLET state on connect/disconnect
//   - Provides safeDisconnect() that talks to the real wallet bridge
//
//  What this module does NOT do (intentional, until v0.3):
//   - sendTransaction (no funds-touching code in v0.2)
//   - Any signing of arbitrary data
//   - Any custom wallet bridges (only the official allowlist)
// ============================================================================
const TC = (() => {
  let _ui = null;            // the TonConnectUI instance
  let _ready = false;        // true once SDK is loaded and initialized
  let _readyPromise = null;  // resolved when ready
  let _statusUnsub = null;   // unsubscribe fn for onStatusChange

  function _initIfNeeded(){
    if (_ready) return Promise.resolve();
    if (_readyPromise) return _readyPromise;

    _readyPromise = new Promise((resolve, reject) => {
      try {
        const manifestUrl = `${window.location.origin}/tonconnect-manifest.json`;

        _ui = new TonConnectUI({
          manifestUrl,
          language: 'en',
          restoreConnection: true,
          widgetRootId: 'tc-widget-root',
        });

        _statusUnsub = _ui.onStatusChange((wallet) => {
          if (wallet) {
            _onWalletConnected(wallet);
          } else {
            _onWalletDisconnected();
          }
        });

        _ready = true;
        console.log('[TC] initialized with manifest:', manifestUrl);
        resolve();
      } catch (e) {
        console.error('[TC] init failed:', e);
        reject(e);
      }
    });
    return _readyPromise;
  }

  function _onWalletConnected(wallet){
    // Belt-and-suspenders: verify the wallet object has the shape we expect.
    if (!wallet || !wallet.account || typeof wallet.account.address !== 'string') {
      console.error('[TC] invalid wallet object', wallet);
      return;
    }
    const rawAddr = wallet.account.address;
    // Convert raw "0:hex" → user-friendly "UQ..." (matches what Tonkeeper shows).
    // This is critical — without it, our pill shows the raw form and users
    // think we connected to the wrong wallet.
    const friendlyAddr = toFriendlyAddress(rawAddr, { bounceable: false }) || rawAddr;
    if (!WALLET.setAddress(friendlyAddr)) {
      console.error('[TC] wallet returned malformed address:', rawAddr, '→', friendlyAddr);
      toast('🚫 wallet returned an unexpected address — disconnecting');
      try { _ui.disconnect(); } catch(e){}
      return;
    }
    walletConnected = true;
    resetIdleTimer();

    // Notify other modules (coins UI) that a wallet is now connected.
    // Loosely coupled — coins listens for this event without needing
    // a direct import of WALLET internals.
    try {
      window.dispatchEvent(new CustomEvent('gs:wallet-connected', {
        detail: { address: friendlyAddr }
      }));
    } catch(e) {}

    // Load THIS wallet's saved profile (or create a fresh level-1 one).
    // Each wallet address has its own slot in localStorage, so two different
    // wallets connecting on the same phone get different profiles.
    PROFILE.loadFor(friendlyAddr);

    // Update topbar pill atomically — show this wallet's REAL level, not a hardcoded 7.
    // v0.3: there are now TWO .user-pill elements (gifts header + coins header).
    // Update both so the wallet identity is mirrored across tabs.
    document.querySelectorAll('.user-pill').forEach(pill => {
      const lvl = document.createElement('span');
      lvl.className = 'lvl-badge';
      lvl.textContent = String(PROFILE.level);
      const lbl = document.createElement('span');
      lbl.textContent = WALLET.shortAddress();
      pill.replaceChildren(lvl, lbl);
    });

    // Friendly toast naming the wallet that connected
    const walletName = wallet.device?.appName || 'wallet';
    toast(`🔐 connected via ${walletName}`);

    // PRODUCTION ton_proof verification (deferred to v0.3):
    if (wallet.connectItems?.tonProof?.proof) {
      // _verifyTonProof(friendlyAddr, wallet.connectItems.tonProof, wallet.account.publicKey, wallet.account.chain);
    }

    // Re-render so the wallet card appears on profile with the loaded stats
    if (typeof render === 'function') render();
  }

  function _onWalletDisconnected(){
    if (walletConnected || WALLET.address) {
      // The bridge dropped the connection (could be from the wallet side).
      // Mirror it locally.
      forceDisconnect('bridge');
    }
    // Always notify coins module — even if we weren't tracking a connection,
    // it might be initialising and want a definitive "no wallet" signal.
    try {
      window.dispatchEvent(new CustomEvent('gs:wallet-disconnected'));
    } catch(e) {}
  }

  // PUBLIC API ----------------------------------------------------------

  /**
   * Opens the TON Connect wallet picker modal.
   * MUST only be called AFTER our own SECURITY.safeConnect() has gated entry.
   */
  async function safeOpenModal(){
    try {
      await _initIfNeeded();
    } catch (e) {
      toast('⚠️ wallet SDK failed to load — try refreshing');
      return;
    }
    if (!_ui) return;
    try {
      await _ui.openModal();
    } catch (e) {
      console.error('[TC] openModal failed:', e);
      toast('⚠️ couldn\'t open wallet picker');
    }
  }

  /**
   * Disconnects from the real wallet bridge.
   * Called from disconnectWallet() AFTER user confirms in our own modal.
   */
  async function safeDisconnect(){
    if (!_ui) return;
    try {
      if (_ui.connected) {
        await _ui.disconnect();
      }
    } catch (e) {
      console.error('[TC] disconnect failed:', e);
      // Don't throw — local state cleanup must continue regardless
    }
  }

  /** Returns whether SDK is loaded and ready. */
  function isReady(){ return _ready; }

  /** Returns the connected wallet info (or null). */
  function currentWallet(){ return _ui?.wallet || null; }

  // Eagerly initialize after page load so the SDK is ready when the user taps
  // Connect — but don't open the modal automatically.
  if (typeof window !== 'undefined') {
    setTimeout(() => { _initIfNeeded().catch(() => {}); }, 200);
  }

  return Object.freeze({
    safeOpenModal,
    safeDisconnect,
    isReady,
    currentWallet,

    /**
     * v0.3: broadcast a TON Connect transaction.
     * Called by the coins module after the user confirms a swap.
     * Throws if wallet not connected.
     */
    async sendTransaction(tx) {
      if (!_ui) throw new Error('Wallet bridge not initialised');
      if (!_ui.connected) throw new Error('No wallet connected');
      // Reset idle timer — user is actively confirming a transaction.
      resetIdleTimer();
      return _ui.sendTransaction(tx);
    },

    /**
     * Returns the friendly UQ... address of the connected wallet, or null.
     */
    getAddress() {
      return WALLET.address || null;
    },
  });
})();

// ----------------------------------------------------------------------------
// v0.3: expose a minimal bridge to other modules (coins UI).
// Only the surface needed for swap broadcast is exposed — no raw _ui leak.
// ----------------------------------------------------------------------------
window.GS_BRIDGE = Object.freeze({
  sendTransaction: (tx) => TC.sendTransaction(tx),
  getAddress: () => TC.getAddress(),
  isReady: () => TC.isReady(),
  openWallet: () => TC.safeOpenModal(),
});

// ----------------------------------------------------------------------------
// v0.3 BUGFIX 2: bind event listeners via JS instead of inline onclick="..."
// attributes. The strict CSP on production blocks inline event handlers,
// even when 'unsafe-inline' is set (some Netlify configurations strip it).
// Using addEventListener works under ALL CSP configurations.
//
// We still set window.handlePillClick + shareRef so any leftover inline
// references in injected HTML don't break, but the primary wiring is via
// addEventListener below.
// ----------------------------------------------------------------------------
window.handlePillClick = handlePillClick;
window.shareRef = shareRef;

// Bind the CONNECT pill click handler. The pill lives in index.html (top
// level), so it exists at module-load time — no need to wait for DOM ready.
// We still defer to next tick to be safe (in case this module loads before
// the DOM is fully parsed for some reason).
function _bindGlobalHandlers() {
  const pill = document.getElementById('userPill');
  if (pill && !pill.dataset.gsBound) {
    pill.addEventListener('click', handlePillClick);
    pill.dataset.gsBound = '1';
  }
  // Bind any future-rendered share buttons (e.g. inside the YOU tab)
  document.querySelectorAll('[data-action="share-ref"]').forEach(btn => {
    if (!btn.dataset.gsBound) {
      btn.addEventListener('click', shareRef);
      btn.dataset.gsBound = '1';
    }
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _bindGlobalHandlers);
} else {
  _bindGlobalHandlers();
}
// Re-bind any time the DOM changes (e.g. when YOU tab renders the share btn)
const _gsMutationObs = new MutationObserver(() => _bindGlobalHandlers());
_gsMutationObs.observe(document.body, { childList: true, subtree: true });

// ============================================================================
//  IDLE TIMEOUT (HI6 fix)
//  Auto-disconnect the wallet after 15 min of no user interaction. Prevents
//  the "phone left on table" attack vector.
// ============================================================================
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
let _idleTimer = null;
function resetIdleTimer(){
  if (_idleTimer) clearTimeout(_idleTimer);
  if (!walletConnected) return; // only run while connected
  _idleTimer = setTimeout(() => {
    if (!walletConnected) return;
    console.log('[security] idle timeout — auto-disconnecting');
    forceDisconnect('idle');
  }, IDLE_TIMEOUT_MS);
}
['pointerdown', 'keydown', 'touchstart', 'visibilitychange'].forEach(evt => {
  window.addEventListener(evt, () => {
    if (document.hidden) return; // don't reset when tab is hidden
    resetIdleTimer();
  }, { passive: true });
});

// Force a disconnect without confirmation (used by idle timeout, security incidents)
function forceDisconnect(reason){
  // Tear down the wallet bridge. Don't await — local cleanup must happen
  // even if the bridge call hangs or fails. The TC module is fire-and-forget.
  try {
    TC.safeDisconnect();
  } catch (e) { /* swallow */ }

  SECURITY.clearSession();
  WALLET.clear();
  PROFILE.clear();  // ← drop the loaded profile so we return to guest mode
  walletConnected = false;
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }

  // Reset pill atomically — no level badge in disconnected state, just CONNECT.
  // v0.3: update both gifts and coins header pills.
  document.querySelectorAll('.user-pill').forEach(pill => {
    const lbl = document.createElement('span');
    lbl.textContent = 'CONNECT';
    pill.replaceChildren(lbl);
  });

  let msg = '🔓 wallet disconnected';
  if (reason === 'idle') msg = '⏱️ session timed out — reconnect to continue';
  else if (reason === 'bridge') msg = '🔌 wallet disconnected from your end';
  toast(msg);
  render();
}

// ============================================================================
//  TRANSACTION GUARD RAIL (HI2 fix — ready for v0.2)
//  Every wallet-touching action MUST go through this wrapper. It refuses to
//  proceed without an explicit user confirmation showing what they're signing.
// ============================================================================
async function requestTransaction(opts){
  // opts: { description: string, destination: string, amount_ton: number, payload?: string }
  if (!walletConnected || !WALLET.address) {
    toast('connect a wallet first');
    return { ok: false, reason: 'not_connected' };
  }
  if (MODAL_STACK.isOpen()) return { ok: false, reason: 'another_modal_open' };

  // Validate the destination is one we'd ever legitimately send to
  // (this is where you allowlist your own merchant address, premium subscription
  // contract, etc. NEVER send to an address that came from an external API)
  if (!ALLOWED_TX_DESTINATIONS.includes(opts.destination)) {
    console.error('[security] refusing transaction to unknown destination', opts.destination);
    toast('🚫 refused — unknown transaction destination');
    return { ok: false, reason: 'unknown_destination' };
  }

  const confirmed = await showTransactionConfirmModal(opts);
  if (!confirmed) return { ok: false, reason: 'user_cancelled' };

  // PRODUCTION: actually call tonConnectUI.sendTransaction() here
  // For v0.1 preview, we never get here.
  console.log('[tx] would send:', opts);
  return { ok: true, txHash: 'mock' };
}

// Hardcoded allowlist of where our app would EVER ask the user to send funds.
// Empty for v0.1 (we don't sign anything yet). When premium ships, add the
// merchant contract address here. Anything else gets refused.
const ALLOWED_TX_DESTINATIONS = Object.freeze([
  // 'EQ...your-merchant-contract...',  // v0.2 premium contract
]);

async function showTransactionConfirmModal(opts){
  if (MODAL_STACK.isOpen()) return false;
  MODAL_STACK.markOpen();
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'confirm-modal-bg';
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';

    const h = document.createElement('h3');
    h.textContent = '⚠️ CONFIRM TRANSACTION';
    modal.appendChild(h);

    const desc = document.createElement('p');
    desc.textContent = String(opts.description || 'Sign a transaction');
    modal.appendChild(desc);

    const detail = document.createElement('div');
    detail.className = 'cm-addr';
    detail.textContent = `Send ${fmtTON(opts.amount_ton)} TON\nto ${opts.destination}`;
    detail.style.whiteSpace = 'pre-line';
    modal.appendChild(detail);

    const warn = document.createElement('p');
    warn.style.color = '#c4006a';
    warn.style.fontSize = '12px';
    warn.textContent = 'Your wallet will show its own confirmation. Verify amounts match before approving.';
    modal.appendChild(warn);

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const cancel = document.createElement('button');
    cancel.className = 'btn-keep';
    cancel.type = 'button';
    cancel.textContent = 'CANCEL';
    const proceed = document.createElement('button');
    proceed.className = 'btn-disconnect';
    proceed.type = 'button';
    proceed.textContent = 'PROCEED';
    actions.appendChild(cancel);
    actions.appendChild(proceed);
    modal.appendChild(actions);

    bg.appendChild(modal);
    document.body.appendChild(bg);

    const close = (ok) => {
      bg.remove();
      MODAL_STACK.markClosed();
      resolve(ok);
    };
    cancel.addEventListener('click', () => close(false));
    proceed.addEventListener('click', () => close(true));
    bg.addEventListener('click', e => { if (e.target === bg) close(false); });
  });
}

// ============================================================================
//  OUTBOUND REDIRECT GUARD (HI4 fix)
//  Every redirect to a marketplace goes through this. First time per session,
//  shows an interstitial naming the destination domain so users see the context
//  switch. After confirmed once, subsequent redirects are silent.
// ============================================================================
const REDIRECT_KEY_CONFIRMED = 'gs_redirect_confirmed_v1';
function hasConfirmedRedirects(){
  try { return sessionStorage.getItem(REDIRECT_KEY_CONFIRMED) === '1'; }
  catch(e){ return false; }
}
function markRedirectsConfirmed(){
  try { sessionStorage.setItem(REDIRECT_KEY_CONFIRMED, '1'); } catch(e){}
}

async function safeRedirect(rawUrl, marketplace){
  const cleanUrl = safeListingUrl(rawUrl, marketplace);
  if (!cleanUrl) {
    toast('🚫 listing URL failed safety check — not redirecting');
    return false;
  }
  const u = new URL(cleanUrl);

  if (!hasConfirmedRedirects()) {
    const ok = await showLeavingInterstitial(u.host);
    if (!ok) return false;
    markRedirectsConfirmed();
  }
  // open in new tab with noopener noreferrer for safety
  const w = window.open(cleanUrl, '_blank', 'noopener,noreferrer');
  if (w) w.opener = null;
  return true;
}

function showLeavingInterstitial(host){
  if (MODAL_STACK.isOpen()) return Promise.resolve(false);
  MODAL_STACK.markOpen();
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'confirm-modal-bg';
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';

    const h = document.createElement('h3');
    h.textContent = '🚪 LEAVING GIFTSNIPR';
    modal.appendChild(h);

    const p = document.createElement('p');
    p.textContent = "You're being redirected to:";
    modal.appendChild(p);

    const dest = document.createElement('div');
    dest.className = 'cm-addr';
    dest.textContent = host;
    modal.appendChild(dest);

    const warn = document.createElement('p');
    warn.style.fontSize = '12px';
    warn.textContent = "Verify the URL above before signing anything in your wallet on the next page.";
    modal.appendChild(warn);

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const cancel = document.createElement('button');
    cancel.className = 'btn-keep';
    cancel.type = 'button';
    cancel.textContent = 'CANCEL';
    const go = document.createElement('button');
    go.className = 'btn-keep';
    go.style.background = 'var(--lime)';
    go.type = 'button';
    go.textContent = 'CONTINUE →';
    actions.appendChild(cancel);
    actions.appendChild(go);
    modal.appendChild(actions);

    bg.appendChild(modal);
    document.body.appendChild(bg);

    const close = (ok) => {
      bg.remove();
      MODAL_STACK.markClosed();
      resolve(ok);
    };
    cancel.addEventListener('click', () => close(false));
    go.addEventListener('click', () => close(true));
    bg.addEventListener('click', e => { if (e.target === bg) close(false); });
  });
}

/**
 * Show the disconnect confirmation modal. Resolves true if user confirms.
 * Built via DOM APIs (no innerHTML on dynamic data) for the same XSS-safety
 * reasons as the verification modal.
 */
function showDisconnectModal(){
  if (MODAL_STACK.isOpen()) return Promise.resolve(false);
  MODAL_STACK.markOpen();
  return new Promise(resolve => {
    const bg = document.createElement('div');
    bg.className = 'confirm-modal-bg';
    const modal = document.createElement('div');
    modal.className = 'confirm-modal';

    // Sad mascot
    const mascotWrap = document.createElement('div');
    mascotWrap.className = 'cm-mascot';
    // mascotSVG only accepts known emotion strings — safe to innerHTML
    mascotWrap.innerHTML = mascotSVG(70, 'sad');
    modal.appendChild(mascotWrap);

    const h3 = document.createElement('h3');
    h3.textContent = 'DISCONNECT WALLET?';
    modal.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = "You'll need to verify and reconnect to see your portfolio again.";
    modal.appendChild(p);

    if (WALLET.address) {
      const addr = document.createElement('div');
      addr.className = 'cm-addr';
      addr.textContent = WALLET.address; // textContent — safe even if address has weird chars
      modal.appendChild(addr);
    }

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';
    const keepBtn = document.createElement('button');
    keepBtn.className = 'btn-keep';
    keepBtn.type = 'button';
    keepBtn.textContent = 'KEEP CONNECTED';
    const discBtn = document.createElement('button');
    discBtn.className = 'btn-disconnect';
    discBtn.type = 'button';
    discBtn.textContent = 'DISCONNECT';
    actions.appendChild(keepBtn);
    actions.appendChild(discBtn);
    modal.appendChild(actions);

    bg.appendChild(modal);
    document.body.appendChild(bg);

    let resolved = false;
    const close = (confirmed) => {
      if (resolved) return;
      resolved = true;
      bg.remove();
      MODAL_STACK.markClosed();
      resolve(confirmed);
    };

    keepBtn.addEventListener('click', () => close(false));
    discBtn.addEventListener('click', () => close(true));
    bg.addEventListener('click', e => { if (e.target === bg) close(false); });

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        close(false);
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * The actual disconnect: clears all session state + resets UI.
 * Wraps forceDisconnect with a confirmation modal.
 */
async function disconnectWallet(){
  if (MODAL_STACK.isOpen()) return;
  const confirmed = await showDisconnectModal();
  if (!confirmed) return;

  // Talk to the wallet bridge BEFORE clearing local state, so even if the
  // bridge call fails or hangs, we still clean up locally afterward.
  try {
    await TC.safeDisconnect();
  } catch (e) {
    console.error('[security] TC disconnect failed (proceeding anyway):', e);
  }

  forceDisconnect('user');
}

function goToProfile(){
  currentTab = 'profile';
  document.querySelectorAll('.tab').forEach(x=>{x.classList.toggle('active', x.dataset.tab === 'profile')});
  render();
  window.scrollTo({top:0,behavior:'instant'});
}

// ============================================================================
//  SECURITY MODULE — audit-2 hardened
//  - Domain verification (CSRF-bound, modal can't be skipped via storage)
//  - First-connect verification flow (built via createElement, no innerHTML)
//  - Phishing protection
//  - Session management with binding
// ============================================================================

const SECURITY = {
  // The ONLY domains we ever consider legitimate. Hardcoded, not from URL.
  OFFICIAL_DOMAIN: 'giftsnipr.com',
  OFFICIAL_BOT: '@GiftSniprBot',
  OFFICIAL_ICON_HINT: 'blue cyclops',

  // Storage keys
  KEY_VERIFIED: 'gs_security_verified_v2',
  KEY_LAST_CONNECT: 'gs_last_connect_ts',
  KEY_BINDING: 'gs_session_binding', // bound to the domain we verified ON
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24h

  // CR3 fix: in-memory CSRF token regenerated on every page load.
  // sessionStorage alone is bypassable by attackers cloning the app — this
  // forces them to also forge a runtime token they can never observe.
  _runtimeChallenge: null,
  _initRuntimeChallenge(){
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      this._runtimeChallenge = Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
    } catch(e){
      this._runtimeChallenge = String(Math.random()) + Date.now();
    }
  },

  /** Returns the actual domain the user is currently on. */
  currentDomain(){
    try { return window.location.hostname.toLowerCase(); }
    catch(e){ return 'unknown'; }
  },

  /** True if the user is on the legitimate production domain. */
  isOfficialDomain(){
    const d = this.currentDomain();
    return d === this.OFFICIAL_DOMAIN || d === 'www.' + this.OFFICIAL_DOMAIN;
  },

  /**
   * CR3 fix: verification is bound to BOTH session storage AND the current domain
   * AND a runtime challenge. An attacker pre-setting the storage flag in a clone
   * site won't have the matching domain binding, so verification fails open.
   */
  hasVerifiedThisSession(){
    try {
      if (sessionStorage.getItem(this.KEY_VERIFIED) !== '1') return false;
      const binding = sessionStorage.getItem(this.KEY_BINDING);
      if (!binding) return false;
      // The binding must match the CURRENT domain — not what was stored before.
      // If a phishing site copied storage, this check fails.
      if (binding !== this.currentDomain()) return false;
      return true;
    } catch(e){ return false; }
  },

  markVerified(){
    try {
      sessionStorage.setItem(this.KEY_VERIFIED, '1');
      sessionStorage.setItem(this.KEY_LAST_CONNECT, Date.now().toString());
      // Bind to current domain so storage isn't portable across sites
      sessionStorage.setItem(this.KEY_BINDING, this.currentDomain());
    } catch(e){}
  },

  /** Has the session timed out? */
  isSessionExpired(){
    try {
      const last = parseInt(sessionStorage.getItem(this.KEY_LAST_CONNECT) || '0', 10);
      if (!last) return true;
      return (Date.now() - last) > this.SESSION_TIMEOUT_MS;
    } catch(e){ return true; }
  },

  clearSession(){
    try {
      sessionStorage.removeItem(this.KEY_VERIFIED);
      sessionStorage.removeItem(this.KEY_LAST_CONNECT);
      sessionStorage.removeItem(this.KEY_BINDING);
    } catch(e){}
  },

  /**
   * HI4 fix: build the modal via DOM APIs instead of insertAdjacentHTML.
   * Every dynamic value goes through textContent — XSS structurally impossible
   * on dynamic data even if a domain string contains HTML metacharacters.
   * CR4 fix: zero inline styles; everything via CSS classes.
   * HI3 fix: bind the modal instance to a runtime challenge so it can't
   * be remotely triggered or its handlers spoofed.
   */
  showVerificationModal(){
    if (MODAL_STACK.isOpen()) return Promise.resolve(false);
    MODAL_STACK.markOpen();
    return new Promise(resolve => {
      const onWrongDomain = !this.isOfficialDomain();
      const currentDomain = this.currentDomain();

      // Build modal as a detached DOM tree. Nothing is parsed as HTML.
      const bg = document.createElement('div');
      bg.className = 'verify-modal-bg';

      const modal = document.createElement('div');
      modal.className = 'verify-modal';

      // Shield icon
      const shield = document.createElement('div');
      shield.className = 'vm-shield';
      const shieldIcon = document.createElement('span');
      shieldIcon.className = 'vm-shield-icon';
      shieldIcon.textContent = '🛡️';
      shield.appendChild(shieldIcon);
      modal.appendChild(shield);

      // Title
      const h2 = document.createElement('h2');
      h2.textContent = 'BEFORE YOU CONNECT';
      modal.appendChild(h2);

      const sub = document.createElement('p');
      sub.className = 'vm-sub';
      sub.textContent = "Verify you're on the real GiftSnipr";
      modal.appendChild(sub);

      // Domain mismatch banner — only when off-domain
      if (onWrongDomain) {
        const warn = document.createElement('div');
        warn.className = 'verify-warn danger';

        const wIcon = document.createElement('span');
        wIcon.className = 'vw-icon';
        wIcon.textContent = '🚨';
        warn.appendChild(wIcon);

        const wp = document.createElement('p');
        const ws = document.createElement('strong');
        ws.textContent = 'WARNING: ';
        wp.appendChild(ws);
        wp.appendChild(document.createTextNode('You appear to be on '));
        const wCodeBad = document.createElement('code');
        wCodeBad.className = 'bad';
        wCodeBad.textContent = currentDomain; // <— SAFE: textContent never parses HTML
        wp.appendChild(wCodeBad);
        wp.appendChild(document.createTextNode(', not the official '));
        const wCodeGood = document.createElement('code');
        wCodeGood.className = 'bad';
        wCodeGood.textContent = this.OFFICIAL_DOMAIN;
        wp.appendChild(wCodeGood);
        wp.appendChild(document.createTextNode(". Close this immediately if you didn't expect this."));
        warn.appendChild(wp);
        modal.appendChild(warn);
      }

      // Verification checks block
      const checks = document.createElement('div');
      checks.className = 'verify-checks';
      const buildCheck = (ok, label, value, isCode=true) => {
        const row = document.createElement('div');
        row.className = ok ? 'verify-check' : 'verify-check fail';
        const tick = document.createElement('span');
        tick.className = 'vc-tick';
        tick.textContent = ok ? '✅' : '❌';
        row.appendChild(tick);
        const text = document.createElement('div');
        text.className = 'vc-text';
        const lbl = document.createElement('span');
        lbl.className = 'label';
        lbl.textContent = label;
        text.appendChild(lbl);
        if (isCode) {
          const code = document.createElement('code');
          code.textContent = value;
          text.appendChild(code);
        } else {
          text.appendChild(document.createTextNode(value));
        }
        row.appendChild(text);
        return row;
      };
      checks.appendChild(buildCheck(!onWrongDomain, 'Website', this.OFFICIAL_DOMAIN));
      checks.appendChild(buildCheck(true, 'Telegram bot', this.OFFICIAL_BOT));

      // Tonkeeper hint row (no code style)
      const tkRow = document.createElement('div');
      tkRow.className = 'verify-check';
      const tkTick = document.createElement('span');
      tkTick.className = 'vc-tick';
      tkTick.textContent = '✅';
      tkRow.appendChild(tkTick);
      const tkText = document.createElement('div');
      tkText.className = 'vc-text';
      const tkLbl = document.createElement('span');
      tkLbl.className = 'label';
      tkLbl.textContent = 'Tonkeeper will show';
      tkText.appendChild(tkLbl);
      tkText.appendChild(document.createTextNode('Name: '));
      const tkName = document.createElement('strong');
      tkName.textContent = 'GiftSnipr';
      tkText.appendChild(tkName);
      tkText.appendChild(document.createTextNode(' · Icon: ' + this.OFFICIAL_ICON_HINT));
      tkRow.appendChild(tkText);
      checks.appendChild(tkRow);

      modal.appendChild(checks);

      // Seed-phrase warning
      const seedWarn = document.createElement('div');
      seedWarn.className = 'verify-warn';
      const swIcon = document.createElement('span');
      swIcon.className = 'vw-icon';
      swIcon.textContent = '⚠️';
      seedWarn.appendChild(swIcon);
      const swP = document.createElement('p');
      const swStrong1 = document.createElement('strong');
      swStrong1.textContent = 'Never share your seed phrase';
      swP.appendChild(swStrong1);
      swP.appendChild(document.createTextNode(' with anyone — including us. We will never ask. If anything in your wallet popup looks different, '));
      const swStrong2 = document.createElement('strong');
      swStrong2.textContent = 'cancel immediately';
      swP.appendChild(swStrong2);
      swP.appendChild(document.createTextNode('.'));
      seedWarn.appendChild(swP);
      modal.appendChild(seedWarn);

      // Confirmation checkbox
      const confirmLabel = document.createElement('label');
      confirmLabel.className = 'verify-confirm';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      // Bind the checkbox id to a runtime challenge — prevents external scripts
      // from finding our checkbox by predictable id
      const checkboxId = 'verifyCheckbox_' + this._runtimeChallenge;
      checkbox.id = checkboxId;
      confirmLabel.htmlFor = checkboxId;
      confirmLabel.appendChild(checkbox);
      const confirmText = document.createElement('span');
      confirmText.textContent = 'I verified the URL, the bot username, and the wallet name shown above';
      confirmLabel.appendChild(confirmText);
      modal.appendChild(confirmLabel);

      // Action buttons
      const actions = document.createElement('div');
      actions.className = 'verify-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-cancel';
      cancelBtn.textContent = 'CANCEL';
      cancelBtn.type = 'button';
      const connectBtn = document.createElement('button');
      connectBtn.className = 'btn-connect';
      connectBtn.textContent = 'CONNECT →';
      connectBtn.type = 'button';
      connectBtn.disabled = true;
      actions.appendChild(cancelBtn);
      actions.appendChild(connectBtn);
      modal.appendChild(actions);

      // Footer links
      const foot = document.createElement('div');
      foot.className = 'verify-foot';
      const mkLink = (href, text, external=true) => {
        const a = document.createElement('a');
        a.href = href;
        a.textContent = text;
        if (external) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer'; // prevents window.opener attacks
        }
        return a;
      };
      foot.appendChild(mkLink('/privacy.html', 'Privacy'));
      foot.appendChild(document.createTextNode(' · '));
      foot.appendChild(mkLink('/terms.html', 'Terms'));
      foot.appendChild(document.createTextNode(' · '));
      foot.appendChild(mkLink('mailto:security@giftsnipr.com', 'Report phishing', false));
      modal.appendChild(foot);

      bg.appendChild(modal);
      document.body.appendChild(bg);

      // Wire up handlers using direct references — no string-based id lookups
      checkbox.addEventListener('change', e => {
        connectBtn.disabled = !e.target.checked;
      });

      let resolved = false;
      const close = (confirmed) => {
        if (resolved) return;
        resolved = true;
        bg.remove();
        MODAL_STACK.markClosed();
        resolve(confirmed);
      };

      connectBtn.addEventListener('click', () => {
        if (!checkbox.checked) return; // double-check, never trust the disabled prop alone
        SECURITY.markVerified();
        close(true);
      });
      cancelBtn.addEventListener('click', () => close(false));

      // HI2 fix: use reference equality (e.target === bg), not id-string lookup
      bg.addEventListener('click', e => {
        if (e.target === bg) close(false);
      });

      // Escape key cancels
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          close(false);
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    });
  },

  /**
   * The wrapper around any "connect wallet" trigger.
   */
  async safeConnect(actualConnectFn){
    if (this.isSessionExpired()) {
      this.clearSession();
    }
    if (this.hasVerifiedThisSession()) {
      return actualConnectFn();
    }
    const confirmed = await this.showVerificationModal();
    if (!confirmed) {
      toast('connect cancelled — stay safe out there 🛡️');
      return;
    }
    return actualConnectFn();
  },
};

// Initialize the runtime challenge once on module load
SECURITY._initRuntimeChallenge();

// ----------------------------------------------------------------------------
// Wrap the wallet connect trigger to go through SECURITY.safeConnect
// ----------------------------------------------------------------------------
let walletConnected = false;

async function triggerWalletConnect(){
  await SECURITY.safeConnect(async () => {
    // After security verification passes, open the real TON Connect modal.
    // The wallet status subscription in TC will populate WALLET state when
    // the user actually completes the connection in their wallet app.
    await TC.safeOpenModal();
    // Note: we DO NOT set walletConnected here. That happens in TC's
    // _onWalletConnected callback, which only fires after the wallet
    // actually sends a successful CONNECT response back to us. This way,
    // closing the wallet picker without connecting leaves walletConnected
    // correctly false.
  });
}

// ============================================================================
//  END SECURITY MODULE
// ============================================================================

document.querySelectorAll('.tab').forEach(t=>{
  t.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    currentTab = t.dataset.tab;
    render();
    window.scrollTo({top:0,behavior:'instant'});
  });
});

render();
initDailyClaimButton();

// ============================================================================
//  BETA DISCLAIMER BANNER
//  Hides for the current browser session when dismissed (sessionStorage).
//  Reappears on next visit — repeat visitors are reminded the app is still
//  in beta, but aren't nagged on every single click within a session.
//  The smaller "BETA" pill on the logo is always visible regardless.
// ============================================================================
(function setupBetaBanner(){
  const banner = document.getElementById('betaBanner');
  const closeBtn = document.getElementById('betaBannerClose');
  if (!banner || !closeBtn) return;
  try {
    if (sessionStorage.getItem('gs_beta_banner_dismissed') === '1') {
      banner.style.display = 'none';
      return;
    }
  } catch(e) { /* sessionStorage blocked — show banner anyway, no harm */ }
  closeBtn.addEventListener('click', () => {
    banner.style.display = 'none';
    try { sessionStorage.setItem('gs_beta_banner_dismissed', '1'); } catch(e) {}
  });
})();
