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
   * Выполняет операцию с повторными попытками при сетевых ошибках
   */
  async retryOperation(operation, maxRetries = 3, delay = 2000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const isNetworkError = error.message.includes('ERR_CONNECTION_RESET') ||
                              error.message.includes('ERR_NETWORK_CHANGED') ||
                              error.message.includes('net::') ||
                              error.message.includes('Navigation timeout');

        if (isNetworkError && attempt < maxRetries - 1) {
          console.log(`Network error on attempt ${attempt + 1}, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          continue;
        }

        throw error;
      }
    }
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

      // Проверяем валидность куки (не старше 7 дней)
      if (cookieData.timestamp) {
        const cookieDate = new Date(cookieData.timestamp);
        const now = new Date();
        const daysDiff = (now - cookieDate) / (1000 * 60 * 60 * 24);

        if (daysDiff > 7) {
          console.log('Cookies are too old (more than 7 days), will login with credentials');
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

      // Если нас перенаправило на логин или мы не на защищенной странице, куки недействительны
      if (currentUrl.includes('/login') || currentUrl.includes('login.') || !currentUrl.includes('semrush.com')) {
        console.log('Cookies validation failed - redirected to login page');
        return false;
      }

      // Дополнительная проверка - ищем элементы, доступные только авторизованным пользователям
      const hasLogoutButton = await this.page.locator('a[href*="/logout"], button[title*="logout"]').count() > 0;
      const hasUserMenu = await this.page.locator('.user-menu, .account-menu, [data-testid*="user"]').count() > 0;

      if (hasLogoutButton || hasUserMenu) {
        console.log('Cookies are valid');
        this.isLoggedIn = true;
        return true;
      }

      console.log('Cookies validation inconclusive, but on protected page');
      this.isLoggedIn = true;
      return true;

    } catch (error) {
      console.log('Cookie validation failed:', error.message);
      return false;
    }
  }

  async initialize() {
    try {
      // Launch browser with proxy (debug version - visible)
      this.browser = await chromium.launch({
        headless: false, // Keep corrected version in non-headless mode for debugging
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

      // Сначала пытаемся загрузить куки из файла
      const cookiesLoaded = await this.loadCookies();
      let cookiesValid = false;

      if (cookiesLoaded) {
        console.log('Trying to login with saved cookies...');
        cookiesValid = await this.retryOperation(() => this.validateCookies());

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

      // Navigate to login page with retry
      await this.retryOperation(() => this.page.goto('https://www.semrush.com/login/', { waitUntil: 'domcontentloaded', timeout: 30000 }));

      // Wait for login form to load
      await this.page.waitForSelector('input[name="email"]', { timeout: 10000 });

      // Fill login form
      await this.page.fill('input[name="email"]', this.username);
      await this.page.fill('input[name="password"]', this.password);

      // Click login button
      await this.page.click('button[type="submit"]');

      // Wait for login to complete - check for successful login indicators
      try {
        // Wait for redirect to success page or error
        await Promise.race([
          this.page.waitForURL('**/home/**', { timeout: 30000 }),
          this.page.waitForURL('**/dashboard/**', { timeout: 30000 }),
          this.page.waitForSelector('.error-message', { timeout: 10000 })
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

  async waitForContentLoad() {
    // Wait for page content to load
    await this.page.waitForLoadState('networkidle');
    await this.page.waitForLoadState('domcontentloaded');

    // Additional wait for dynamic content
    await this.page.waitForTimeout(2000);
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

      // Wait for at least main metrics or basic content structure
      await Promise.race([
        // Option 1: Wait for metrics values to appear
        this.page.waitForSelector('[data-testid="metric-value"], .metric-value, .stats-value', { timeout: 8000 }),
        // Option 2: Wait for main content area to have substance
        this.page.waitForSelector('.content-body, .main-content, .keyword-data, .overview-content', { timeout: 8000 }),
        // Option 3: Wait for 2 seconds as fallback (for basic content)
        this.page.waitForTimeout(2000)
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
      // Check if browser is initialized, restart if needed
      if (!this.browser || !this.context || !this.page || this.page.isClosed()) {
        console.log('Browser not available, reinitializing...');
        await this.initialize();
        // After browser reinitialization, we need to login again
        if (!this.isLoggedIn) {
          console.log('Re-logging in after browser restart...');
          await this.login();
        }
      } else {
        // Ensure we're logged in even if browser is still available
        if (!this.isLoggedIn) {
          await this.login();
        }
      }

      // Double check that we're still logged in after login
      if (!this.isLoggedIn) {
        throw new Error('Login failed, cannot proceed with keyword overview');
      }

      const url = `https://www.semrush.com/analytics/keywordoverview/?q=${encodeURIComponent(keyword)}&db=us`;

      console.log(`Navigating to Keyword Overview: ${url}`);

      // Use retry operation for navigation to handle network issues
      await this.retryOperation(async () => {
        // Check if page is still available before navigation
        if (this.page.isClosed()) {
          console.log('Page closed during operation, reinitializing...');
          await this.initialize();
          await this.login();
        }
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      });

      console.log('Successfully navigated to Keyword Overview page');

      // Smart waiting - check for sufficient content loading for parsing
      await this.waitForKeywordOverviewContent();

      // Take a screenshot for debugging what the page looks like
      await this.page.screenshot({ path: 'debug-semrush-page.png', fullPage: true });
      console.log('Screenshot saved as debug-semrush-page.png');

      // Extract data from the page using SEMrush-specific selectors
      const extractionResult = await this.page.evaluate(() => {
        const result = {
          keyword: '',
          volume: null,
          keyword_difficulty: null,
          global_volume: null,
          trend: [],
          related_keywords: [],
          debug: {
            difficulty_extraction: {}
          }
        };

        try {
          // Extract keyword from title or input field
          result.keyword = document.title?.replace('Keyword Overview: ', '')?.trim() ||
                          document.querySelector('h1')?.textContent?.trim() ||
                          document.querySelector('input[name="q"], [data-testid*="keyword"]')?.value ||
                          '';

          // Extract volume using specific SEMrush selectors
          const volumeElement = document.querySelector('[data-testid="volume-total"]') ||
                               document.querySelector('.kwo-volume-widget-layout__line_volume span') ||
                               document.querySelector('.kwo-widget-total');

          if (volumeElement) {
            const volumeText = volumeElement.textContent?.trim();
            if (volumeText) {
              // Parse values like "8.1K", "5,200", "2.3M"
              const volumeMatch = volumeText.match(/([\d,]+(?:\.\d+)?)[KkMmBb]?/);
              if (volumeMatch) {
                const baseValue = parseFloat(volumeMatch[1].replace(/,/g, ''));
                const multiplier = volumeText.includes('K') || volumeText.includes('k') ? 1000 :
                                 volumeText.includes('M') || volumeText.includes('m') ? 1000000 :
                                 volumeText.includes('B') || volumeText.includes('b') ? 1000000000 : 1;
                result.volume = Math.round(baseValue * multiplier);
              }
            }
          }

          // Extract keyword difficulty - target the specific difficulty element
          result.debug.difficulty_extraction.started = true;
          const difficultyElement = document.querySelector('.kwo-kd__metric');
          result.debug.difficulty_extraction.element_found = !!difficultyElement;

          if (difficultyElement) {
            const difficultyText = difficultyElement.textContent?.trim();
            result.debug.difficulty_extraction.element_text = difficultyText;
            if (difficultyText) {
              const percentMatch = difficultyText.match(/(\d+(?:\.\d+)?)%/);
              result.debug.difficulty_extraction.percent_match = percentMatch;
              if (percentMatch) {
                result.keyword_difficulty = parseFloat(percentMatch[1]);
                result.debug.difficulty_extraction.success = true;
                result.debug.difficulty_extraction.value = result.keyword_difficulty;
              }
            }
          } else {
            // Try alternative selectors
            const altElements = document.querySelectorAll('[class*="kd"], [class*="difficulty"]');
            result.debug.difficulty_extraction.alt_elements_count = altElements.length;
            result.debug.difficulty_extraction.alt_elements = [];
            altElements.forEach((el, idx) => {
              const text = el.textContent?.trim();
              result.debug.difficulty_extraction.alt_elements.push({
                className: el.className,
                text: text
              });
              if (text && text.includes('%') && result.keyword_difficulty === null) {
                const match = text.match(/(\d+(?:\.\d+)?)%/);
                if (match) {
                  result.keyword_difficulty = parseFloat(match[1]);
                  result.debug.difficulty_extraction.found_in_alt = true;
                  result.debug.difficulty_extraction.alt_value = result.keyword_difficulty;
                }
              }
            });
          }

          // Fallback: look for difficulty in the main metrics area
          if (result.keyword_difficulty === null) {
            const allPercentages = document.querySelectorAll('*');
            let foundInFallback = false;
            for (const el of allPercentages) {
              if (el.offsetParent && el.textContent && !foundInFallback) {
                const text = el.textContent.trim();
                const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
                if (percentMatch) {
                  const value = parseFloat(percentMatch[1]);
                  if (value >= 0 && value <= 100) {
                    // Check if this is likely difficulty by checking surrounding text
                    const parentText = el.parentElement?.textContent || '';
                    if (parentText.toLowerCase().includes('difficulty') ||
                        parentText.toLowerCase().includes('competition') ||
                        el.closest('[class*="difficulty"], [class*="competition"]')) {
                      result.keyword_difficulty = value;
                      foundInFallback = true;
                      result.debug.difficulty_extraction.found_in_fallback = true;
                      result.debug.difficulty_extraction.fallback_value = value;
                      result.debug.difficulty_extraction.fallback_text = text;
                    }
                  }
                }
              }
            }
          }

          // Extract global volume - look for the global/total volume
          const globalVolumeElement = document.querySelector('[data-testid="global-volume-total"]') ||
                                     document.querySelector('.kwo-widget-global-volume-lines .kwo-widget-total');

          if (globalVolumeElement) {
            const globalText = globalVolumeElement.textContent?.trim();
            if (globalText) {
              const globalMatch = globalText.match(/([\d,]+(?:\.\d+)?)[KkMmBb]?/);
              if (globalMatch) {
                const baseValue = parseFloat(globalMatch[1].replace(/,/g, ''));
                const multiplier = globalText.includes('K') || globalText.includes('k') ? 1000 :
                                 globalText.includes('M') || globalText.includes('m') ? 1000000 :
                                 globalText.includes('B') || globalText.includes('b') ? 1000000000 : 1;
                result.global_volume = Math.round(baseValue * multiplier);
              }
            }
          }

          // Final fallback: look for any large volume numbers that might be global
          if (result.global_volume === null && result.volume !== null) {
            const allNumbers = document.querySelectorAll('*');
            const volumeCandidates = [];

            for (const el of allNumbers) {
              if (el.offsetParent && el.textContent) {
                const text = el.textContent.trim();
                const numberMatch = text.match(/([\d,]+(?:\.\d+)?)[KkMmBb]?/);
                if (numberMatch && !text.includes('%')) {
                  const baseValue = parseFloat(numberMatch[1].replace(/,/g, ''));
                  const multiplier = text.includes('K') || text.includes('k') ? 1000 :
                                   text.includes('M') || text.includes('m') ? 1000000 :
                                   text.includes('B') || text.includes('b') ? 1000000000 : 1;
                  const actualValue = Math.round(baseValue * multiplier);

                  if (actualValue > result.volume * 1.5 && actualValue < result.volume * 20) {
                    volumeCandidates.push({
                      value: actualValue,
                      text: text,
                      element: el
                    });
                  }
                }
              }
            }

            if (volumeCandidates.length > 0) {
              // Take the largest candidate as global volume
              volumeCandidates.sort((a, b) => b.value - a.value);
              result.global_volume = volumeCandidates[0].value;
            }
          }

        } catch (error) {
          console.error('Error extracting Keyword Overview data:', error);
        }

        return result;
      });

      // Log debug information from the browser context
      console.log('Difficulty extraction debug:', extractionResult.debug.difficulty_extraction);

      const data = extractionResult;

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
      if (!this.isLoggedIn) {
        await this.login();
      }

      const url = `https://www.semrush.com/analytics/keywordmagic/?q=${encodeURIComponent(keyword)}&db=us`;

      console.log(`Navigating to Keyword Magic: ${url}`);
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Smart waiting for Keyword Magic content
      await this.waitForKeywordMagicContent();

      // Extract data from the page - simplified approach to find any keywords
      const data = await this.page.evaluate(() => {
        const result = {
          keyword: '',
          suggestions: []
        };

        try {
          // Extract main keyword from URL or page elements
          const urlParams = new URLSearchParams(window.location.search);
          result.keyword = urlParams.get('q') || '';

          // COMPREHENSIVE APPROACH: Find all possible keyword candidates
          const allElements = document.querySelectorAll('*');
          const keywordCandidates = [];
          const seen = new Set();

          // Collect all text that might be keywords
          allElements.forEach(el => {
            if (el.offsetParent !== null && el.textContent) { // Only visible elements
              const text = el.textContent.trim();
              if (text && text.length > 2 && text.length < 100 &&
                  !text.includes('\n') && !text.includes('\t') &&
                  !seen.has(text.toLowerCase())) {

                // Check if it looks like a keyword (not numbers, not UI text)
                const hasLetters = /[a-zA-Z]/.test(text);
                const wordCount = text.split(/\s+/).length;
                const hasSpecialChars = /[$%&,]/.test(text);
                const looksLikeUI = /(include|exclude|all|keywords?|export|send|total|average|kd|volume|cpc)/i.test(text);

                if (hasLetters && wordCount <= 5 && !hasSpecialChars && !looksLikeUI &&
                    !text.match(/^\d/) && text.length < 50) {
                  keywordCandidates.push(text);
                  seen.add(text.toLowerCase());
                }
              }
            }
          });

          // Sort by relevance (shorter, more common words first) and take top suggestions
          keywordCandidates.sort((a, b) => {
            // Prefer shorter keywords
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
          });

          // Convert to proper format
          result.suggestions = keywordCandidates.slice(0, 30).map(keyword => ({
            keyword: keyword,
            volume: null,
            keyword_difficulty: null,
            cpc: null,
            competition: null
          }));

          console.log(`Found ${result.suggestions.length} keyword candidates on page`);

        } catch (error) {
          console.error('Error extracting Keyword Magic data:', error);
        }

        return result;
      });

      // Debug output
      console.log(`Extracted ${data.suggestions.length} keyword suggestions for "${keyword}"`);

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
