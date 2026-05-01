/**
 * DarkEye API Service
 * Wraps the Have I Been Ransomed API
 */

const API_BASE = '';
const API_KEY = 'advanced-hWrVDKYOO3l377JlV9Fjz5Pzjs5ogvNL';

const headers = () => ({
  'Authorization': `Bearer ${API_KEY}`,
});

async function apiFetch(url) {
  console.log(`[API] Fetching: ${url}`);
  const res = await fetch(url, { headers: headers() });
  console.log(`[API] Response status: ${res.status} ${res.statusText}`);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[API] Error response body:`, errText);
    try {
      const err = JSON.parse(errText);
      throw new Error(err?.error?.message || `API error ${res.status}`);
    } catch (parseErr) {
      throw new Error(`API error ${res.status}: ${errText.slice(0, 200)}`);
    }
  }
  const json = await res.json();
  console.log(`[API] Response keys:`, Object.keys(json));
  // console.log(`[API] Full response:`, JSON.stringify(json).slice(0, 500));
  return json;
}

/**
 * Search breach metadata for a domain (paginated)
 */
export async function* searchMetadata(domain, onProgress, limit = null) {
  let page = 1;
  let hasNext = true;
  let totalYielded = 0;

  while (hasNext) {
    if (onProgress) onProgress(`Fetching metadata page ${page}...`);
    try {
      const data = await apiFetch(
        `${API_BASE}/api/metadata/domain/${encodeURIComponent(domain)}?page=${page}`
      );
      console.log(`[Metadata] Page ${page} — success: ${data.success}, results count: ${data.sources?.length ?? data.results?.length ?? 'N/A'}, pagination:`, data.pagination);

      let batch = [];
      if (data.sources && Array.isArray(data.sources)) {
        batch = data.sources;
      } else if (data.results && Array.isArray(data.results)) {
        batch = data.results;
      } else if (data.data && Array.isArray(data.data)) {
        batch = data.data;
      }

      if (batch.length > 0) {
        if (limit) {
          const remaining = limit - totalYielded;
          if (batch.length > remaining) {
            batch = batch.slice(0, remaining);
            hasNext = false; // Force stop if limit reached
          }
        }
        yield batch;
        totalYielded += batch.length;
        if (limit && totalYielded >= limit) {
          hasNext = false;
        }
      }

      if (hasNext) {
        hasNext = data.pagination?.has_next || false;
      }
      page++;
    } catch (e) {
      console.warn('[Metadata] Pagination stopped:', e.message);
      hasNext = false;
    }
  }
}

/**
 * Search full breach data for a domain (paginated with search_after)
 */
export async function* searchFullData(domain, onProgress, limit = null) {
  yield* searchFullDataByField('domain', domain, onProgress, limit);
}

/**
 * Generic search for any field in breach data
 */
export async function* searchFullDataByField(field, term, onProgress, limit = null) {
  let searchAfter = 0;
  let hasNext = true;
  let pageNum = 1;
  let totalYielded = 0;

  while (hasNext) {
    if (onProgress) onProgress(`Fetching breach data (batch ${pageNum})...`);
    try {
      const url = searchAfter
        ? `${API_BASE}/api/fulldata/${field}/${encodeURIComponent(term)}?search_after=${searchAfter}`
        : `${API_BASE}/api/fulldata/${field}/${encodeURIComponent(term)}`;
      const data = await apiFetch(url);
      console.log(`[FullData] Batch ${pageNum} — success: ${data.success}, data count: ${data.data?.length ?? 'N/A'}, has_next: ${data.has_next_page}, search_after: ${data.search_after}, total_hits: ${data.total_hits}`);

      let batch = [];
      if (data.data && Array.isArray(data.data)) {
        batch = data.data;
      } else if (data.results && Array.isArray(data.results)) {
        batch = data.results;
      }

      if (batch.length > 0) {
        if (limit) {
          const remaining = limit - totalYielded;
          if (batch.length > remaining) {
            batch = batch.slice(0, remaining);
            hasNext = false;
          }
        }
        yield batch;
        totalYielded += batch.length;
        if (limit && totalYielded >= limit) hasNext = false;
      } else {
        hasNext = data.has_next_page || false;
      }

      if (hasNext) {
        hasNext = data.has_next_page || false;
      }
      searchAfter = data.search_after || 0;
      pageNum++;
    } catch (e) {
      console.warn('[FullData] Pagination stopped:', e.message);
      hasNext = false;
    }
  }
}

/**
 * Search infostealer logs for a domain (paginated with search_after)
 */
export async function* searchFullStealer(domain, onProgress) {
  yield* searchFullStealerByField('domain', domain, onProgress);
}

/**
 * Search infostealer logs for domain employees (paginated with search_after)
 */
export async function* searchFullStealerEmployees(domain, onProgress, limit = null) {
  let searchAfter = 0;
  let hasNext = true;
  let pageNum = 1;
  let totalYielded = 0;

  while (hasNext) {
    if (onProgress) onProgress(`Fetching domain employees data (batch ${pageNum})...`);
    try {
      const url = searchAfter
        ? `${API_BASE}/api/fullstealer/domain_employees/${encodeURIComponent(domain)}?search_after=${searchAfter}`
        : `${API_BASE}/api/fullstealer/domain_employees/${encodeURIComponent(domain)}`;
      const data = await apiFetch(url);
      console.log(`[FullStealerEmployees] Batch ${pageNum} — success: ${data.success}, matches count: ${data.matches?.length ?? 'N/A'}, has_next: ${data.has_next_page}`);

      let batch = [];
      if (data.matches && Array.isArray(data.matches)) {
        batch = data.matches;
      } else if (data.data && Array.isArray(data.data)) {
        batch = data.data;
      } else if (data.results && Array.isArray(data.results)) {
        batch = data.results;
      }

      if (batch.length > 0) {
        if (limit) {
          const remaining = limit - totalYielded;
          if (batch.length > remaining) {
            batch = batch.slice(0, remaining);
            hasNext = false;
          }
        }
        yield batch;
        totalYielded += batch.length;
        if (limit && totalYielded >= limit) hasNext = false;
      } else {
        hasNext = data.has_next_page || false;
      }

      if (hasNext) {
        hasNext = data.has_next_page || false;
      }
      searchAfter = data.search_after || 0;
      pageNum++;
    } catch (e) {
      console.warn('[FullStealerEmployees] Pagination stopped:', e.message);
      hasNext = false;
    }
  }
}

/**
 * Generic search for any field in infostealer logs
 */
export async function* searchFullStealerByField(field, term, onProgress, limit = null) {
  let searchAfter = 0;
  let hasNext = true;
  let pageNum = 1;
  let totalYielded = 0;

  while (hasNext) {
    if (onProgress) onProgress(`Fetching stealer data (batch ${pageNum})...`);
    try {
      const url = searchAfter
        ? `${API_BASE}/api/fullstealer/${field}/${encodeURIComponent(term)}?search_after=${searchAfter}`
        : `${API_BASE}/api/fullstealer/${field}/${encodeURIComponent(term)}`;
      const data = await apiFetch(url);
      console.log(`[FullStealer] Batch ${pageNum} — success: ${data.success}, matches count: ${data.matches?.length ?? 'N/A'}, has_next: ${data.has_next_page}`);

      let batch = [];
      if (data.matches && Array.isArray(data.matches)) {
        batch = data.matches;
      } else if (data.data && Array.isArray(data.data)) {
        batch = data.data;
      } else if (data.results && Array.isArray(data.results)) {
        batch = data.results;
      }

      if (batch.length > 0) {
        if (limit) {
          const remaining = limit - totalYielded;
          if (batch.length > remaining) {
            batch = batch.slice(0, remaining);
            hasNext = false;
          }
        }
        yield batch;
        totalYielded += batch.length;
        if (limit && totalYielded >= limit) hasNext = false;
      } else {
        hasNext = data.has_next_page || false;
      }

      if (hasNext) {
        hasNext = data.has_next_page || false;
      }
      searchAfter = data.search_after || 0;
      pageNum++;
    } catch (e) {
      console.warn('[FullStealer] Pagination stopped:', e.message);
      hasNext = false;
    }
  }
}

/**
 * Search fullstealer by filename/HWID (paginated with search_after)
 * @param {string} filename - The HWID/filename to search for
 * @returns {AsyncGenerator<Array>} Yields arrays of data records
 */
export async function* searchFullStealerFilename(filename) {
  let searchAfter = 0;
  let hasNext = true;
  let pageNum = 1;

  while (hasNext) {
    try {
      const url = searchAfter
        ? `${API_BASE}/api/fullstealer/filename/${encodeURIComponent(filename)}?search_after=${searchAfter}`
        : `${API_BASE}/api/fullstealer/filename/${encodeURIComponent(filename)}`;
      const data = await apiFetch(url);
      console.log(`[FullStealerFilename] Batch ${pageNum} — count: ${data.count ?? data.data?.length ?? 'N/A'}, has_next: ${data.has_next_page}`);

      let batch = [];
      if (data.data && Array.isArray(data.data)) {
        batch = data.data;
      } else if (data.matches && Array.isArray(data.matches)) {
        batch = data.matches;
      }
      if (batch.length > 0) yield batch;

      hasNext = data.has_next_page || false;
      searchAfter = data.search_after || 0;
      pageNum++;
    } catch (e) {
      console.warn('[FullStealerFilename] Pagination stopped:', e.message);
      hasNext = false;
    }
  }
}

/**
 * Get detailed info for a single user (by email) from both endpoints
 */
export async function getUserDetails(email) {
  const results = { breach: [], stealer: [] };
  try {
    const breachData = await apiFetch(
      `${API_BASE}/api/fulldata/email/${encodeURIComponent(email)}`
    );
    if (breachData.data) {
      results.breach = Array.isArray(breachData.data) ? breachData.data : [];
    }
  } catch (e) {
    console.warn(`[UserDetails] No breach data for ${email}:`, e.message);
  }
  try {
    const stealerData = await apiFetch(
      `${API_BASE}/api/fullstealer/email/${encodeURIComponent(email)}`
    );
    if (stealerData.data) {
      results.stealer = Array.isArray(stealerData.data) ? stealerData.data : [];
    }
  } catch (e) {
    console.warn(`[UserDetails] No stealer data for ${email}:`, e.message);
  }
  return results;
}

/**
 * Discover subdomains using crt.sh
 * @param {string} domain - The root domain to search
 * @returns {Promise<Array<string>>} List of unique subdomains
 */
export async function searchCrtsh(domain) {
  console.log(`[API] Fetching subdomains for: ${domain}`);
  try {
    const url = `https://crt.sh/?q=%.${encodeURIComponent(domain)}&output=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`crt.sh error: ${res.status}`);
    const data = await res.json();

    // Extract unique subdomains correctly
    const subdomains = new Set();
    for (const entry of data) {
      if (entry.name_value) {
        // name_value can contain multiple domains separated by newlines
        const names = entry.name_value.split('\n');
        for (let name of names) {
          name = name.trim().toLowerCase();
          // Remove wildcard prefixes if any
          if (name.startsWith('*.')) name = name.substring(2);
          if (name && name.endsWith(domain.toLowerCase()) && name !== domain.toLowerCase()) {
            subdomains.add(name);
          }
        }
      }
    }

    return Array.from(subdomains);
  } catch (e) {
    console.warn(`[API] Failed to fetch subdomains: ${e.message}`);
    return [];
  }
}

/**
 * OSINT BACKEND (FastAPI + Celery) INTEGRATION
 */
const OSINT_API_BASE = '';

export async function investigate(payload) {
  try {
    const res = await fetch(`${OSINT_API_BASE}/api/v1/investigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`OSINT Backend error: ${res.status}`);
    }

    const data = await res.json();
    return data.task_id;
  } catch (e) {
    console.error('[OSINT API] investigate error:', e);
    throw e;
  }
}

export async function checkInvestigationStatus(taskId) {
  try {
    const res = await fetch(`${OSINT_API_BASE}/api/v1/status/${taskId}`);
    if (!res.ok) {
      throw new Error(`OSINT Backend status error: ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    console.error('[OSINT API] status error:', e);
    throw e;
  }
}

// =====================================================================
// CRYPTO / BLOCKCHAIN API LAYER
// =====================================================================

const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjRlYmYwZDhkLTRmYzAtNGExOC05ZjBiLTgyYjRhNTljYjI4MCIsIm9yZ0lkIjoiNDQ5NjEiLCJ1c2VySWQiOiI0NDk2OSIsInR5cGVJZCI6IjIxYTMxMzgzLTQzMzktNDUwMi1iMzdkLWViYmMzOTZlMTYzZiIsInR5cGUiOiJQUk9KRUNUIiwiaWF0IjoxNzc0MDE3ODkyLCJleHAiOjQ5Mjk3Nzc4OTJ9.zx_Ez-1DKdxXT3ngdXz8CGYxJ7Zooxh_ke23ptO3P5c';

/**
 * Detect blockchain network from a wallet address string.
 * Returns 'EVM', 'BTC_INDIVIDUAL', 'BTC_XPUB', or 'UNKNOWN'.
 */
export function detectCryptoNetwork(address) {
  if (!address) return 'UNKNOWN';
  const trimmed = address.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return 'EVM';
  if (/^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})$/.test(trimmed)) return 'BTC_INDIVIDUAL';
  if (/^(xpub|ypub|zpub|vpub|upub)[a-zA-Z0-9]{100,115}$/.test(trimmed)) return 'BTC_XPUB';
  return 'UNKNOWN';
}

/**
 * Fetch EVM native balance + token balances via Moralis REST API.
 * @returns {{ nativeBalance: number, tokens: Array<{symbol: string, balance: number}> }}
 */
export async function fetchEVMBalance(address) {
  const chain = '0x1'; // Ethereum mainnet
  try {
    // Native balance
    const nativeRes = await fetch(
      `https://deep-index.moralis.io/api/v2.2/${address}/balance?chain=${chain}`,
      { headers: { 'X-API-Key': MORALIS_API_KEY, 'Accept': 'application/json' } }
    );
    if (!nativeRes.ok) throw new Error(`Moralis balance error: ${nativeRes.status}`);
    const nativeData = await nativeRes.json();
    const nativeBalance = Number(nativeData.balance || 0) / 1e18;

    // Token balances
    const tokenRes = await fetch(
      `https://deep-index.moralis.io/api/v2.2/${address}/erc20?chain=${chain}`,
      { headers: { 'X-API-Key': MORALIS_API_KEY, 'Accept': 'application/json' } }
    );
    let tokens = [];
    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      tokens = (Array.isArray(tokenData) ? tokenData : tokenData.result || []).map(t => ({
        symbol: t.symbol || 'UNKNOWN',
        balance: Number(t.balance || 0) / (10 ** (t.decimals || 18))
      }));
    }

    return { nativeBalance, tokens };
  } catch (e) {
    console.error('[Crypto] EVM balance error:', e.message);
    return { nativeBalance: 0, tokens: [] };
  }
}

/**
 * Fetch last N EVM transactions via Moralis REST API.
 * @returns {Array<{hash, from, to, value, blockTimestamp}>}
 */
export async function fetchEVMTransactions(address, limit = 25) {
  const chain = '0x1';
  try {
    const res = await fetch(
      `https://deep-index.moralis.io/api/v2.2/${address}?chain=${chain}&limit=${limit}`,
      { headers: { 'X-API-Key': MORALIS_API_KEY, 'Accept': 'application/json' } }
    );
    if (!res.ok) throw new Error(`Moralis tx error: ${res.status}`);
    const data = await res.json();
    const results = data.result || [];
    return results.map(tx => ({
      hash: tx.hash,
      from: tx.from_address,
      to: tx.to_address || null,
      value: Number(tx.value || 0) / 1e18,
      blockTimestamp: tx.block_timestamp
    }));
  } catch (e) {
    console.error('[Crypto] EVM transactions error:', e.message);
    return [];
  }
}

/**
 * Fetch BTC address balance via Mempool.space API.
 * @returns {{ balance: number }}
 */
export async function fetchBTCBalance(address) {
  try {
    const res = await fetch(`https://mempool.space/api/address/${address}`);
    if (!res.ok) throw new Error(`Mempool balance error: ${res.status}`);
    const data = await res.json();
    const stats = data.chain_stats;
    const balance = (stats.funded_txo_sum - stats.spent_txo_sum) / 1e8;
    return { balance };
  } catch (e) {
    console.error('[Crypto] BTC balance error:', e.message);
    return { balance: 0 };
  }
}

/**
 * Fetch last N BTC transactions via Mempool.space API.
 * @returns {Array<{txid, fee, destinations: Array<{address, value}>}>}
 */
export async function fetchBTCTransactions(address, limit = 25) {
  try {
    const res = await fetch(`https://mempool.space/api/address/${address}/txs`);
    if (!res.ok) throw new Error(`Mempool tx error: ${res.status}`);
    const data = await res.json();
    const txs = data.slice(0, limit);
    return txs.map(tx => ({
      txid: tx.txid,
      fee: tx.fee,
      destinations: (tx.vout || [])
        .filter(o => o.scriptpubkey_address)
        .map(o => ({
          address: o.scriptpubkey_address,
          value: o.value / 1e8
        }))
    }));
  } catch (e) {
    console.error('[Crypto] BTC transactions error:', e.message);
    return [];
  }
}

/**
 * Fetch XPUB wallet balance via Trezor Blockbook API.
 * @returns {{ balance: number }}
 */
export async function fetchXPUBBalance(xpub) {
  try {
    const res = await fetch(`https://btc1.trezor.io/api/v2/xpub/${xpub}?details=basic`);
    if (!res.ok) throw new Error(`Blockbook balance error: ${res.status}`);
    const data = await res.json();
    const balance = Number(data.balance || 0) / 1e8;
    return { balance };
  } catch (e) {
    console.error('[Crypto] XPUB balance error:', e.message);
    return { balance: 0 };
  }
}

/**
 * Fetch last N XPUB transactions via Trezor Blockbook API.
 * @returns {Array<{txid, destinations: Array<{address, value}>}>}
 */
export async function fetchXPUBTransactions(xpub, limit = 25) {
  try {
    const res = await fetch(`https://btc1.trezor.io/api/v2/xpub/${xpub}?details=txs`);
    if (!res.ok) throw new Error(`Blockbook tx error: ${res.status}`);
    const data = await res.json();
    const txs = (data.transactions || []).slice(0, limit);
    return txs.map(tx => ({
      txid: tx.txid,
      destinations: (tx.vout || [])
        .filter(o => o.addresses && o.addresses.length > 0)
        .map(o => ({
          address: o.addresses[0],
          value: Number(o.value || 0) / 1e8
        }))
    }));
  } catch (e) {
    console.error('[Crypto] XPUB transactions error:', e.message);
    return [];
  }
}

/**
 * Search for users linked to a crypto wallet address via HaveIBeenRansom API.
 * @param {string} address - The wallet address to search
 * @returns {Array} — Array of user records (empty if none found)
 */
export async function searchWalletUsers(address) {
  try {
    const data = await apiFetch(
      `${API_BASE}/api/fulldata/wallets/${encodeURIComponent(address)}`
    );
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.results && Array.isArray(data.results)) return data.results;
    return [];
  } catch (e) {
    // 404 = no data found for this address, which is normal
    if (e.message && e.message.includes('404')) return [];
    console.warn(`[Crypto] Wallet user search error for ${address}:`, e.message);
    return [];
  }
}
