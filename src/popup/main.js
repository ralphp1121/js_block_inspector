import './style.css'

function $(sel) { return document.querySelector(sel) }

async function getActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]))
  })
}

async function loadBuckets() {
  const { buckets = {} } = await chrome.storage.local.get('buckets')
  return buckets
}

function parseBucketKey(key) {
  const [origin, tabIdStr, startedAtMs] = key.split('|')
  return { origin, tabId: Number(tabIdStr), startedAtMs: Number(startedAtMs) }
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString() } catch { return iso }
}

function toCsv(rows) {
  const header = ['timestamp','url','reason','evidence','suggestedFix','status']
  const escape = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const body = rows.map(r => [r.ts, r.url, r.reason, r.evidence, r.suggestedFix, r.status].map(escape).join(','))
  return [header.join(','), ...body].join('\n')
}

async function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  try {
    await chrome.downloads.download({ url, filename, saveAs: false })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

function render(records) {
  const tbody = $('#records-tbody')
  tbody.textContent = ''
  for (const rec of records) {
    const tr = document.createElement('tr')

    const tdTime = document.createElement('td')
    tdTime.className = 'p-2 align-top whitespace-nowrap'
    tdTime.textContent = formatTime(rec.ts)
    tr.appendChild(tdTime)

    const tdUrl = document.createElement('td')
    tdUrl.className = 'p-2 align-top break-all max-w-[180px]'
    tdUrl.textContent = rec.url
    tr.appendChild(tdUrl)

    const tdReason = document.createElement('td')
    tdReason.className = 'p-2 align-top'

    const reasonSpan = document.createElement('span')
    reasonSpan.className = `px-1 py-0.5 rounded text-white ${rec.status === 'blocked' ? 'bg-red-600' : 'bg-gray-500'}`
    reasonSpan.textContent = rec.reason
    tdReason.appendChild(reasonSpan)

    if (rec.evidence) {
      const evidenceDiv = document.createElement('div')
      evidenceDiv.className = 'text-[10px] text-gray-600 mt-1'
      evidenceDiv.textContent = rec.evidence
      tdReason.appendChild(evidenceDiv)
    }
    tr.appendChild(tdReason)

    const tdFix = document.createElement('td')
    tdFix.className = 'p-2 align-top break-all max-w-[160px]'

    const copyBtn = document.createElement('button')
    copyBtn.className = 'copy-fix px-1 py-0.5 bg-gray-200 rounded'
    copyBtn.textContent = 'Copy'
    copyBtn.setAttribute('data-fix', rec.suggestedFix || '')
    tdFix.appendChild(copyBtn)

    if (rec.suggestedFix) {
      const fixDiv = document.createElement('div')
      fixDiv.className = 'text-[10px] text-gray-600 mt-1'
      fixDiv.textContent = rec.suggestedFix
      tdFix.appendChild(fixDiv)
    }
    tr.appendChild(tdFix)

    const tdIgnore = document.createElement('td')
    tdIgnore.className = 'p-2 align-top'

    const ignoreBtn = document.createElement('button')
    ignoreBtn.className = 'ignore-domain text-xs text-blue-700 underline'
    ignoreBtn.textContent = 'Ignore domain'
    ignoreBtn.setAttribute('data-url', rec.url)
    tdIgnore.appendChild(ignoreBtn)

    tr.appendChild(tdIgnore)

    tbody.appendChild(tr)
  }
}

async function main() {
  const tab = await getActiveTab()
  const origin = new URL(tab.url).origin
  const buckets = await loadBuckets()
  const entries = Object.entries(buckets)
    .map(([k, v]) => ({ key: k, meta: parseBucketKey(k), value: v }))
    .filter(x => x.meta.tabId === tab.id && x.meta.origin === origin)
    .sort((a, b) => b.meta.startedAtMs - a.meta.startedAtMs)

  const latest = entries[0]
  const records = latest?.value?.records || []

  $('#session-meta').textContent = latest ? `Origin: ${origin} • Started: ${new Date(latest.value.startedAt).toLocaleString()} • Records: ${records.length}` : `No records for this page yet.`

  let filtered = records.slice().reverse() // newest first
  render(filtered)

  $('#filter-input').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase()
    filtered = records.filter(r => r.url.toLowerCase().includes(q) || (r.reason || '').toLowerCase().includes(q))
    render(filtered)
  })

  $('#btn-export-json').addEventListener('click', async () => {
    const payload = JSON.stringify({ origin, tabId: tab.id, exportedAt: new Date().toISOString(), records }, null, 2)
    await downloadText(`js-block-inspector-${Date.now()}.json`, payload)
  })

  $('#btn-export-csv').addEventListener('click', async () => {
    const csv = toCsv(records)
    await downloadText(`js-block-inspector-${Date.now()}.csv`, csv)
  })

  document.body.addEventListener('click', async (e) => {
    const target = e.target
    if (target.matches('.copy-fix')) {
      const fix = target.getAttribute('data-fix') || ''
      await navigator.clipboard.writeText(fix)
      target.textContent = 'Copied'
      setTimeout(() => (target.textContent = 'Copy'), 1000)
    } else if (target.matches('.ignore-domain')) {
      const u = target.getAttribute('data-url')
      const host = new URL(u).hostname
      const domain = host
      await new Promise(resolve => chrome.runtime.sendMessage({ type: 'set-ignore-domain', domain }, () => resolve()))
      // Remove matching rows from current view
      const remaining = records.filter(r => !new URL(r.url).hostname.endsWith(domain))
      render(remaining)
    }
  })
}

main().catch(err => {
  console.error('Popup init failed', err)
})
