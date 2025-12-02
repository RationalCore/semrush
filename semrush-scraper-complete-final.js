const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

class SemrushScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isLoggedIn = false;
    this.cookiesPath = path.join(__dirname, 'cookies.json');

    // Load configuration
    this.username = config.semrush.username;
    this.password = config.semrush.password;
    this.proxy = config.proxy;
  }

  async initialize() {
    try {
      console.log('Initializing browser...');

      if (this.browser && this.context && this.page && !this.page.isClosed()) {
        console.log('✅ Browser already initialized and active');
        return;
      }

      if (!this.browser) {
        console.log('Launching new browser...');
        this.browser = await chromium.launch({
          headless: false,
          args: config.browser.args
        });
      }

      if (!this.context) {
        console.log('Creating browser context...');
        this.context = await this.browser.newContext({
          proxy: {
            server: this.proxy.server,
            username: this.proxy.username,
            password: this.proxy.password
          },
          userAgent: config.browser.userAgent,
          viewport: config.browser.viewport
        });
      }

      if (!this.page) {
        console.log('Creating new page...');
        this.page = await this.context.newPage();
      }

      console.log('✅ Browser initialized successfully with proxy configuration');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async login() {
    try {
      console.log('Starting login process...');

      const cookiesLoaded = await this.loadCookies();
      if (cookiesLoaded) {
        const cookiesValid = await this.validateCookies();
        if (cookiesValid) {
          console.log('Login successful with saved cookies');
          return;
        }
      }

      console.log('❌ Cookies not valid, falling back to direct scraping...');

    } catch (error) {
      console.log('Login failed, but continuing without authentication:', error.message);
    }
  }

  async loadCookies() {
    try {
      const cookieDataText = await fs.readFile(this.cookiesPath, 'utf-8');
      const cookieData = JSON.parse(cookieDataText);

      if (cookieData.cookies && Array.isArray(cookieData.cookies)) {
        console.log(`Cookies loaded from ${this.cookiesPath} (${cookieData.cookies.length} cookies)`);

        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        if (new Date(cookieData.timestamp) > oneDayAgo) {
          await this.context.addCookies(cookieData.cookies);
          return true;
        } else {
          console.log('Cookies are older than 1 day');
        }
      }
      return false;
    } catch (error) {
      console.log('No saved cookies found');
      return false;
    }
  }

  async validateCookies() {
    try {
      await this.page.goto('https://www.semrush.com/home/', { waitUntil: 'load', timeout: 10000 });
      const hasLogout = await this.page.locator('a[href*="logout"]').count() > 0;
      return hasLogout;
    } catch {
      return false;
    }
  }

  async getKeywordMagic(keyword, limit = 20) {
    try {
      if (!this.page) {
        await this.initialize();
      }

      await this.login();

      const url = `https://www.semrush.com/analytics/keywordmagic/?q=${encodeURIComponent(keyword)}&db=us`;

      console.log(`Scraping Keyword Magic for: ${keyword}`);

      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for content
      await this.page.waitForTimeout(25000); // Extra time for full loading

      console.log('Page loaded, extracting data using advanced DOM regex pattern...');

      // Extract data using the advanced DOM regex pattern (submitted by user)
      const data = await this.page.evaluate(({keyword, limit}) => {

        // ADVANCED REGEX PATTERN from user with negative lookahead and CPC extraction
        const regexPattern = /="Checkbox\.Text">(?!Select all keywords)([\w\s]*?)<\/span>.*?data-testid="table-cell-volume" role="cell">([\d,\.]*)<\/div>.*?<span class="sm-cell-kd__data">([\d\.]+)%?<\/span>.*?data-testid="table-cell-cpc" role="cell">([\d,\.]*)<\/div>/g;

        const keywords = [];
        const tableHTML = document.body.innerHTML; // Get full DOM HTML

        console.log(`DOM HTML length: ${tableHTML.length}`);

        let match;
        let matchCount = 0;
        while ((match = regexPattern.exec(tableHTML)) !== null && keywords.length < limit) {
          matchCount++;

          const keywordText = match[1]?.trim();
          const volumeText = match[2]?.replace(/,/g, '');
          const kdText = match[3];
          const cpcText = match[4]?.replace(/\$/, ''); // Remove $ if present

          console.log(`Processing match ${matchCount}: "${keywordText}"`);

          // Additional validation - skip very short or invalid keywords
          if (!keywordText || keywordText.length < 2) {
            console.log(`Skipping short/invalid keyword: "${keywordText}"`);
            continue;
          }

          // Parse numeric values
          const volume = parseInt(volumeText) || 0;
          const keywordDifficulty = parseInt(kdText) || 0;
          const cpc = parseFloat(cpcText) || 0.0;

          // Only accept reasonable values
          if (volume >= 0 && keywordDifficulty >= 0 && cpc >= 0 && keywordDifficulty <= 100) {
            // Clean the keyword text
            let cleanKeyword = keywordText.replace(/[^a-zA-Z\s\-]/g, '').trim();

            console.log(`✅ Adding: "${cleanKeyword}" (vol:${volume}, kd:${keywordDifficulty}%, cpc:$${cpc})`);

            keywords.push({
              keyword: cleanKeyword,
              volume: volume,
              keyword_difficulty: keywordDifficulty,
              cpc: parseFloat(cpc.toFixed(2))
            });

            if (keywords.length >= limit) break;
          } else {
            console.log(`⚠️ Invalid data: vol=${volume}, kd=${keywordDifficulty}%, cpc=$${cpc}`);
          }
        }

        console.log(`✅ Total extraction: ${keywords.length} keywords from ${matchCount} regex matches`);
        return keywords.slice(0, limit);

      }, { keyword, limit });

      console.log(`🔧 Final result: ${data.length} keywords extracted using advanced DOM regex`);
      console.log('Sample:', data.slice(0, 3));

      return {
        success: true,
        data: {
          keyword: keyword,
          suggestions: data
        },
        timestamp: new Date().toISOString(),
        total_suggestions: data.length
      };

    } catch (error) {
      console.error('❌ Keyword Magic scraping failed:', error);
      return {
        success: false,
        error: error.message,
        data: { keyword, suggestions: [] },
        timestamp: new Date().toISOString()
      };
    }
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } catch (error) {
      console.error('Error closing browser:', error);
    }
  }
}

module.exports = { SemrushScraper };
