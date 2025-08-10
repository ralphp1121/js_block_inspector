// Listen for CSP violations on the page
try {
  window.addEventListener('securitypolicyviolation', (e) => {
    const payload = {
      blockedURI: e.blockedURI,
      effectiveDirective: e.effectiveDirective,
      violatedDirective: e.violatedDirective,
      originalPolicy: e.originalPolicy,
      sourceFile: e.sourceFile,
      lineNumber: e.lineNumber,
      columnNumber: e.columnNumber
    }
    chrome.runtime.sendMessage({ type: 'csp-violation', payload })
  })
} catch (err) {
  // Ignore errors silently
} 