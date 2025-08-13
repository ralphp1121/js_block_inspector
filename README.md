# JS Block Inspector

A Chrome extension that detects blocked JavaScript scripts, reports the reasons for blocking, and suggests actionable fixes. Built for Chrome Manifest V3, this tool helps developers and security professionals understand why JavaScript resources are being blocked on web pages.

## Purpose

The JS Block Inspector is designed to help you:

- **Detect blocked JavaScript resources** - Identify when and why JavaScript files or inline scripts are being blocked
- **Understand blocking reasons** - Get detailed information about Content Security Policy (CSP) violations, network errors, and other blocking mechanisms
- **Get actionable fixes** - Receive specific suggestions on how to resolve the blocking issues
- **Monitor ad trackers** - Automatically identify and flag common advertising and tracking scripts
- **Export findings** - Generate reports in JSON or CSV format for further analysis

## Common Use Cases

### 1. **Web Development & Debugging**
- Debug why certain JavaScript libraries aren't loading
- Identify CSP policy violations during development
- Understand why third-party scripts are being blocked
- Test security policies and their impact on functionality

### 2. **Security Analysis**
- Audit Content Security Policies on websites
- Identify potential security vulnerabilities from blocked resources
- Monitor for malicious script injection attempts
- Analyze the effectiveness of security headers

### 3. **Performance Optimization**
- Identify blocked resources that might be affecting page performance
- Understand which scripts are being prevented from loading
- Optimize resource loading strategies

### 4. **Compliance & Auditing**
- Generate reports for security compliance requirements
- Document CSP violations for audit trails
- Track blocking patterns across different websites

### 5. **Ad Blocker Analysis**
- Understand which advertising scripts are being blocked
- Analyze the effectiveness of ad blocking mechanisms
- Identify potential false positives in ad blocking

## Installation

### Prerequisites
- Google Chrome browser (version 88 or higher)
- Node.js (for development and building)

### Development Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd js_block_inspector
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load the extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner
   - Click "Load unpacked" and select the `dist` folder from your project
   - The extension should now appear in your extensions list

### Production Installation

For end users, the extension can be distributed through the Chrome Web Store or as a packaged extension file.

## Usage

### Basic Usage

1. **Install the extension** following the installation instructions above
2. **Navigate to any webpage** where you want to inspect JavaScript blocking
3. **Click the extension icon** in your Chrome toolbar to open the popup
4. **View the results** - The popup will show:
   - Blocked JavaScript resources
   - Reasons for blocking (CSP, network errors, etc.)
   - Evidence and context
   - Suggested fixes

### Advanced Features

#### Filtering Results
- Use the search box in the popup to filter results by URL or reason
- Results are automatically filtered to show only the current page's session

#### Exporting Data
- **Export as JSON**: Click "Export JSON" to download a detailed report
- **Export as CSV**: Click "Export CSV" to download data in spreadsheet format
- Reports include timestamps, URLs, reasons, evidence, and suggested fixes

#### Ignoring Domains
- Click "Ignore domain" next to any result to exclude that domain from future monitoring
- Useful for reducing noise from known ad trackers or analytics services

### Understanding the Results

#### Blocking Reasons
- **CSP**: Content Security Policy violations
- **Network Error**: Failed network requests
- **Ad Tracker**: Detected advertising or tracking scripts
- **Mixed Content**: HTTP resources on HTTPS pages
- **Other**: Various other blocking mechanisms

#### Evidence
- **CSP Violations**: Shows the violated directive and original policy
- **Network Errors**: Displays HTTP status codes and error details
- **Ad Trackers**: Lists the patterns that triggered detection

#### Suggested Fixes
- **CSP Issues**: Recommended policy changes
- **Network Issues**: Suggested URL corrections or fallbacks
- **Mixed Content**: HTTPS alternatives for HTTP resources

## Testing

The extension includes several test pages in the `test_page/` directory:

- **test1.html**: CSP inline script blocking
- **test2.html**: CSP external script blocking
- **test3.html**: Network error simulation
- **test4.html**: Mixed content blocking
- **test5.html**: Ad tracker detection

To test the extension:
1. Build the extension using `npm run build`
2. Load it in Chrome as described in the installation section
3. Open the test pages in your browser
4. Check the extension popup for detection results

## Development

### Project Structure
```
js_block_inspector/
├── src/
│   ├── background/     # Service worker for request monitoring
│   ├── content/        # Content scripts for CSP violation detection
│   └── popup/          # Extension popup UI
├── test_page/          # Test pages for development
├── dist/               # Built extension files
└── manifest.json       # Extension manifest
```

### Available Scripts
- `npm run dev`: Start development server with hot reload
- `npm run build`: Build the extension for production
- `npm run watch`: Build and watch for changes
- `npm test`: Run tests (currently placeholder)

### Key Features
- **Manifest V3**: Built for the latest Chrome extension standards
- **Tailwind CSS**: Modern styling with utility classes
- **Vite**: Fast build tool for development
- **Real-time monitoring**: Detects blocking as it happens
- **Persistent storage**: Saves results across browser sessions

## Permissions

The extension requires the following permissions:
- `webRequest`: Monitor network requests
- `storage`: Save detection results
- `scripting`: Inject content scripts
- `downloads`: Export reports
- `webNavigation`: Track page navigation
- `tabs`: Access tab information
- `<all_urls>`: Monitor all websites

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with the provided test pages
5. Submit a pull request

## License

ISC License - see the LICENSE file for details.

## Support

For issues, questions, or feature requests, please open an issue on the project repository.

---

**Note**: This extension is designed for development and security analysis purposes. Always respect website terms of service and privacy policies when using this tool.
