const { SemrushScraper } = require('./semrush-scraper');

async function debugKeywordMagicPage() {
  const scraper = new SemrushScraper();

  try {
    console.log('Initializing scraper...');
    await scraper.initialize();

    console.log('Testing Keyword Magic Tool...');
    // Navigate to the page
    const url = 'https://www.semrush.com/analytics/keywordmagic/?q=seo+tools&db=us';
    console.log(`Navigating to: ${url}`);
    await scraper.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for content
    await scraper.waitForKeywordMagicContent();
    await scraper.page.waitForTimeout(3000);

    // Save screenshot and HTML for debugging
    await scraper.page.screenshot({ path: 'debug-keyword-magic-page.png', fullPage: true });
    console.log('Screenshot saved as debug-keyword-magic-page.png');

    // Get page HTML and analyze it
    const pageData = await scraper.page.evaluate(() => {
      const result = {
        title: document.title,
        url: window.location.href,
        bodyLength: document.body?.textContent?.length || 0,
        keywordsTableFound: false,
        tableSelectors: {},
        allTablesCount: document.querySelectorAll('table').length,
        smKmtTableCount: document.querySelectorAll('.sm-kmt-table').length,
        keywordsTableSelectorCount: document.querySelectorAll('section[aria-label="Keywords"] #keywords-table').length,
        pageSections: [],
        suspiciousElements: []
      };

      // Check for keywords table with different selectors
      const tableSelectors = [
        'section[aria-label="Keywords"] #keywords-table',
        '#keywords-table',
        '.sm-kmt-table',
        'table',
        '[data-testid*="keyword"]',
        '.keyword-item',
        '.suggestion-item'
      ];

      tableSelectors.forEach(selector => {
        const count = document.querySelectorAll(selector).length;
        result.tableSelectors[selector] = count;
      });

      // Look for sections with keywords
      const sections = document.querySelectorAll('section');
      sections.forEach((section, index) => {
        const ariaLabel = section.getAttribute('aria-label');
        if (ariaLabel && (ariaLabel.toLowerCase().includes('keyword') || ariaLabel.toLowerCase().includes('suggestion'))) {
          result.pageSections.push({
            index,
            ariaLabel,
            childCount: section.children.length,
            textPreview: section.textContent?.substring(0, 200)
          });
        }
      });

      // Find elements that might contain keyword data
      const potentialElements = document.querySelectorAll('[class*="keyword"], [class*="table"], [class*="row"], [class*="cell"]');
      let suspiciousCount = 0;
      potentialElements.forEach((el, index) => {
        if (suspiciousCount < 10) { // Limit to first 10
          const text = el.textContent?.trim();
          if (text && (text.includes('volume') || text.includes('CPC') || text.includes('%') || /\d{2,6}/.test(text))) {
            result.suspiciousElements.push({
              index,
              className: el.className,
              textPreview: text.substring(0, 100)
            });
            suspiciousCount++;
          }
        }
      });

      // Check specifically for keyword suggestion rows
      const rowSelectors = [
        '.sm-table-layout__row',
        'tr',
        '[data-testid*="row"]',
        '.table-row'
      ];

      const rowsData = {};
      rowSelectors.forEach(selector => {
        const rows = document.querySelectorAll(selector);
        rowsData[selector] = rows.length;

        if (rows.length > 0) {
          const firstRowText = rows[0]?.textContent?.trim().substring(0, 100);
          rowsData[selector + '_firstText'] = firstRowText;
        }
      });

      result.rows = rowsData;

      return result;
    });

    console.log('Page analysis:');
    console.log('- Title:', pageData.title);
    console.log('- URL:', pageData.url);
    console.log('- Body length:', pageData.bodyLength);
    console.log('- Tables found:', pageData.allTablesCount);
    console.log('- SM KMT tables:', pageData.smKmtTableCount);
    console.log('- Keywords table selector count:', pageData.keywordsTableSelectorCount);
    console.log('\nTable selectors check:');
    Object.entries(pageData.tableSelectors).forEach(([selector, count]) => {
      console.log(`  ${selector}: ${count}`);
    });

    console.log('\nKeyword sections found:');
    pageData.pageSections.forEach(section => {
      console.log(`- Section ${section.index}: "${section.ariaLabel}" (${section.childCount} children)`);
      console.log(`  Text: ${section.textPreview}...`);
    });

    console.log('\nSuspicious elements (potential data):');
    pageData.suspiciousElements.forEach(el => {
      console.log(`- ${el.className}: ${el.textPreview}...`);
    });

    console.log('\nRow selectors check:');
    Object.entries(pageData.rows).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });

    // Try to extract some sample data manually
    const sampleData = await scraper.page.evaluate(() => {
      // Look for any text containing keywords and metrics
      const allText = document.body.textContent;
      const lines = allText.split('\n').filter(line => line.trim().length > 10);

      const keywordLines = lines.filter(line =>
        line.toLowerCase().includes('seo') ||
        /\b\d+(?:\.\d+)?(?:k?)\b/i.test(line) || // Numbers with optional K
        line.includes('%') ||
        line.includes('$') ||
        line.includes('volume') ||
        line.includes('CPC')
      ).slice(0, 20); // First 20 matching lines

      return {
        totalLines: lines.length,
        keywordLines,
        firstTableHTML: document.querySelector('table')?.outerHTML?.substring(0, 1000)
      };
    });

    console.log('\nSample text analysis:');
    console.log('Total lines:', sampleData.totalLines);
    console.log('Lines with potential keyword data:');
    sampleData.keywordLines.forEach((line, index) => {
      console.log(`${index + 1}: ${line.trim().substring(0, 100)}`);
    });

    console.log('\nFirst table HTML preview:');
    console.log(sampleData.firstTableHTML);

  } catch (error) {
    console.error('Debug failed:', error);
  } finally {
    await scraper.close();
  }
}

debugKeywordMagicPage();
