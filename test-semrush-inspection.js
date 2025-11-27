const { chromium } = require('playwright');
const fs = require('fs').promises;
const config = require('./config');

async function inspectSemrushPage() {
  console.log('Starting Semrush page inspection...');

  // Launch browser and login (reuse existing logic)
  const browser = await chromium.launch({
    headless: false,
    args: config.browser.args
  });

  const context = await browser.newContext({
    proxy: {
      server: config.proxy.server,
      username: config.proxy.username,
      password: config.proxy.password
    },
    userAgent: config.browser.userAgent
  });

  const page = await context.newPage();

  try {
    // Load saved cookies if available
    try {
      const cookieData = await fs.readFile('./cookies.json', 'utf-8');
      const { cookies } = JSON.parse(cookieData);
      await context.addCookies(cookies);
      console.log('Loaded saved cookies');
    } catch (error) {
      console.log('No saved cookies found, will login manually');
    }

    // Navigate to dance-party page
    console.log('Navigating to SEMrush dance-party page...');
    await page.goto('https://www.semrush.com/analytics/keywordoverview/?q=dance-party&db=us', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait a moment for page to load
    await page.waitForTimeout(5000);

    // Take screenshot
    await page.screenshot({ path: 'semrush-inspection.png', fullPage: true });
    console.log('Screenshot saved as semrush-inspection.png');

    // Inspect the structure
    const inspection = await page.evaluate(() => {
      const results = {
        wholePageText: document.body?.textContent?.substring(0, 3000) || '',
        elementsFound: []
      };

      // Find all visible numeric elements
      document.querySelectorAll('*').forEach(el => {
        if (el.offsetParent !== null && el.textContent) {
          const text = el.textContent.trim();

          // Look for numbers and percentages
          const volumeMatch = text.match(/\b\d+(?:,\d+)*(?:\.\d+)?[KkMmBb]?\b/);
          const percentMatch = text.match(/\b\d+(?:\.\d+)?%\b/);

          if (volumeMatch || percentMatch) {
            const rect = el.getBoundingClientRect();

            // Skip if not visible or in navigation
            if (rect.width > 0 && rect.height > 0 &&
                rect.top > 50 && rect.bottom < window.innerHeight - 50) {

              results.elementsFound.push({
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                dataTestId: el.getAttribute('data-testid'),
                text: text.replace(/\s+/g, ' ').substring(0, 100),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                x: Math.round(rect.left),
                y: Math.round(rect.top)
              });
            }
          }
        }
      });

      // Find potential metric containers
      const containers = [
        ...Array.from(document.querySelectorAll('[class*="metric"], [class*="stat"], [class*="value"]')),
        ...Array.from(document.querySelectorAll('[data-testid*="metric"], [data-testid*="stat"], [data-testid*="value"]'))
      ];

      results.containersFound = containers.slice(0, 20).map(c => ({
        tagName: c.tagName,
        className: c.className,
        dataTestId: c.getAttribute('data-testid'),
        text: c.textContent?.trim().substring(0, 50),
        rect: c.getBoundingClientRect()
      }));

      return results;
    });

    console.log('\n=== SEMRUSH PAGE INSPECTION RESULTS ===');
    console.log('Total numeric elements found:', inspection.elementsFound.length);

    console.log('\n--- NUMERIC ELEMENTS ---');
    inspection.elementsFound.slice(0, 20).forEach((el, idx) => {
      console.log(`${idx}: ${el.tagName}.${el.className} "${el.text}" (${el.x},${el.y}) ${el.width}x${el.height}`);
    });

    console.log('\n--- POTENTIAL METRIC CONTAINERS ---');
    inspection.containersFound.slice(0, 10).forEach((container, idx) => {
      console.log(`${idx}: ${container.tagName}.${container.className} "${container.text}"`);
    });

    console.log('\n--- FIRST 1000 CHARS OF PAGE TEXT ---');
    console.log(inspection.wholePageText.substring(0, 1000));
    console.log('\n=======================================');

    // Save detailed results to file
    await fs.writeFile('semrush-inspection-results.json', JSON.stringify(inspection, null, 2));
    console.log('Full inspection results saved to semrush-inspection-results.json');

  } catch (error) {
    console.error('Inspection failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the inspection
inspectSemrushPage().catch(console.error);
