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

  async waitForKeywordOverviewContent() {
    // Smart waiting for Keyword Overview - don't wait for full page load
    // Wait for essential content elements to be present for parsing

    try {
      // Wait for page to have basic structure
      await this.page.waitForLoadState('domcontentloaded');

      // Wait for title/keyword to load (fastest indicator)
      await this.page.waitForFunction(() => {
        return document.querySelector('h1')?.textContent?.trim() ||
               document.querySelector('[data-testid*="keyword"]')?.textContent?.trim() ||
               document.title.includes('Keyword Overview');
      }, { timeout: 10000 });

      // Wait for Semrush-specific data loading patterns
      await Promise.race([
        // Option 1: Wait for actual numeric metrics to appear in text
        this.page.waitForFunction(() => {
          const bodyText = document.body?.textContent || '';
          // Look for Volume numbers (typically 4-6 digits)
          return /\b\d{4,6}\b/.test(bodyText) &&
                 (bodyText.includes('volume') || bodyText.includes('Volume') ||
                  bodyText.includes('%') || bodyText.includes('$'));
        }, { timeout: 15000 }),
        // Option 2: Wait for specific Semrush data containers
        this.page.waitForSelector('[data-at="metric"], [data-test-id*="metric"], .metric-container', { timeout: 15000 }),
        // Option 3: Wait for substantial keyword data in body text
        this.page.waitForFunction(() => {
          const bodyText = document.body?.textContent || '';
          return bodyText.length > 10000 && // Substantial content loaded
                 (/\b\d+(?:,\d+)*\b/.test(bodyText) || // Numbers present
                  bodyText.includes('CPC') ||
                  bodyText.includes('competition'));
        }, { timeout: 15000 }),
        // Option 4: Timeout fallback with more time for SPAs
        this.page.waitForTimeout(10000)
      ]);

      // Check if essential content is actually loaded
      const contentCheck = await this.page.evaluate(() => {
        // Look for various indicators of loaded content
        const hasTitle = !!document.querySelector('h1')?.textContent?.trim();
        const hasSomeTable = !!document.querySelector('table');
        const hasAnyMetric = !!(document.querySelector('[data-testid="metric-value"]') ||
                              document.querySelector('.metric-value') ||
                              document.querySelector('.stats-value'));
        const hasSubstantialContent = document.body.textContent.length > 500;

        // Any of these indicates sufficient loading for parsing
        return hasTitle || hasAnyMetric || hasSomeTable || hasSubstantialContent;
      });

      if (!contentCheck) {
        // If not sufficient, wait a bit more
        await this.page.waitForTimeout(1000);
      }

      console.log('Keyword Overview content sufficiently loaded for parsing');

    } catch (error) {
      console.warn('Waiting for Keyword Overview content failed, proceeding with parsing anyway:', error.message);
      // Continue even if waiting failed - page might still have extractable data
    }
  }

  async getKeywordOverview(keyword) {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }

      const url = `https://www.semrush.com/analytics/keywordoverview/?q=${encodeURIComponent(keyword)}&db=us`;

      console.log(`Navigating to Keyword Overview: ${url}`);
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Smart waiting - check for sufficient content loading for parsing
      await this.waitForKeywordOverviewContent();

      // Additional wait for dynamically loaded metrics (React SPA delay)
      console.log('Waiting additional time for dynamic metrics to load...');
      await this.page.waitForTimeout(3000);

      // Extract data from the page using the correct regex pattern
      const data = await this.page.evaluate(() => {
        const result = {
          keyword: '',
          volume: null,
          keyword_difficulty: null,
          global_volume: null,
          trend: [],
          related_keywords: []
        };

        try {
          // Extract keyword more precisely - avoid page titles like "Keyword Overview: ..."
          let rawKeyword = document.querySelector('h1')?.textContent?.trim() ||
                          document.querySelector('[data-testid*="keyword"]')?.textContent?.trim() ||
                          document.querySelector('.keyword-title')?.textContent?.trim() ||
                          '';

          // Remove "Keyword Overview:" prefix if present
          result.keyword = rawKeyword.replace(/^Keyword Overview:\s*/i, '').trim();

          // Use the actual input keyword if DOM keyword is malformed
          if (!result.keyword || result.keyword.length > 50 || result.keyword.includes('\n')) {
            result.keyword = '';
          }

          // Extract data using the provided regex pattern
          const bodyHTML = document.body?.innerHTML || '';
          const pattern = /Volume<\/span><\/div>.*?(?:(?:data-testid="volume-total">([\d|\.\,|K|M|B]*)<span class="kwo-widget-total__flag">)|(?:<div class="kwo-na">(n\/a)<\/div>)).*?>Keyword Difficulty<\/span><\/div>.*?(?:(?:<span class="kwo-kd__metric">(\d*?%)<\/span>)|(?:<div class="kwo-na">(n\/a)<\/div>)).*?>Global Volume<\/span><\/div>.*?(?:(?:data-testid="global-volume-total">([\d|\.\,|K|M|B]*)<\/span>)|(?:<div class="kwo-na">(n\/a)<\/div>))/;

          const match = bodyHTML.match(pattern);
          if (match) {
            console.log('Regex match groups:', match);

            // Group 1: Volume (or n/a flag from group 2) - FIXED: proper K/M/B handling
            if (match[2] === 'n/a') {
              result.volume = null;
            } else if (match[1]) {
              const volumeStr = match[1];
              const numValue = parseFloat(volumeStr.replace(/,/g, ''));
              const multiplier = volumeStr.includes('K') || volumeStr.includes('k') ? 1000 :
                               volumeStr.includes('M') || volumeStr.includes('m') ? 1000000 :
                               volumeStr.includes('B') || volumeStr.includes('b') ? 1000000000 : 1;
              result.volume = Math.round(numValue * multiplier) || null;
            }

            // Group 3: Keyword Difficulty (or n/a flag from group 4)
            if (match[4] === 'n/a') {
              result.keyword_difficulty = null;
            } else if (match[3]) {
              const difficultyStr = match[3].replace('%', '');
              result.keyword_difficulty = parseInt(difficultyStr) || null;
            }

            // Group 5: Global Volume (or n/a flag from group 6)
            if (match[6] === 'n/a') {
              result.global_volume = null;
            } else if (match[5]) {
              const globalStr = match[5];
              const numValue = parseFloat(globalStr.replace(/,/g, ''));
              const multiplier = globalStr.includes('K') || globalStr.includes('k') ? 1000 :
                               globalStr.includes('M') || globalStr.includes('m') ? 1000000 :
                               globalStr.includes('B') || globalStr.includes('b') ? 1000000000 : 1;
              result.global_volume = Math.round(numValue * multiplier) || null;
            }
          }

          console.log('Extracted data:', {
            keyword: result.keyword,
            volume: result.volume,
            keyword_difficulty: result.keyword_difficulty,
            global_volume: result.global_volume
          });

        } catch (error) {
          console.error('Error extracting Keyword Overview data:', error);
        }

        return result;
      });

      return {
        success: true,
        data: data,
        timestamp: new Date().toISOString(),
        keyword: keyword,
        database: 'us'
      };

    } catch (error) {
      console.error('Keyword Overview scraping failed:', error);
      return {
        success: false,
        error: error.message,
        keyword: keyword,
        timestamp: new Date().toISOString()
      };
    }
  }


  async getKeywordMagic(keyword, limit = 20) {
    // Priority: Try CSV method first, fallback to HTML parsing
    try {
      console.log(`🛒 Attempting CSV-based Keyword Magic extraction for: "${keyword}"`);
      const result = await this.getKeywordMagicFromCSV(keyword, limit);

      if (result.success && result.source === 'csv_export') {
        console.log('🎯 CSV extraction successful!');
        return result;
      } else {
        console.log('📄 CSV failed, using HTML fallback...');
        return await this.getKeywordMagicHTML(keyword, limit);
      }
    } catch (error) {
      console.log('⚠️ CSV method error, using HTML fallback:', error.message);
      return await this.getKeywordMagicHTML(keyword, limit);
    }
  }

  async getKeywordMagicHTML(keyword, limit = 20) {
    try {
      if (!this.page) {
        await this.initialize();
      }

      await this.login();

      const url = `https://www.semrush.com/analytics/keywordmagic/?q=${encodeURIComponent(keyword)}&db=us`;

      console.log(`🎨 Scraping Keyword Magic via HTML for: ${keyword}`);

      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Wait for content
      await this.page.waitForTimeout(25000); // Extra time for full loading

      console.log('Page loaded, extracting data using comprehensive DOM regex with CPC...');

      // Extract data using the comprehensive DOM regex pattern with n/a handling
      const data = await this.page.evaluate(({keyword, limit}) => {

        // ENHANCED REGEX PATTERN: extracts Keyword, Intent, Volume, KD%, CPC with n/a handling
        const regexPattern = /Checkbox\.Text">(?!Select all keywords)([^<]+)<\/span>(?:(?!data-testid="table-row").)*?data-testid="table-cell-intent".*?(?:aria-label="|class="sm-na">)([^"<]+)(?:\.\s*Apply|<\/div>)(?:(?!data-testid="table-row").)*?data-testid="table-cell-volume"[^>]*>(?:<[^>]+>)?([^<]+)(?:<\/[^>]+>)?<\/div>(?:(?!data-testid="table-row").)*?data-testid="table-cell-kd".*?class="sm-cell-kd__data"[^>]*>(?:<[^>]+>)?([^<]+)(?:<\/[^>]+>)?<\/span>(?:(?!data-testid="table-row").)*?data-testid="table-cell-cpc"[^>]*>(?:<[^>]+>)?([^<]+)(?:<\/[^>]+>)?<\/div>/gm;

        const keywords = [];
        const tableHTML = document.body.innerHTML; // Get full DOM HTML

        console.log(`DOM HTML length: ${tableHTML.length}`);

        let match;
        let matchCount = 0;
        while ((match = regexPattern.exec(tableHTML)) !== null && keywords.length < limit) {
          matchCount++;

          const keywordText = match[1]?.trim();
          const intentText = match[2]?.trim();
          const volumeText = match[3]?.replace(/,/g, '');
          const kdText = match[4];
          const cpcText = match[5]?.replace(/\$/, ''); // Remove $ if present

          console.log(`Match ${matchCount}: "${keywordText}" (intent:${intentText}, vol:${volumeText}, kd:${kdText}%, cpc:${cpcText})`);

          // Additional validation - skip very short or invalid keywords
          if (!keywordText || keywordText.length < 2) {
            console.log(`Skipping short/invalid keyword: "${keywordText}"`);
            continue;
          }

          // Skip UI navigation elements
          if (keywordText.toLowerCase().includes('page:') ||
              keywordText.toLowerCase().includes('prev') ||
              keywordText.toLowerCase().includes('next')) {
            console.log(`Skipping UI element: "${keywordText}"`);
            continue;
          }

          // Parse numeric values, returning null for "n/a" values
          const parseNumericValue = (str) => {
            if (!str || str.toLowerCase().includes('n/a') || str.trim() === '') {
              return null;
            }
            const cleanStr = str.replace(/[\$,]/g, '').trim();
            const parsed = parseFloat(cleanStr);
            return isNaN(parsed) ? null : parsed;
          };

          const volume = volumeText && volumeText.toLowerCase().includes('n/a') ? null : parseInt(volumeText) || null;
          const keywordDifficulty = kdText && kdText.toLowerCase().includes('n/a') ? null : parseInt(kdText) || null;
          const cpc = parseNumericValue(cpcText);
          const intent = intentText && intentText.toLowerCase().includes('n/a') ? null : intentText;

          // Skip rows with no valid data
          if (volume === null && keywordDifficulty === null && cpc === null) {
            console.log(`Skipping row with all n/a values: "${keywordText}"`);
            continue;
          }

          // Clean the keyword text
          let cleanKeyword = keywordText.replace(/[^a-zA-Z\s\-]/g, '').trim();

          console.log(`✅ Adding: "${cleanKeyword}" (intent:${intent}, vol:${volume}, kd:${keywordDifficulty}%, cpc:$${cpc})`);

          keywords.push({
            keyword: cleanKeyword,
            intent: intent,
            volume: volume,
            keyword_difficulty: keywordDifficulty,
            cpc: cpc
          });

          if (keywords.length >= limit) break;
        }

        console.log(`✅ Total extraction: ${keywords.length} keywords from ${matchCount} regex matches`);
        return keywords.slice(0, limit);

      }, { keyword, limit });

      console.log(`🔧 HTML Final result: ${data.length} keywords extracted with complete CPC data`);
      console.log('Sample:', data.slice(0, 3));

      return {
        success: true,
        data: {
          keyword: keyword,
          suggestions: data
        },
        timestamp: new Date().toISOString(),
        total_suggestions: data.length,
        source: 'html_parsing'
      };

    } catch (error) {
      console.error('❌ HTML Keyword Magic scraping failed:', error);
      return {
        success: false,
        error: error.message,
        data: { keyword, suggestions: [] },
        timestamp: new Date().toISOString(),
        source: 'html_error'
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
