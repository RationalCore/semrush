# SEMrush Keyword Scraper API

A production-ready API for extracting keyword data from SEMrush without API keys. Uses browser automation with Playwright to scrape real keyword suggestions, volume, difficulty scores, and CPC values.

## 🚀 Features

- ✅ **No API Keys Required**: Works entirely through browser automation
- ✅ **Real SEMrush Data**: Extracts actual keyword suggestions from SEMrush Keyword Magic Tool
- ✅ **Complete Keyword Fields**: Returns Keyword, Volume, Keyword Difficulty, CPC (USD)
- ✅ **Production Ready**: Robust error handling, automated login, session management
- ✅ **Universal**: Works with any keyword queries
- ✅ **Fast & Reliable**: Optimized extraction with retry logic

## 🛠️ Tech Stack

- **Node.js** - Runtime
- **Express.js** - Web server
- **Playwright** - Browser automation
- **Regex DOM Parsing** - Efficient data extraction
- **Cookie Management** - Automatic authentication

## 📦 Installation

```bash
# Install dependencies
npm install

# Install Playwright browser
npx playwright install chromium
```

## 🚀 Quick Start

```bash
# Start the API server
node server.js
```

Server will be available at: http://localhost:3850

## 📝 API Usage

### Get Keyword Magic Suggestions

```bash
# Get keyword suggestions for "map tool"
curl "http://localhost:3850/keyword-magic?keyword=map%20tool"

# Limit results to 10 suggestions
curl "http://localhost:3850/keyword-magic?keyword=seo&limit=10"
```

#### Response Format

```json
[
  {
    "Keyword": "map radius tool",
    "Volume": 3600,
    "Keyword Difficulty": 53,
    "CPC (USD)": 2.58
  },
  {
    "Keyword": "radius map tool",
    "Volume": 2400,
    "Keyword Difficulty": 43,
    "CPC (USD)": 2.58
  },
  {
    "Keyword": "free map tools",
    "Volume": 1300,
    "Keyword Difficulty": 66,
    "CPC (USD)": 0.0
  }
]
```

### Health Check

```bash
curl "http://localhost:3850/health"
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-02T07:31:58.000Z",
  "scraper": "semrush-scraper",
  "version": "1.0.0"
}
```

## 📁 Project Structure

```
📦 semrush-scraper
├── 📄 scraper.js          # Main SEMrush scraper with DOM regex parsing
├── 📄 server.js           # Express.js API server
├── 📄 config.js           # Configuration (proxies, credentials)
├── 📄 package.json        # Dependencies
├── 📄 README.md           # This documentation
└── 📄 cookies.json        # Auto-generated session cookies (in .gitignore)
```

## ⚙️ Configuration

The `config.js` file contains:

- **Proxy Settings**: For accessing SEMrush (bypasses geo-restrictions)
- **Semrush Credentials**: Email/password for authentication
- **Playwright Options**: Browser automation settings

## 🔐 Authentication

- **Automatic login** using saved cookies in `cookies.json`
- **Cookie persistence** across server restarts
- **Fallback to password login** if cookies expire
- **Secure session management** with 24-hour cookie validity

## 🧹 Data Extraction Process

1. **Launch browser** with proxy configuration
2. **Load SEMrush** Keyword Magic page with target keyword
3. **Apply DOM regex pattern** to extract data from table structure
4. **Validate and clean** extracted keyword data
5. **Return JSON** with complete keyword information

## ⚡ Performance

- **First request**: ~35-45 seconds (includes browser launch + login)
- **Subsequent requests**: ~15-25 seconds (reuses session)
- **Result limit**: Up to 20 keywords per request
- **Stability**: Automatic retries and error recovery

## 🔧 How It Works

### 🔍 DOM Regex Pattern

Uses a sophisticated regex pattern to extract data directly from SEMrush's HTML structure:

```regex
/="Checkbox\.Text">(?!Select all keywords)([\w\s]*?)<\/span>.*?data-testid="table-cell-volume" role="cell">([\d,\.]*)<\/div>.*?<span class="sm-cell-kd__data">([\d\.]+)%?<\/span>/g
```

This pattern:
- Targets specific DOM elements
- Uses negative lookahead to skip UI controls
- Extracts keyword text, volume numbers, and difficulty percentages
- Handles various number formats with commas

### 🛡️ Error Handling

- **Browser crashes**: Automatic restart and recovery
- **Network timeouts**: Retry logic with exponential backoff
- **Authentication failures**: Re-login attempts
- **Data parsing errors**: Fallback mechanisms

## 🚦 Limitations

- **Rate Limiting**: ~1-2 requests per minute to respect SEMrush terms
- **Geographic Access**: Uses proxy for US database
- **Data Freshness**: Returns current SEMrush data
- **Browser Overhead**: Requires ~300MB RAM per running instance

## 🔍 Debugging

### View Debug Logs

Server provides detailed console output:
```
🌐 New API request: "seo tools" (limit: 20)
✅ SUCCESS: 20 keywords returned in 25341ms
```

### Inspect Browser

Set `headless: false` in config.js to see browser automation in action.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Add tests and documentation
4. Commit changes (`git commit -am 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open Pull Request

## 📄 License

This project is for educational/standard API usage only. Respect SEMrush Terms of Service.

## ✨ Acknowledgments

- SEMrush for providing valuable keyword research tools
- Playwright project for powerful browser automation
- Express.js for lightweight web framework

---

**Made with ❤️ for keyword research efficiency**
