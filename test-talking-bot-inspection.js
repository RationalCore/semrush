const { chromium } = require('playwright');
const fs = require('fs').promises;
const config = require('./config');

async function inspectTalkingBotPage() {
  console.log('Starting SEMrush talking bot page inspection...');

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

    // Navigate to talking bot page
    console.log('Navigating to SEMrush talking bot page...');
    await page.goto('https://www.semrush.com/analytics/keywordoverview/?q=talking+bot&db=us', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait a moment for page to load
    await page.waitForTimeout(5000);

    // Take screenshot
    await page.screenshot({ path: 'talking-bot-inspection.png', fullPage: true });
    console.log('Screenshot saved as talking-bot-inspection.png');

    // Inspect the structure specifically for difficulty
    const inspection = await page.evaluate(() => {
      const results = {
        title: document.title,
        allPercentages: [],
        difficultyElements: [],
        allElementsWith54: []
      };

      // Find all elements containing "54"
      document.querySelectorAll('*').forEach(el => {
        if (el.offsetParent && el.textContent && el.textContent.includes('54')) {
          results.allElementsWith54.push({
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            dataTestId: el.getAttribute('data-testid'),
            text: el.textContent.trim(),
            parentText: el.parentElement?.textContent?.slice(0, 200) || '',
            rect: el.getBoundingClientRect()
          });
        }
      });

      // Find all percentage values
      document.querySelectorAll('*').forEach(el => {
        if (el.offsetParent && el.textContent) {
          const text = el.textContent.trim();
          const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
          if (percentMatch) {
            results.allPercentages.push({
              value: parseFloat(percentMatch[1]),
              text: text,
              element: el.tagName,
              className: el.className,
              parentText: el.parentElement?.textContent?.slice(0, 150) || '',
              rect: el.getBoundingClientRect()
            });
          }
        }
      });

      // Look for difficulty-specific elements
      const difficultySelectors = [
        '[class*="difficulty"]',
        '[class*="competition"]',
        '[data-testid*="difficulty"]',
        '.kwo-metrics-data-layout'
      ];

      difficultySelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
          results.difficultyElements.push({
            selector: selector,
            tagName: el.tagName,
            className: el.className,
            text: el.textContent?.trim(),
            parentText: el.parentElement?.textContent?.slice(0, 200) || '',
            rect: el.getBoundingClientRect()
          });
        });
      });

      return results;
    });

    console.log('\n=== TALKING BOT PAGE INSPECTION ===');
    console.log('Page title:', inspection.title);

    console.log('\n--- ELEMENTS CONTAINING "54" ---');
    inspection.allElementsWith54.forEach((el, idx) => {
      console.log(`${idx}: ${el.tagName}.${el.className} "${el.text}"`);
      console.log(`   Parent: "${el.parentText}"`);
    });

    console.log('\n--- ALL PERCENTAGES FOUND ---');
    inspection.allPercentages.forEach((pct, idx) => {
      console.log(`${idx}: ${pct.value}% in ${pct.element}.${pct.className} "${pct.text}"`);
      console.log(`   Parent: "${pct.parentText}"`);
    });

    console.log('\n--- DIFFICULTY ELEMENTS ---');
    inspection.difficultyElements.forEach((el, idx) => {
      console.log(`${idx}: ${el.selector} -> ${el.tagName}.${el.className} "${el.text}"`);
      console.log(`   Parent: "${el.parentText}"`);
    });

    // Save detailed results to file
    await fs.writeFile('talking-bot-inspection-results.json', JSON.stringify(inspection, null, 2));
    console.log('Full inspection results saved to talking-bot-inspection-results.json');

  } catch (error) {
    console.error('Inspection failed:', error);
  } finally {
    await browser.close();
  }
}

// Run the inspection
inspectTalkingBotPage().catch(console.error);
