const { SemrushScraper } = require('./semrush-scraper');

async function testHTMLExtraction() {
  console.log('Testing direct HTML element extraction with login...');

  const scraper = new SemrushScraper();

  try {
    await scraper.initialize();

    // NEED TO LOGIN FIRST!
    await scraper.login();

    // Navigate to the page
    console.log('Navigating to SEMrush Keywords page...');
    await scraper.page.goto('https://www.semrush.com/analytics/keywordmagic/?q=geo%20app&db=us', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for data to load
    await scraper.page.waitForTimeout(25000);

    console.log('Page loaded, extracting HTML structure...');

    const result = await scraper.page.evaluate(() => {
      const foundElements = [];

      // Check all sections first
      const sections = document.querySelectorAll('section');
      console.log(`Found ${sections.length} sections`);

      sections.forEach((section, idx) => {
        const label = section.getAttribute('aria-label') || '';
        const contentLen = section.textContent?.length || 0;
        if (contentLen > 1000) {
          console.log(`Section ${idx}: aria-label="${label}", content length: ${contentLen}`);
        }
      });

      // Look for any divs containing keyword data
      const allDivs = document.querySelectorAll('div');
      console.log(`Total divs found: ${allDivs.length}`);

      allDivs.forEach((div, index) => {
        const text = div.textContent?.trim() || '';
        if (text && text.length > 100 && /\d{3,}/.test(text) && /[a-z]{3,}/.test(text)) {
          const classes = div.className || '';

          if (classes.includes('row') || classes.includes('item') || text.includes('app') || text.includes('geo')) {
            foundElements.push({
              index,
              text: text.substring(0, 150) + (text.length > 150 ? '...' : ''),
              classes: classes.split(' ').slice(0, 3).join(', '),
              parentClasses: div.parentElement?.className?.split(' ').slice(0, 2).join(', ') || ''
            });
          }
        }

        if (foundElements.length >= 20) return; // Limit results
      });

      return foundElements;
    });

    console.log(`Found ${result.length} potential data elements:`);
    result.forEach((el, i) => {
      console.log(`${i + 1}. [${el.classes}] ${el.text}`);
    });

  } catch (error) {
    console.error('HTML extraction test failed:', error);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  testHTMLExtraction();
}

module.exports = { testHTMLExtraction };
