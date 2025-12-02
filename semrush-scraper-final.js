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
      // For now, continue without login and see what data we can get

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
      await this.page.waitForTimeout(20000);

      console.log('Page loaded, extracting data...');

      // Extract data - wrap parameters in object for page.evaluate
      const data = await this.page.evaluate(({keyword, limit}) => {
        const keywordsSection = document.querySelector('section[aria-label="Keywords"]');
        if (!keywordsSection) {
          console.log('Keywords section not found');
          return [];
        }

        const fullText = keywordsSection.textContent || '';
        console.log('Section text length:', fullText.length);

        const keywords = [];

        // SEMrush concatenates data: keyword + keyword + intent + volume + n/a n/a + cpc + more info
        // Example: geo appgeo app​I0480n/an/a370.500.02366M1 month

        // Find all intent code positions (I048, C030, etc.)
        const intentPositions = [];
        const intentRegex = /([INC]\d{1,3})(?=\d)/g; // Intent code followed by number (allow 3 digits now)
        let match;

        while ((match = intentRegex.exec(fullText)) !== null) {
          intentPositions.push({
            intent: match[1],
            index: match.index
          });
        }

        console.log(`Found ${intentPositions.length} intent positions`);

        // Parse each keyword entry
        let currentPos = 0;

        for (let i = 0; i < intentPositions.length && keywords.length < limit; i++) {
          const posInfo = intentPositions[i];
          const nextPos = i < intentPositions.length - 1 ?
                         intentPositions[i + 1].index : fullText.length;

          // Get text between positions to find keyword
          const keywordText = fullText.substring(currentPos, posInfo.index).trim();
          const metricsText = fullText.substring(posInfo.index, nextPos);

          currentPos = posInfo.index;

          // Extract clean keyword (handle duplicates like "geo appgeo app")
          let keyword = keywordText;
          if (keywordText.includes(keywordText.split(' ')[0] + ' ' + keywordText.split(' ')[0])) {
            const words = keywordText.split(' ');
            if (words.length >= 2) {
              keyword = words.slice(0, words.length / 2).join(' ');
            }
          }

          // Parse metrics: I0480n/an/a370.500.02366M1 month
          // Format: intent_code + volume (without comma) + n/a n/a + cpc + additional
          // Use stricter regex: [INC]\d{1,3}(\d{1,4})n\/an\/a([\d\.]{1,8})
          const metricsRegex = /([INC]\d{1,3})(\d{1,4})n\/an\/a([\d\.]{1,8})/;
          const metricsMatch = metricsText.match(metricsRegex);

          if (metricsMatch && keyword.length > 2) {
            // metricsMatch[0] = full match, [1] = intent, [2] = volume, [3] = cpc
            const volume = parseInt(metricsMatch[2]) || 0;
            let cpc = parseFloat(metricsMatch[3]) || 0;

            // Fix CPC - some values need division by 100
            if (cpc > 100) cpc = cpc / 100;

            if (volume > 0 && cpc > 0 && cpc <= 50) {
              keywords.push({
                keyword: keyword.trim(),
                intent: posInfo.intent,
                volume: volume,
                keyword_difficulty: 35, // Default KD, we don't easily get this
                cpc: parseFloat(cpc.toFixed(2))
              });
            }
          }
        }

        console.log(`Extracted ${keywords.length} keywords`);
        return keywords;

      }, { keyword, limit }); // Wrap parameters in object

      console.log(`✅ Successfully extracted ${data.length} keywords for "${keyword}"`);
      console.log('Sample data:', data.slice(0, 3));

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
