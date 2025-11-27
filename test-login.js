const { SemrushScraper } = require('./corrected-semrush-scraper');

async function testLogin() {
  console.log('Testing proxy connectivity first...');

  // Test proxy by creating a basic browser without it first
  const { chromium } = require('playwright');

  console.log('Testing basic connection without proxy...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://httpbin.org/get', { timeout: 10000 });
    console.log('✓ Basic internet connection works');
    await page.goto('https://httpbin.org/ip', { timeout: 10000 });
    const ipContent = await page.content();
    console.log('✓ httpbin.org response received');
    console.log('Content includes:', ipContent.substring(0, 300));
  } catch (error) {
    console.log('❌ Basic internet connection failed:', error.message);
  } finally {
    await browser.close();
  }

  console.log('\nTesting with proxy...');
  const scraper = new SemrushScraper();

  try {
    console.log('1. Initializing scraper...');
    await scraper.initialize();
    console.log('✓ Browser initialized successfully');

    console.log('2. Starting login process...');

    // Navigate to login page
    console.log('3. Navigating to login page (with domcontentloaded)...');
    try {
      await scraper.page.goto('https://www.semrush.com/login/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      console.log('✓ Navigated to login page');

      // Check if we got blocked content
      const title = await scraper.page.title();
      const bodyText = await scraper.page.locator('body').textContent({ timeout: 2000 });

      console.log('Page title:', title);

      if (bodyText.includes('blocked') || bodyText.includes('not accessible')) {
        console.log('❌ Access blocked - proxy may not be working');
        console.log('Page content:', bodyText.substring(0, 500));
        return;
      }

      if (bodyText.includes('Access no longer available')) {
        console.log('❌ Sanctioned territory block detected even with proxy');
        return;
      }

    } catch (navError) {
      console.log('❌ Navigation failed:', navError.message);
      return;
    }

    // Wait for login form
    console.log('4. Checking if login form is loaded...');
    const formSelector = 'form';
    await scraper.page.waitForSelector(formSelector, { timeout: 10000 });
    console.log('✓ Login form found');

    // Fill email
    console.log('5. Filling email field...');
    const emailSelector = 'input[name="email"], input[type="email"], input[id*="email"]';
    await scraper.page.fill(emailSelector, scraper.username);
    console.log('✓ Email filled:', scraper.username);

    // Fill password
    console.log('6. Filling password field...');
    const passwordSelector = 'input[name="password"], input[type="password"], input[id*="password"]';
    await scraper.page.fill(passwordSelector, scraper.password);
    console.log('✓ Password filled');

    // Click submit
    console.log('7. Clicking submit button...');
    const submitSelector = 'button[type="submit"], button[class*="submit"], .login-submit, #login-submit';
    await scraper.page.click(submitSelector);
    console.log('✓ Submit button clicked');

    // Wait for login to complete
    console.log('8. Waiting for login completion...');
    await scraper.page.waitForTimeout(5000); // Wait a bit

    const currentUrl = scraper.page.url();
    console.log('9. Current URL after login:', currentUrl);

    if (currentUrl.includes('dashboard') || currentUrl.includes('semrush.com')) {
      console.log('✓ Login appears successful!');
    } else {
      console.log('? Login status uncertain, URL:', currentUrl);
    }

  } catch (error) {
    console.error('❌ Test failed at step:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    console.log('Closing scraper...');
    await scraper.close().catch(e => console.log('Close error:', e.message));
  }
}

testLogin();
