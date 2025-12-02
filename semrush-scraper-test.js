const { SemrushScraper } = require('./semrush-scraper-fixed');

async function debugTest() {
  console.log('🏃 Testing fixed regex patterns...');

  const scraper = new SemrushScraper();

  try {
    await scraper.initialize();

    // Test with geo app
    console.log('📖 Testing with "geo app"...');
    const result = await scraper.getKeywordMagic('geo app', 20);

    console.log('📊 Result:');
    console.log('- Success:', result.success);
    console.log('- Keywords found:', result.data?.suggestions?.length || 0);
    console.log('- Sample:', result.data?.suggestions?.slice(0, 2) || []);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  debugTest().catch(console.error);
}
