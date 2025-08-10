// In-memory state for fast access; persisted to chrome.storage.local as source of truth
const tabIdToSession = new Map() // tabId -> { origin, bucketKey }
const bucketsCache = new Map() // bucketKey -> { startedAt, origin, tabId, records: [] }
const requestMetaById = new Map() // requestId -> { url, tabId, startedAt }
const responseHeadersByRequestId = new Map() // requestId -> { headers: Record<string,string>, statusCode?: number }
const cspByTabId = new Map() // tabId -> { csp: string | undefined, reportTo: string | undefined }
let ignoreDomains = []

const AD_TRACKER_PATTERNS = [
  'doubleclick',
  '/ads/',
  'googletagmanager',
  'gtm.js',
  'analytics.js',
  'ga.js',
  'adservice',
  'taboola',
  'outbrain',
  'pixel',
  'track',
  'beacon'
]

function getOriginFromUrl(urlString) {
  try {
    const u = new URL(urlString)
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}`
  } catch {
    return undefined
  }
}

function nowTs() {
  return new Date().toISOString()
}

async function loadState() {
  const { buckets = {}, ignoreDomains: storedIgnore = [] } = await chrome.storage.local.get(['buckets', 'ignoreDomains'])
  // Rehydrate cache
  Object.entries(buckets).forEach(([bucketKey, data]) => {
    bucketsCache.set(bucketKey, data)
  })
  ignoreDomains = storedIgnore
}

async function saveBucket(bucketKey) {
  const { buckets = {} } = await chrome.storage.local.get('buckets')
  buckets[bucketKey] = bucketsCache.get(bucketKey)
  await chrome.storage.local.set({ buckets })
}

function getOrCreateBucketForTab(tabId, tabUrl) {
  const origin = getOriginFromUrl(tabUrl)
  if (!origin) return undefined
  const existing = tabIdToSession.get(tabId)
  if (existing && existing.origin === origin && bucketsCache.has(existing.bucketKey)) {
    return existing.bucketKey
  }
  const bucketKey = `${origin}|${tabId}|${Date.now()}`
  const newBucket = { startedAt: nowTs(), origin, tabId, records: [] }
  bucketsCache.set(bucketKey, newBucket)
  tabIdToSession.set(tabId, { origin, bucketKey })
  // Persist initial bucket
  saveBucket(bucketKey).catch(() => {})
  return bucketKey
}

function headerMapFrom(details) {
  const map = {}
  if (details.responseHeaders) {
    for (const h of details.responseHeaders) {
      if (h.name) map[h.name.toLowerCase()] = Array.isArray(h.value) ? h.value.join(',') : (h.value || '')
    }
  }
  return map
}

function isHttp(url) {
  try { return new URL(url).protocol === 'http:' } catch { return false }
}
function isHttps(url) {
  try { return new URL(url).protocol === 'https:' } catch { return false }
}
function hostnameOf(url) {
  try { return new URL(url).hostname } catch { return '' }
}

function matchesAdTracker(url) {
  const u = url.toLowerCase()
  return AD_TRACKER_PATTERNS.some(p => u.includes(p))
}

function isLikelyJavascriptUrl(urlString) {
  try {
    const u = new URL(urlString)
    const pathname = u.pathname.toLowerCase()
    if (pathname.endsWith('.js')) return true
    // Heuristic: common JS file indicators in path or query
    if (pathname.includes('.js?') || pathname.includes('/js/')) return true
    const q = u.search.toLowerCase()
    if (q.includes('format=js') || q.includes('type=js') || q.includes('mime=application/javascript')) return true
    return false
  } catch {
    return false
  }
}

function jsLikeContentType(ct) {
  if (!ct) return false
  const v = ct.toLowerCase().split(';')[0].trim()
  return v === 'application/javascript' || v === 'text/javascript' || v === 'application/x-javascript' || v === 'text/ecmascript' || v === 'application/ecmascript'
}

function suggestFixForReason(reason, context) {
  switch (reason) {
    case 'CSP':
      return 'Update script-src in Content-Security-Policy to include the script\'s origin or use a nonce/hash.'
    case 'Mixed Content':
      return 'Load the script over HTTPS or proxy it through a secure endpoint.'
    case 'Ad/Tracker Blocker':
      return 'Rename the resource path or host, or serve from a neutral CDN path.'
    case 'DevTools Block':
      return 'In DevTools, uncheck "Block request URL" for this resource or clear the Blocked URLs list.'
    case 'Network Error':
      return 'Verify DNS/hosting/CDN availability and correct URL; check status codes and timeouts.'
    case 'Cross-Origin/MIME':
      return 'Serve with a JavaScript MIME type and avoid nosniff, or correct CORS/mime configuration.'
    default:
      return 'Inspect DevTools console/network logs for specifics; adjust CSP, URL, or hosting as needed.'
  }
}

async function addRecordToCurrentBucket(tabId, record) {
  const session = tabIdToSession.get(tabId)
  if (!session) return
  const bucket = bucketsCache.get(session.bucketKey)
  if (!bucket) return
  bucket.records.push(record)
  await saveBucket(session.bucketKey)
}

function shouldIgnore(url) {
  const host = hostnameOf(url)
  return ignoreDomains.some(d => d && host.endsWith(d))
}

chrome.runtime.onInstalled.addListener(() => {
  loadState().catch(() => {})
})

// Keep track of navigation to create per-origin session buckets
chrome.webNavigation.onCommitted.addListener(details => {
  if (details.frameId !== 0) return
  const { tabId, url } = details
  const origin = getOriginFromUrl(url)
  if (!origin) return
  const bucketKey = getOrCreateBucketForTab(tabId, url)
  // Capture main-frame CSP headers for this tab on subsequent responses
  cspByTabId.set(tabId, { csp: undefined, reportTo: undefined })
})

chrome.webRequest.onBeforeRequest.addListener(
  details => {
    if (details.tabId === -1) return
    if (shouldIgnore(details.url)) return
    const consider = details.type === 'script' || isLikelyJavascriptUrl(details.url)
    if (!consider) return
    requestMetaById.set(details.requestId, { url: details.url, tabId: details.tabId, startedAt: nowTs() })
  },
  { urls: ['<all_urls>'] },
  ['blocking']
)

chrome.webRequest.onHeadersReceived.addListener(
  details => {
    const headers = headerMapFrom(details)
    if (details.type === 'main_frame') {
      const csp = headers['content-security-policy']
      const reportTo = headers['report-to']
      if (details.tabId >= 0) cspByTabId.set(details.tabId, { csp, reportTo })
      return
    }
    if (details.type === 'script') {
      const prev = responseHeadersByRequestId.get(details.requestId) || {}
      prev.headers = headers
      responseHeadersByRequestId.set(details.requestId, prev)
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders', 'extraHeaders']
)

chrome.webRequest.onCompleted.addListener(
  async details => {
    const meta = requestMetaById.get(details.requestId)
    const isScriptLike = details.type === 'script' || (meta && isLikelyJavascriptUrl(meta.url)) || isLikelyJavascriptUrl(details.url)
    if (!isScriptLike) return

    const tabId = meta?.tabId ?? details.tabId
    if (typeof tabId !== 'number' || tabId < 0) return

    const url = meta?.url ?? details.url

    const headersInfo = responseHeadersByRequestId.get(details.requestId) || { headers: {} }
    const headers = headersInfo.headers || {}

    const reasonContext = { statusCode: details.statusCode, headers }

    let reason = undefined
    let evidence = ''

    // MIME / nosniff
    const xNosniff = (headers['x-content-type-options'] || '').toLowerCase() === 'nosniff'
    const contentType = headers['content-type'] || ''
    if (xNosniff && !jsLikeContentType(contentType)) {
      reason = 'Cross-Origin/MIME'
      evidence = `X-Content-Type-Options: nosniff; Content-Type: ${contentType || 'missing'}`
    }

    // Status-based issues
    if (!reason && (details.statusCode >= 400 || details.statusCode === 0)) {
      reason = 'Network Error'
      evidence = `HTTP ${details.statusCode}`
    }

    // Ad/tracker heuristics
    if (!reason && matchesAdTracker(url)) {
      reason = 'Ad/Tracker Blocker'
      evidence = 'Matched ad/tracker pattern'
    }

    // Mixed content
    if (!reason) {
      const session = tabIdToSession.get(tabId)
      const pageIsHttps = session && session.origin && session.origin.startsWith('https:')
      if (pageIsHttps && isHttp(url)) {
        reason = 'Mixed Content'
        evidence = 'HTTPS page attempted to load HTTP script'
      }
    }

    const status = reason ? 'blocked' : 'executed'

    const record = {
      url,
      reason: reason || 'Executed',
      evidence,
      suggestedFix: reason ? suggestFixForReason(reason, reasonContext) : '',
      status,
      ts: nowTs()
    }

    await addRecordToCurrentBucket(tabId, record)

    // Cleanup
    requestMetaById.delete(details.requestId)
    responseHeadersByRequestId.delete(details.requestId)
  },
  { urls: ['<all_urls>'] }
)

chrome.webRequest.onErrorOccurred.addListener(
  async details => {
    const meta = requestMetaById.get(details.requestId)
    const isScriptLike = details.type === 'script' || (meta && isLikelyJavascriptUrl(meta.url)) || isLikelyJavascriptUrl(details.url)
    if (!isScriptLike) return

    const tabId = meta?.tabId ?? details.tabId
    if (typeof tabId !== 'number' || tabId < 0) return

    const url = meta?.url ?? details.url

    if (shouldIgnore(url)) return

    let reason = 'Network Error'
    let evidence = details.error

    const isErrBlockedByClient = String(details.error || '').includes('ERR_BLOCKED_BY_CLIENT')

    if (isErrBlockedByClient) {
      if (matchesAdTracker(url)) {
        reason = 'Ad/Tracker Blocker'
        evidence = details.error || 'Matched ad/tracker pattern'
      } else {
        reason = 'DevTools Block'
        evidence = 'ERR_BLOCKED_BY_CLIENT (likely DevTools Blocked URLs)'
      }
    }

    const record = {
      url,
      reason,
      evidence,
      suggestedFix: suggestFixForReason(reason),
      status: 'blocked',
      ts: nowTs()
    }

    await addRecordToCurrentBucket(tabId, record)

    requestMetaById.delete(details.requestId)
    responseHeadersByRequestId.delete(details.requestId)
  },
  { urls: ['<all_urls>'] }
)

// Receive CSP violation reports from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'csp-violation') {
    const { blockedURI, effectiveDirective, originalPolicy, violatedDirective } = message.payload || {}
    const tabId = sender?.tab?.id
    if (typeof tabId === 'number' && tabId >= 0) {
      const record = {
        url: blockedURI || '(inline/eval)',
        reason: 'CSP',
        evidence: `Violated: ${violatedDirective || effectiveDirective}; Policy: ${originalPolicy?.slice(0, 300) || ''}`,
        suggestedFix: suggestFixForReason('CSP'),
        status: 'blocked',
        ts: nowTs()
      }
      addRecordToCurrentBucket(tabId, record)
    }
  } else if (message && message.type === 'get-state') {
    // For popup
    const tabId = message.tabId
    const response = { ok: true }
    try {
      response.currentSession = tabIdToSession.get(tabId) || null
    } catch {}
    sendResponse(response)
    return true
  } else if (message && message.type === 'set-ignore-domain') {
    const domain = message.domain
    if (domain && !ignoreDomains.includes(domain)) {
      ignoreDomains.push(domain)
      chrome.storage.local.set({ ignoreDomains }).catch(() => {})
    }
    sendResponse({ ok: true })
    return true
  }
}) 