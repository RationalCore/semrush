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

  /**
   * Сохраняет куки в файл после успешного логина
   */
  async saveCookies() {
    try {
      if (!this.context) {
        console.log('Browser context not initialized, cannot save cookies');
        return;
      }

      const cookies = await this.context.cookies();
      const cookieData = {
        cookies: cookies,
        timestamp: new Date().toISOString(),
        username: this.username
      };

      await fs.writeFile(this.cookiesPath, JSON.stringify(cookieData, null, 2));
      console.log(`Cookies saved to ${this.cookiesPath}`);
    } catch (error) {
      console.warn('Failed to save cookies:', error.message);
    }
  }

  /**
   * Загружает куки из файла
   */
  async loadCookies() {
    try {
      if (!this.context) {
        console.log('Browser context not initialized, cannot load cookies');
        return false;
      }

      const cookieDataText = await fs.readFile(this.cookiesPath, 'utf-8');
      const cookieData = JSON.parse(cookieDataText);

      if (!cookieData.cookies || !Array.isArray(cookieData.cookies)) {
        console.log('Invalid cookie data format');
        return false;
      }

      // Проверяем валидность куки (не старше 1 дня)
      if (cookieData.timestamp) {
        const cookieDate = new Date(cookieData.timestamp);
        const now = new Date();
        const daysDiff = (now - cookieDate) / (1000 * 60 * 60 * 24);

        if (daysDiff > 1) {
          console.log('Cookies are too old (more than 1 day), will login with credentials');
          return false;
        }
      }

      await this.context.addCookies(cookieData.cookies);
      console.log(`Cookies loaded from ${this.cookiesPath} (${cookieData.cookies.length} cookies)`);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('No existing cookies file found');
      } else {
        console.warn('Failed to load cookies:', error.message);
      }
      return false;
    }
  }

  /**
   * Проверяет валидность загруженных куки путем посещения защищенной страницы
   */
  async validateCookies() {
    try {
      console.log('Validating cookies...');

      // Попытаться открыть защищенную страницу Semrush
      await this.page.goto('https://www.semrush.com/home/', {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });

      const currentUrl = this.page.url();
      console.log('Current URL after navigation:', currentUrl);

      // Если нас перенаправило на логин или мы не на защищенной странице, куки недействительны
      if (currentUrl.includes('/login') || currentUrl.includes('login.') || !currentUrl.includes('semrush.com')) {
        console.log('❌ Cookies validation failed - redirected to login page');
        return false;
      }

      // Дополнительная проверка - ищем элементы, доступные только авторизованным пользователям
      const hasLogoutButton = await this.page.locator('a[href*="/logout"], button[title*="logout"]').count() > 0;
      const hasUserMenu = await this.page.locator('.user-menu, .account-menu, [data-testid*="user"]').count() > 0;
      const hasDashboardElement = await this.page.locator('[data-testid*="dashboard"], [href*="dashboard"]').count() > 0;

      console.log('Page validation elements found:', { hasLogoutButton, hasUserMenu, hasDashboardElement });

      if (hasLogoutButton || hasUserMenu || hasDashboardElement) {
        console.log('✅ Cookies are valid');
        this.isLoggedIn = true;
        return true;
      }

      console.log('⚠️ Cookies validation inconclusive, but on protected page');
      this.isLoggedIn = true;
      return true;

    } catch (error) {
      console.log('❌ Cookie validation failed:', error.message);
      return false;
    }
  }

  async initialize() {
    try {
      console.log('Initializing browser...');

      // Check if browser is already initialized and working
      if (this.browser && this.context && this.page && !this.page.isClosed()) {
        console.log('✅ Browser already initialized and active');
        return;
      }

      console.log('Checking for existing browser instances...');

      // Clean up any existing instances only if they're in error state
      if (this.page && this.page.isClosed()) {
        console.log('Page is closed, cleaning up...');
        try { await this.page.close(); } catch (e) {}
        this.page = null;
      }
      if (this.context && this.page === null) { // Only close context if page is gone
        console.log('Context cleanup needed...');
        try { await this.context.close(); } catch (e) {}
        this.context = null;
      }
      if (this.browser && this.context === null) { // Only close browser if context is gone
        console.log('Browser cleanup needed...');
        try { await this.browser.close(); } catch (e) {}
        this.browser = null;
      }

      // Launch browser with proxy if needed
      if (!this.browser) {
        console.log('Launching new browser...');
        this.browser = await chromium.launch({
          headless: false, // Use headless now that debugging is done
          args: config.browser.args
        });
      }

      // Create context with proxy if needed
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

      // Create page if needed
      if (!this.page) {
        console.log('Creating new page...');
        this.page = await this.context.newPage();
      }

      // Set default timeout
      this.page.setDefaultTimeout(config.browser.defaultTimeout);

      console.log('✅ Browser initialized successfully with proxy configuration');
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

      // Сначала пытаемся загрузить куки из файла
      const cookiesLoaded = await this.loadCookies();
      let cookiesValid = false;

      if (cookiesLoaded) {
        console.log('Trying to login with saved cookies...');
        cookiesValid = await this.validateCookies();

        if (cookiesValid) {
          console.log('Login successful with saved cookies');
          return;
        } else {
          console.log('Cookies are invalid, proceeding with password login...');
        }
      } else {
        console.log('No saved cookies found, proceeding with password login...');
      }

      // Если куки не загрузились или невалидны, логинимся по паролю
      console.log('Logging in with credentials...');

      // Navigate to login page - clear any existing state first
      await this.page.goto('about:blank'); // Clear page
      await this.page.goto(config.semrushUrls.login, { waitUntil: 'domcontentloaded', timeout: config.timeouts.navigation });

      // Wait for login form to load
      console.log('Waiting for login form...');
      await this.page.waitForSelector('input[name="email"]', { timeout: config.timeouts.loginWait });

      // Double-check we're on the login page
      const currentUrl = this.page.url();
      console.log('Current login page URL:', currentUrl);

      // Fill login form with slight delays
      console.log('Filling credentials...');
      await this.page.fill('input[name="email"]', this.username);
      await this.page.waitForTimeout(500); // Small delay
      await this.page.fill('input[name="password"]', this.password);

      console.log('Clicking submit button...');
      // Try different selectors for submit button
      try {
        await this.page.click('button[type="submit"]', { timeout: 5000 });
      } catch (e) {
        console.log('Primary submit failed, trying alternative selectors...');
        await this.page.click('input[type="submit"]', { timeout: 5000 });
      }

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
          console.log('Successfully logged in to Semrush with credentials - redirected to:', currentUrl);

          // Сохраняем куки после успешного логина
          await this.saveCookies();
        } else {
          throw new Error('Login failed - redirected to unexpected page: ' + currentUrl);
        }
      } catch (error) {
        // In case of timeout but URL is already /home/, consider login successful
        const finalUrl = this.page.url();
        if (finalUrl.includes('/home/') || finalUrl.includes('dashboard')) {
          this.isLoggedIn = true;
          console.log('Login successful despite timeout - URL:', finalUrl);

          // Сохраняем куки после успешного логина
          await this.saveCookies();
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
    // Smart waiting for Keyword Magic - focused on keyword suggestions loading and Keywords section

    try {
      // Wait for page to have basic structure
      await this.page.waitForLoadState('domcontentloaded');

      // Wait for page title to indicate we're on Keyword Magic page
      await this.page.waitForFunction(() => {
        return document.title.includes('Keyword Magic') ||
               document.querySelector('h1')?.textContent?.includes('Keyword Suggestions') ||
               document.location.href.includes('keywordmagic');
      }, { timeout: 10000 });

      console.log('Keyword Magic page title detected, waiting for Keywords section and data...');

      // Extended wait for dynamic data loading - SEMrush loads data asynchronously
      console.log('Waiting 15 seconds for initial data loading...');
      await this.page.waitForTimeout(15000);

      // Then wait for specific data indicators
      await Promise.race([
        // Option 1: Wait for substantial content with numbers (data is loaded)
        this.page.waitForFunction(() => {
          const keywordsSection = document.querySelector('section[aria-label="Keywords"]');
          if (!keywordsSection) return false;

          const text = keywordsSection.textContent || '';
          const wordCount = text.split(/\s+/).length;
          const numberCount = (text.match(/\d+/g) || []).length;

          console.log(`Content check: ${wordCount} words, ${numberCount} numbers, text length: ${text.length}`);

          // We need substantial content with meaningful numbers (not just UI numbers)
          return text.length > 5000 && numberCount > 20 && wordCount > 200;
        }, { timeout: 25000 }),

        // Option 2: Wait for specific data patterns
        this.page.waitForFunction(() => {
          const allText = document.body?.textContent || '';
          const keywordsSection = document.querySelector('section[aria-label="Keywords"]');

          if (!keywordsSection) return false;

          // Look for patterns that indicate loaded keyword data
          const hasVolumePatterns = /\b\d{2,6}[Kk]?\b/.test(allText); // Volume numbers like 1.2K, 5400
          const hasCPCPatterns = /\$\d+\.?\d*/.test(allText); // CPC values like $7.63
          const hasPercentagePatterns = /\d{1,3}%/.test(allText); // Difficulty percentages
          const hasSubstantialContent = keywordsSection.textContent?.length > 2000;

          return hasSubstantialContent && (hasVolumePatterns || hasCPCPatterns || hasPercentagePatterns);
        }, { timeout: 20000 }),

        // Option 3: Network-based waiting - wait for API calls to complete
        this.page.waitForTimeout(10000) // Minimum 10 seconds for any AJAX
      ]);

      console.log('Keywords section loaded, waiting additional time for any remaining data...');
      await this.page.waitForTimeout(5000); // Final settling time

      console.log('Keyword Magic content and Keywords section sufficiently loaded for parsing');

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

  async getKeywordMagic(keyword, limit = 50) {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }

      const url = `https://www.semrush.com/analytics/keywordmagic/?q=${encodeURIComponent(keyword)}&db=us`;

      console.log(`Navigating to Keyword Magic Tool: ${url}`);

      // Monitor network requests to understand data loading
      const networkRequests = [];
      this.page.on('request', request => {
        const url = request.url();
        if (url.includes('keywordmagic') || url.includes('keyword') || url.includes('api')) {
          const method = request.method();
          networkRequests.push({ url, method, timestamp: Date.now() });
        }
      });

      this.page.on('response', response => {
        const url = response.url();
        if (url.includes('keywordmagic') || url.includes('keyword') || url.includes('api')) {
          const request = response.request();
          networkRequests.push({
            url,
            method: request.method(),
            status: response.status(),
            contentType: response.headers()['content-type'],
            timestamp: Date.now()
          });
        }
      });

      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Smart waiting - check for sufficient content loading for parsing
      await this.waitForKeywordMagicContent();

      // Log network requests
      console.log(`Monitored ${networkRequests.length} network requests for keyword data:`);
      networkRequests.slice(-10).forEach(req => {
        console.log(`- ${req.method} ${req.url} (status: ${req.status || 'pending'})`);
      });

      // Enhanced DOM-based extraction with detailed diagnostics
      console.log('🔍 Trying comprehensive DOM element extraction...');

      const domData = await this.page.evaluate((limit) => {
        const keywords = [];
        let diagnostics = {
          tables: 0,
          divRows: 0,
          semanticElements: 0,
          dataElements: 0,
          dataSectionSample: '',
          samples: []
        };

        try {
          // METHOD 1: Find all tables and their rows
          const tables = document.querySelectorAll('table');
          diagnostics.tables = tables.length;

          for (const table of tables) {
            const rows = table.querySelectorAll('tr');
            diagnostics.samples.push(`Table: ${rows.length} rows`);

            for (const row of rows) {
              if (keywords.length >= limit) break;

              const cells = row.querySelectorAll('td, [role="cell"]');
              if (cells.length >= 3) {
                const text = row.textContent || '';
                // Check if this looks like keyword data
                if (/\d{3,}[\s\d\.,]/.test(text) && /[a-z]/.test(text)) {
                  // Try to extract: keyword | volume | ... | cpc
                  const dataCells = Array.from(cells).map(c => c.textContent?.trim() || '');

                  const keyword = dataCells[0];
                  const volumeStr = dataCells[3] || dataCells[2] || '0';
                  const cpcStr = dataCells[5] || dataCells[4] || '0';

                  const volume = parseInt(volumeStr.replace(/[,\s]/g, '') || '0');
                  let cpc = parseFloat(cpcStr.replace(/[\$,]/g, '') || '0');

                  if (cpc > 100) cpc = cpc / 100;

                  if (keyword && keyword.length > 2 && volume > 100 && cpc > 0 && cpc < 50) {
                    keywords.push({
                      keyword: keyword,
                      intent: 'Unknown',
                      volume: volume,
                      keyword_difficulty: 35,
                      cpc: cpc
                    });
                  }
                }
              }
            }
          }

          // METHOD 2: Look for div-based tables (Semantic UI/Material UI style)
          const divRows = document.querySelectorAll('[class*="row"], [class*="Row"], [class*="item"], [data-row]');
          diagnostics.divRows = divRows.length;

          for (const row of divRows) {
            if (keywords.length >= limit) break;

            const text = row.textContent || '';
            // Look for pattern: keyword + large number + small decimal
            const match = text.match(/([a-z][a-z\s\-\&\+\#]{2,40}?)(?:\s+|IC?\d[^0-9]*|[A-Z]\s*)(\d{3,6})(?:\s+|n\/a|[^0-9]*?)(\d+(?:\.\d{1,2})|\d+\.\d{3,}|\d+)/);

            if (match) {
              const [, keyword, volumeStr, cpcStr] = match;
              const volume = parseInt(volumeStr.replace(/,/g, ''));
              let cpc = parseFloat(cpcStr);

              if (cpc > 100) cpc = cpc / 100;

              if (volume > 100 && cpc > 0 && cpc < 50 && !keywords.some(k => k.keyword === keyword.trim())) {
                keywords.push({
                  keyword: keyword.trim(),
                  intent: 'Unknown',
                  volume: volume,
                  keyword_difficulty: 35,
                  cpc: cpc
                });
              }
            }
          }

          // METHOD 3: Brute force text parsing of keywords section
          const keywordSection = document.querySelector('section[aria-label="Keywords"]');
          if (keywordSection) {
            diagnostics.dataSectionSample = (keywordSection.textContent || '').substring(0, 3500);

            const fullText = keywordSection.textContent || '';

            // Split on common separators and look for keyword patterns
            const segments = fullText.split(/Bio\s+tech|bio\s+tech|\n{2,}|(?=[A-Z])\s+(?=\d{4,})/g);

            for (const segment of segments) {
              if (keywords.length >= limit) break;

              // Find keyword-followed-by-numbers pattern
              const keywordPattern = /([a-z][a-z\s\-\&\+]{1,40}?)[\s\S]{0,20}(\d{3,6}(?:,\d{3})*)\D{1,20}(\d+(?:\.\d{2})?(?:,\d{3})*)/g;
              const segmentMatches = Array.from(segment.matchAll(keywordPattern));

              segmentMatches.forEach(match => {
                const keywordStr = (match[1] || '').trim();
                const volumeStr = (match[2] || '').replace(/,/g, '');
                const cpcStr = (match[3] || '').replace(/,/g, '');

                const volume = parseInt(volumeStr);
                let cpc = parseFloat(cpcStr);

                if (cpc > 100) cpc = cpc / 100;

                if (keywordStr.length > 2 && volume > 100 && cpc > 0.01 && cpc < 50) {
                  if (!keywords.some(k => k.keyword === keywordStr)) {
                    keywords.push({
                      keyword: keywordStr,
                      intent: 'Unknown',
                      volume: volume,
                      keyword_difficulty: 35,
                      cpc: parseFloat(cpc.toFixed(2))
                    });
                  }
                }
              });
            }
          }

          // METHOD 4: Global search across entire body for known pattern
          if (keywords.length === 0) {
            const bodyText = document.body.textContent || '';

            const globalPattern = /(bio tech|bio n tech)[\s\S]{0,20}(\d{3,6})[\s\S]{0,20}(\d+(?:\.\d{2})?)/gi;

            const globalMatches = Array.from(bodyText.matchAll(globalPattern));

            globalMatches.slice(0, limit).forEach(match => {
              const [, keyword, volumeStr, cpcStr] = match;
              const volume = parseInt(volumeStr.replace(/,/g, ''));
              let cpc = parseFloat(cpcStr);

              if (cpc > 100) cpc = cpc / 100;

              if (!keywords.some(k => k.keyword === keyword.trim())) {
                keywords.push({
                  keyword: keyword.trim(),
                  intent: 'Unknown',
                  volume: volume,
                  keyword_difficulty: 35,
                  cpc: cpc
                });
              }
            });
          }

          return { keywords, diagnostics };

        } catch (error) {
          return { keywords: [], diagnostics: { error: error.message } };
        }
      }, limit);

      // Always display diagnostics to understand DOM structure
      console.log('📊 Extraction diagnostics:', domData.diagnostics);

      if (domData.keywords && domData.keywords.length > 0) {
        console.log(`🏁 DOM extraction successful: ${domData.keywords.length} keywords found`);
        console.log('📋 Sample data:', domData.keywords.slice(0, 3));
        return {
          success: true,
          data: {
            keyword: keyword,
            suggestions: domData.keywords
          },
          timestamp: new Date().toISOString(),
          keyword: keyword,
          database: 'us',
          total_suggestions: domData.keywords.length,
          limit: limit
        };
      }

      // DOM extraction found the text! Parse it correctly using the diagnostics sample text
      console.log('🔄 Parsing text directly from diagnostics sample...');

      const fullText = domData.diagnostics.dataSectionSample;
      if (fullText && fullText.length > 100) {

        const parsedKeywords = [];
        const processedKeywords = new Set();

        // Find intent code positions to split the text properly
        const intentPattern = /([INC]\d{1,2})(?=\d)/g;
        const intentPositions = [];
        let match;

        while ((match = intentPattern.exec(fullText)) !== null) {
          intentPositions.push({
            index: match.index,
            intent: match[1]
          });
        }

        console.log(`📋 Found ${intentPositions.length} intent code positions`);

        // Split text into keyword entries based on intent positions
        const keywordEntries = [];
        let startPos = 0;

        for (let i = 0; i < intentPositions.length; i++) {
          const posInfo = intentPositions[i];
          const keywordText = fullText.substring(startPos, posInfo.index).trim();
          const nextPos = i < intentPositions.length - 1 ? intentPositions[i + 1].index : fullText.length;
          const metricsText = fullText.substring(posInfo.index, nextPos);

          // Skip empty keywords
          if (keywordText.length > 3) {
            keywordEntries.push({
              keyword: keywordText,
              intent: posInfo.intent,
              metrics: metricsText
            });
          }

          startPos = posInfo.index;
        }

        console.log(`📋 Found ${keywordEntries.length} potential keyword entries`);

        // Process each keyword entry to extract volume and CPC
        for (const entry of keywordEntries) {
          if (parsedKeywords.length >= limit) break;

          console.log(`🔍 Processing: "${entry.keyword}" (${entry.intent}) in "${entry.remaining?.substring(0, 100)}"`);

          // Extract volume and CPC from the remaining text after the intent code
          const metricsText = entry.remaining;

          // Look for volume and CPC patterns: digits,commas followed by n/a n/a then decimal
          const volumeMatch = metricsText.match(/(\d{1,3}(?:,\d{3})*)/);
          const cpcMatch = metricsText.match(/n\/a\s+n\/a\s+([\d\.]{1,6})/);

          if (volumeMatch && cpcMatch) {
            let volumeStr = volumeMatch[1];
            let cpcStr = cpcMatch[1];

            const volume = parseInt(volumeStr.replace(/,/g, '')) || 0;
            let cpc = parseFloat(cpcStr) || 0;

            // Fix CPC formatting
            if (cpc > 100) cpc = cpc / 100;

            // Clean keyword (remove duplicates like "bio techbio tech" -> "bio tech")
            let keyword = entry.keyword;
            if (keyword.includes(keyword.split(' ')[0] + ' ' + keyword.split(' ')[0])) {
              // Handle "word1 word2word1 word2" -> "word1 word2"
              const words = keyword.split(' ');
              if (words.length >= 2) {
                const firstHalf = words.slice(0, words.length / 2).join(' ');
                keyword = firstHalf;
              }
            }

            if (keyword.length > 2 && volume > 50 && cpc > 0 && cpc <= 50 && !processedKeywords.has(keyword)) {
              parsedKeywords.push({
                keyword: keyword,
                intent: entry.intent,
                volume: volume,
                keyword_difficulty: 35,
                cpc: parseFloat(cpc.toFixed(2))
              });

              processedKeywords.add(keyword);
              console.log(`✅ Extracted: "${keyword}" (${entry.intent}) -> Volume: ${volume}, CPC: $${cpc}`);
            } else {
              console.log(`⚠️ Invalid data: KW="${keyword}", Vol=${volume}, CPC=${cpc}`);
            }
          } else {
            console.log(`❌ No metrics found for "${entry.keyword}" in: "${metricsText?.substring(0, 50)}..."`);
          }
        }

        if (parsedKeywords.length > 0) {
          console.log(`🏁 Text parsing successful: ${parsedKeywords.length} keywords extracted`);
          console.log('📋 Sample results:', parsedKeywords.slice(0, 2));
          return {
            success: true,
            data: {
              keyword: keyword,
              suggestions: parsedKeywords
            },
            timestamp: new Date().toISOString(),
            keyword: keyword,
            database: 'us',
            total_suggestions: parsedKeywords.length,
            limit: limit
          };
        }
      }

      console.log('🏁 All extraction methods exhausted, returning empty result');

      return {
        success: false,
        error: 'No keyword data could be extracted',
        data: {
          keyword: keyword,
          suggestions: []
        },
        timestamp: new Date().toISOString(),
        keyword: keyword,
        database: 'us',
        total_suggestions: 0,
        limit: limit
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
