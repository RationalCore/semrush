const { chromium } = require('playwright');
const config = require('./config');

async function debugKeywordMagic() {
  const browser = await chromium.launch({
    headless: false, // Keep debug script in non-headless mode
    args: config.browser.args
  });

  const context = await browser.newContext({
    proxy: config.proxy,
    userAgent: config.browser.userAgent
  });

  const page = await context.newPage();

  try {
    // Login процесс
    console.log('Navigating to login...');
    await page.goto('https://www.semrush.com/login/', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="email"]', 'akiereisen4133@hotmail.com');
    await page.fill('input[name="password"]', 'BrsJRi1TVghS');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/home/**', { timeout: 30000 });
    console.log('Login successful!');

    // Go to Keyword Magic
    console.log('Going to Keyword Magic...');
    await page.goto('https://www.semrush.com/analytics/keywordmagic/?q=rag%20tool&db=us');

    // Wait for content
    await page.waitForTimeout(10000);

    // Debug information
    const debugInfo = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const tableInfos = Array.from(tables).map((table, index) => ({
        index,
        rowCount: table.querySelectorAll('tr').length,
        headers: Array.from(table.querySelectorAll('th, thead th')).map(h => h.textContent.trim()),
        firstFewRows: Array.from(table.querySelectorAll('tr')).slice(0, 3).map(row =>
          Array.from(row.querySelectorAll('td')).map(cell => cell.textContent.trim().slice(0, 50))
        )
      }));

      const allDivsWithNumbers = Array.from(document.querySelectorAll('div, span, p')).filter(el => {
        const text = el.textContent.trim();
        return text && (text.match(/\d{3,}/) || text.includes('volume') || text.includes('CPC'));
      }).map(el => el.textContent.trim().slice(0, 100));

      const keywordElements = Array.from(document.querySelectorAll('[data-testid*="keyword"], .keyword, [class*="keyword"]'))
        .slice(0, 10).map(el => el.textContent.trim().slice(0, 100));

      return {
        title: document.title,
        url: document.location.href,
        tables: tableInfos,
        divsWithNumbers: allDivsWithNumbers.slice(0, 20),
        keywordElements: keywordElements,
        bodyLength: document.body?.textContent?.length || 0
      };
    });

    console.log('DEBUG INFO:');
    console.log(JSON.stringify(debugInfo, null, 2));

    // Try different table structures
    for (let i = 0; i < debugInfo.tables.length; i++) {
      const table = debugInfo.tables[i];
      if (table.rowCount > 5) {
        console.log(`\nANALYZING TABLE ${i}:`);
        console.log('Headers:', table.headers);
        console.log('Sample rows:', table.firstFewRows);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

debugKeywordMagic();
