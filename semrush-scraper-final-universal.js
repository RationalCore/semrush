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
        console.log(`Sections text length: ${fullText.length}`);

        const keywords = [];

        // UNIVERSAL PARSING: Use the learned pattern from dev tool analysis
        // Pattern: intent_code + volume + 'n/an/a' + cpc + additional

        // Split text on the SEMrush pattern
        const parts = fullText.split(/([INC]\w?)\d{1,2},?(\d{3,5})\d{0,6}[NnKkMmBb]?n\/an\/a([\d\.]{1,6})/);

        console.log(`Text split into ${parts.length} parts`);

        // Process each section
        for (let i = 0; i < parts.length - 4; i += 4) {
          const intent = parts[i + 1];
          const volumeStr = parts[i + 2];
          const cpcStr = parts[i + 3];
          const textBefore = parts[i].trim();

          // Extract keyword from text before
          let keyword = textBefore.split(/\s+/).slice(-10).join(' ').trim();
          keyword = keyword.replace(/[^\w\s-]+$/, '').trim();

          const volume = parseInt(volumeStr.replace(/,/g, '')) || 0;
          let cpc = parseFloat(cpcStr) || 0;

          // Fix CPC if needed
          if (cpc > 100) cpc = cpc / 100;

          if (keyword.length > 3 && volume > 0 && cpc >= 0 && /[a-z]/i.test(keyword)) {
            keywords.push({
              keyword: keyword,
              intent: intent || 'Unknown',
              volume: volume,
              keyword_difficulty: 35, // Default KD
              cpc: parseFloat(cpc.toFixed(2))
            });

            if (keywords.length >= limit) break;
          }
        }

        console.log(`✅ Extracted ${keywords.length} keywords for "${keyword}"`);
        return keywords.slice(0, limit);

      }, { keyword, limit });

      console.log(`🔧 Final result: ${data.length} keywords extracted`);
      console.log('Sample:', data.slice(0, 2));

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
