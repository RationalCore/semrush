const { SemrushScraper } = require('./corrected-semrush-scraper');

async function testCookies() {
  console.log('Testing cookie functionality...');

  const scraper = new SemrushScraper();

  try {
    console.log('1. Initializing scraper...');
    await scraper.initialize();
    console.log('✓ Browser initialized');

    console.log('2. Testing login (should create cookies file on first run)...');
    await scraper.login();
    console.log('✓ Login completed');

    console.log('3. Checking if cookies file was created...');
    const fs = require('fs').promises;
    try {
      const cookiesContent = await fs.readFile('cookies.json', 'utf-8');
      console.log('✓ Cookies file exists');
      console.log('Cookies file content (first 500 chars):', cookiesContent.substring(0, 500));
    } catch (error) {
      console.log('❌ Cookies file was not created:', error.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    console.log('Closing scraper...');
    await scraper.close().catch(e => console.log('Close error:', e.message));
  }

  console.log('\n4. Testing second run (should use saved cookies)...');
  const scraper2 = new SemrushScraper();

  try {
    console.log('Initializing second scraper...');
    await scraper2.initialize();
    console.log('✓ Second browser initialized');

    console.log('Testing login with saved cookies...');
    await scraper2.login();
    console.log('✓ Second login completed (should have used cookies)');

  } catch (error) {
    console.error('❌ Second test failed:', error.message);
  } finally {
    console.log('Closing second scraper...');
    await scraper2.close().catch(e => console.log('Close error:', e.message));
  }
}

testCookies();
