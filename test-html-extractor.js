const { SemrushScraper } = require('./semrush-scraper');

async function testHTMLExtraction() {
  console.log('Testing direct HTML element extraction...');

  const scraper = new SemrushScraper();

  try {
    await scraper.initialize();

    const result = await scraper.page.evaluate(() => {
      // Find all relevant DOM elements directly
      const elements = document.querySelectorAll('section[aria-label="Keywords"] *');

      const foundElements = [];
      elements.forEach((el, index) => {
        const text = el.textContent?.trim() || '';
        const tag = el.tagName;

        // Look for elements that contain keyword + number patterns
        if (text && /\d{3,}/.test(text) && /[a-z]{3,}/.test(text)) {
          const innerHTML = el.innerHTML?.substring(0, 200) || '';

          foundElements.push({
            index,
            tag,
            text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
            innerHTML: innerHTML.substring(0, 100) + (innerHTML.length > 100 ? '...' : ''),
            class: el.className || '',
            id: el.id || ''
          });
        }
      });

      return foundElements.slice(0, 20); // First 20 matches
    });

    console.log(`Found ${result.length} potential data elements:`);
    result.forEach((el, i) => {
      console.log(`${i + 1}. <${el.tag} class="${el.class}"> ${el.text}`);
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
