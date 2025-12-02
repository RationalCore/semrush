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

      // Extract data from the page
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
          // Extract keyword from various sources
          result.keyword = document.querySelector('h1')?.textContent?.trim() ||
                          document.querySelector('[data-testid*="keyword"]')?.textContent?.trim() ||
                          document.querySelector('.keyword-title')?.textContent?.trim() ||
                          '';

          // PRIMARY: Find "Global Volume" text specifically and extract the number right next to it
          const bodyText = document.body?.textContent || '';

          // Pattern: find "Global Volume" followed by any non-digit characters and then a number with possible multipliers
          const globalVolumePattern = /global volume[^0-9]{0,20}([\d,]+(?:\.\d+)?)[KkMmBb]?/i;
          const globalMatch = bodyText.match(globalVolumePattern);
          console.log('Global volume match result:', globalMatch);
          if (globalMatch && globalMatch[1]) {
            const baseValue = parseFloat(globalMatch[1].replace(/,/g, ''));
            const fullText = globalMatch[0]; // Get the full matched text to check for multipliers
            const multiplier = fullText.includes('K') || fullText.includes('k') ? 1000 :
                             fullText.includes('M') || fullText.includes('m') ? 1000000 :
                             fullText.includes('B') || fullText.includes('b') ? 1000000000 : 1;
            result.global_volume = Math.round(baseValue * multiplier);
            console.log(`Global volume parsed: ${baseValue} * ${multiplier} = ${result.global_volume}`);
          }

          // Fall back to Volume search: find regular volume for comparison
          const volumePattern = /(?:volume|search)[^\d]{0,30}(\d{1,3}(?:,\d{3})*)/i;
          const volumeMatch = bodyText.match(volumePattern);
          if (volumeMatch && volumeMatch[1]) {
            let volumeValue = parseInt(volumeMatch[1].replace(/,/g, ''));
            if (result.volume === null) {
              result.volume = volumeValue;
            }
          }

          // Difficulty search
          const difficultyPattern = /difficulty[^\d]*(\d+(?:\.\d+)?)%?/i;
          const difficultyMatch = bodyText.match(difficultyPattern);
          if (difficultyMatch && difficultyMatch[1]) {
            result.keyword_difficulty = parseFloat(difficultyMatch[1].replace(/%/g, ''));
          }

          // COMPREHENSIVE FALLBACK: If global_volume still null, scan all text more thoroughly
          if (result.global_volume === null) {
            // Look in script tags for data
            const scripts = document.querySelectorAll('script:not([src])');
            scripts.forEach(script => {
              const content = script.textContent || '';
              if (content.includes('global') || content.includes('volume')) {
                const scriptNumbers = content.match(/(\d{1,3}(?:,\d{3})*)/g);
                if (scriptNumbers && scriptNumbers.length > 0) {
                  scriptNumbers.forEach(numStr => {
                    const numVal = parseInt(numStr.replace(/,/g, ''));
                    if (numVal >= 100 && numVal <= 10000000 && result.global_volume === null) {
                      result.global_volume = numVal;
                    }
                  });
                }
              }
            });

            // Look in all DOM elements for "global volume" patterns
            if (result.global_volume === null) {
              const elements = document.querySelectorAll('*');
              elements.forEach(el => {
                const text = el.textContent?.toLowerCase() || '';
                if (text.includes('global volume') || text.includes('global search')) {
                  const numMatch = el.textContent?.match(/(\d{1,3}(?:,\d{3})*)/);
                  if (numMatch && numMatch[1] && result.global_volume === null) {
                    const num = parseInt(numMatch[1].replace(/,/g, ''));
                    if (num >= 100) {
                      result.global_volume = num;
                    }
                  }
                }
              });
            }

            // Final fallback - assume first large number is global volume if no better match
            if (result.global_volume === null) {
              const largeNumbers = bodyText.match(/(\d{4,7}(?:,\d{3})*)/g);
              if (largeNumbers && largeNumbers.length > 0) {
                for (const numStr of largeNumbers) {
                  const num = parseInt(numStr.replace(/,/g, ''));
                  if (num >= 1000 && num !== result.volume && result.global_volume === null) {
                    result.global_volume = num;
                    break;
                  }
                }
              }
            }
          }

          // Extract related keywords from tables
          const tables = document.querySelectorAll('table');
          const relatedTable = Array.from(tables).find(table =>
            table.textContent.toLowerCase().includes('keyword') ||
            table.textContent.toLowerCase().includes('related')
          ) || document.querySelector('[data-testid*="related"]');

          if (relatedTable) {
            const rows = relatedTable.querySelectorAll('tr');
            result.related_keywords = Array.from(rows).slice(1, 11).map(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 1) {
                const keyword = cells[0]?.textContent?.trim();
                return keyword ? { keyword } : null;
              }
              return null;
            }).filter(item => item !== null);
          }

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

      console.log('Page loaded, extracting data using comprehensive DOM regex with CPC...');

      // Extract data using the comprehensive DOM regex pattern with CPC
      const data = await this.page.evaluate(({keyword, limit}) => {

        // CORRECTED REGEX PATTERN: extracts Keyword, Volume, KD%, CPC (adapted from user's pattern)
        const regexPattern = /Checkbox\.Text">(?!Select all keywords)([\w\s]*?)<\/span>.*?data-testid="table-cell-volume" role="cell">([\d,\.]*?)<\/div>.*?<span class="sm-cell-kd__data">([\d,\.]*?)<\/span>.*?data-testid="table-cell-cpc" role="cell">([\d,\.]*?)<\/div>/gm;

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

          console.log(`Match ${matchCount}: "${keywordText}" (vol:${volumeText}, kd:${kdText}%, cpc:${cpcText})`);

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

          // Parse numeric values
          const volume = parseInt(volumeText) || 0;
          const keywordDifficulty = parseInt(kdText) || 0;
          const cpc = parseFloat(cpcText) || 0.0;

          // Only accept reasonable values
          if (volume >= 0 && keywordDifficulty >= 0 && keywordDifficulty <= 100 && cpc >= 0) {
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
            console.log(`⚠️ Invalid data: vol=${volume}, kd:${keywordDifficulty}%, cpc=$${cpc}`);
          }
        }

        console.log(`✅ Total extraction: ${keywords.length} keywords from ${matchCount} regex matches`);
        return keywords.slice(0, limit);

      }, { keyword, limit });

      console.log(`🔧 Final result: ${data.length} keywords extracted with complete CPC data`);
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
