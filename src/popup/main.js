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
  tbody.innerHTML = ''
  for (const rec of records) {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td class="p-2 align-top whitespace-nowrap">${formatTime(rec.ts)}</td>
      <td class="p-2 align-top break-all max-w-[180px]">${rec.url}</td>
      <td class="p-2 align-top"><span class="px-1 py-0.5 rounded text-white ${rec.status === 'blocked' ? 'bg-red-600' : 'bg-gray-500'}">${rec.reason}</span><div class="text-[10px] text-gray-600 mt-1">${rec.evidence || ''}</div></td>
      <td class="p-2 align-top break-all max-w-[160px]"><button class="copy-fix px-1 py-0.5 bg-gray-200 rounded" data-fix="${(rec.suggestedFix || '').replace(/\"/g, '&quot;')}">Copy</button> <div class="text-[10px] text-gray-600 mt-1">${rec.suggestedFix || ''}</div></td>
      <td class="p-2 align-top"><button class="ignore-domain text-xs text-blue-700 underline" data-url="${rec.url}">Ignore domain</button></td>
    `
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