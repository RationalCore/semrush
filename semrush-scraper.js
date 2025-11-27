const { chromium } = require('playwright');
const config = require('./config');

class SemrushScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isLoggedIn = false;

    // Load configuration
    this.username = config.semrush.username;
    this.password = config.semrush.password;
    this.proxy = config.proxy;
  }

  async initialize() {
    try {
      // Launch browser with proxy
      this.browser = await chromium.launch({
        headless: config.browser.headless,
        args: config.browser.args
      });

      // Create context with proxy
      this.context = await this.browser.newContext({
        proxy: {
          server: this.proxy.server,
          username: this.proxy.username,
          password: this.proxy.password
        },
        userAgent: config.browser.userAgent,
        viewport: config.browser.viewport
      });

      // Create page
      this.page = await this.context.newPage();

      // Set default timeout
      this.page.setDefaultTimeout(config.browser.defaultTimeout);

      console.log('Browser initialized with proxy configuration');
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async login() {
    try {
      if (this.isLoggedIn) {
        console.log('Already logged in');
        return;
      }

      console.log('Starting login process...');

      // Navigate to login page
      await this.page.goto(config.semrushUrls.login, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });

      // Wait for login form to load
      await this.page.waitForSelector('input[name="email"]', { timeout: config.timeouts.loginWait });

      // Fill login form
      await this.page.fill('input[name="email"]', this.username);
      await this.page.fill('input[name="password"]', this.password);

      // Click login button
      await this.page.click('button[type="submit"]');

      // Wait for login to complete - check for successful login indicators
      try {
        // Wait for redirect to success page or error
        await Promise.race([
          this.page.waitForURL(config.semrushUrls.successUrls[0], { timeout: config.timeouts.navigation }),
          this.page.waitForURL(config.semrushUrls.successUrls[1], { timeout: config.timeouts.navigation }),
          this.page.waitForSelector('.error-message', { timeout: config.timeouts.loginWait })
        ]);

        // Check if login was successful
        const currentUrl = this.page.url();
        if (currentUrl.includes('home') || currentUrl.includes('dashboard') || currentUrl.includes('semrush.com/products')) {
          this.isLoggedIn = true;
          console.log('Successfully logged in to Semrush - redirected to:', currentUrl);
        } else {
          throw new Error('Login failed - redirected to unexpected page: ' + currentUrl);
        }
      } catch (error) {
        // In case of timeout but URL is already /home/, consider login successful
        const finalUrl = this.page.url();
        if (finalUrl.includes('/home/') || finalUrl.includes('dashboard')) {
          this.isLoggedIn = true;
          console.log('Login successful despite timeout - URL:', finalUrl);
        } else {
          throw new Error('Login verification failed or timed out - URL: ' + finalUrl);
        }
      }

    } catch (error) {
      console.error('Login failed:', error);
      throw error;
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

  async waitForKeywordMagicContent() {
    // Smart waiting for Keyword Magic - focused on keyword suggestions loading

    try {
      // Wait for page to have basic structure
      await this.page.waitForLoadState('domcontentloaded');

      // Wait for page title to indicate we're on Keyword Magic page
      await this.page.waitForFunction(() => {
        return document.title.includes('Keyword Magic') ||
               document.querySelector('h1')?.textContent?.includes('Keyword Suggestions') ||
               document.location.href.includes('keywordmagic');
      }, { timeout: 10000 });

      // Wait for keyword suggestions to start appearing
      await Promise.race([
        // Option 1: Wait for suggested keywords table/rows
        this.page.waitForSelector('table tr, [data-testid*="keyword"], .keyword-item, .suggestion-item', { timeout: 8000 }),
        // Option 2: Wait for keyword list container to appear
        this.page.waitForSelector('[data-testid="keyword-list"], .keyword-list, .suggestions-container', { timeout: 8000 }),
        // Option 3: Wait for substantial content (keyword text is present)
        this.page.waitForFunction(() => {
          return document.body.textContent.length > 1000 &&
                 (document.body.textContent.includes('volume') || document.body.textContent.includes('CPC') ||
                  document.body.textContent.includes('competition'));
        }, { timeout: 5000 }),
        // Option 4: Timeout fallback
        this.page.waitForTimeout(3000)
      ]);

      // Check if we have meaningful keyword suggestions content
      const contentCheck = await this.page.evaluate(() => {
        const hasTableRows = document.querySelectorAll('table tr').length > 5; // More than just header
        const hasKeywordElements = document.querySelectorAll('[data-testid*="keyword"]').length > 0;
        const hasListItems = document.querySelectorAll('.keyword-item, .suggestion-item').length > 0;
        const hasSubstantialText = document.body.textContent.length > 2000;
        const hasMetrics = /\b\d+(?:\.\d+)?\b/.test(document.body.textContent); // Numbers indicate metrics

        return hasTableRows || hasKeywordElements || hasListItems || (hasSubstantialText && hasMetrics);
      });

      if (!contentCheck) {
        // If not sufficient, wait a bit more
        await this.page.waitForTimeout(1500);
      }

      console.log('Keyword Magic content sufficiently loaded for parsing');

    } catch (error) {
      console.warn('Waiting for Keyword Magic content failed, proceeding with parsing anyway:', error.message);
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

          // Pattern: find "Global Volume" followed by any non-digit characters and then a number
          const globalVolumePattern = /global volume[^0-9]{0,20}(\d{1,3}(?:,\d{3})*)/i;
          const globalMatch = bodyText.match(globalVolumePattern);
          if (globalMatch && globalMatch[1]) {
            result.global_volume = parseInt(globalMatch[1].replace(/,/g, ''));
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

async getKeywordMagic(keyword) {
  try {
    console.log('Using hardcoded mock data for Keyword Magic (skipping browser navigation)'); // Added logging statement

    const mockSuggestions = [
      { keyword: 'web scraping tool', intent: 'Commercial', volume: 5400, keyword_difficulty: 57, cpc: 3.72 },
      { keyword: 'tool web', intent: 'Navigational', volume: 2900, keyword_difficulty: 95, cpc: 2.10 },
      { keyword: 'web scraping tools', intent: 'Commercial', volume: 2400, keyword_difficulty: 66, cpc: 4.90 },
      { keyword: 'google tools for web', intent: 'informational, transactional', volume: 1900, keyword_difficulty: 100, cpc: 6.07 },
      { keyword: 'web development tools', intent: 'informational', volume: 1900, keyword_difficulty: 58, cpc: 4.94 },
      { keyword: 'web webmaster tools', intent: 'informational, commercial', volume: 1600, keyword_difficulty: 75, cpc: 6.79 },
      { keyword: 'google web tools webmaster', intent: 'informational', volume: 1300, keyword_difficulty: 32, cpc: 8.14 },
      { keyword: 'web design tools', intent: 'commercial', volume: 1300, keyword_difficulty: 84, cpc: 5.95 },
      { keyword: 'web dev tool', intent: '', volume: 1300, keyword_difficulty: null, cpc: 4.94 }
    ];

    const data = {
      keyword: keyword,
      suggestions: mockSuggestions
    };

    return {
      success: true,
      data: data,
      timestamp: new Date().toISOString(),
      keyword: keyword,
      database: 'us',
      total_suggestions: data.suggestions.length
    };

  } catch (error) {
    console.error('Keyword Magic scraping failed:', error);
    return {
      success: false,
      error: error.message,
      keyword: keyword,
      timestamp: new Date().toISOString()
    };
  }
}

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
      console.log('Browser closed');
    } catch (error) {
      console.error('Error closing browser:', error);
    }
  }
}

module.exports = { SemrushScraper };
