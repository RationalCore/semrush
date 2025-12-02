const { SemrushScraper } = require('./semrush-scraper-fixed-final');

async function captureHTML() {
  const keyword = 'dev tool'; // Target keyword for debugging
  console.log(`📥 Capturing HTML structure for: ${keyword}`);

  const scraper = new SemrushScraper();

  try {
    await scraper.initialize();
    await scraper.login();

    const url = `https://www.semrush.com/analytics/keywordmagic/?q=${encodeURIComponent(keyword)}&db=us`;

    console.log(`🚀 Navigating to: ${url}`);
    await scraper.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('⏳ Full content loading...');
    await scraper.page.waitForTimeout(25000); // Wait for data to load

    // Get the full page HTML
    console.log('💾 Capturing full HTML content...');
    const pageContent = await scraper.page.content();

    // Save to file
    const fs = require('fs').promises;
    await fs.writeFile('dev-tool-html.html', pageContent);

    console.log('✅ HTML captured and saved to dev-tool-html.html');
    console.log(`📊 File size: ${pageContent.length} characters`);

    // Also save the keywords section specifically
    const keywordsSection = await scraper.page.$eval('section[aria-label="Keywords"]', el => el.textContent);
    await fs.writeFile('dev-tool-keywords-section.txt', keywordsSection);

    console.log('✅ Keywords section text saved to dev-tool-keywords-section.txt');
    console.log(`📊 Section size: ${keywordsSection.length} characters`);

    // Show first part for analysis
    console.log('\n🔍 First 1000 characters of keywords section:');
    console.log('-'.repeat(50));
    console.log(keywordsSection.substring(0, 1000));
    console.log('-'.repeat(50));

  } catch (error) {
    console.error('❌ Error capturing HTML:', error);
  } finally {
    await scraper.close();
  }
}

captureHTML().catch(console.error);
