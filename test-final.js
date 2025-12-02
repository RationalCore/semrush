const { SemrushScraper } = require('./semrush-scraper-final');

async function testFinal() {
  console.log('🚀 Testing final version with "geo app"...');

  const scraper = new SemrushScraper();

  try {
    await scraper.initialize();

    const result = await scraper.getKeywordMagic('geo app', 10);

    console.log('📊 RESULT:', {
      success: result.success,
      keywordsFound: result.data?.suggestions?.length || 0,
      sample: result.data?.suggestions?.slice(0, 3) || []
    });

    // Show first keyword details
    if (result.data?.suggestions?.[0]) {
      const kw = result.data.suggestions[0];
      console.log('🎯 First keyword:', {
        keyword: kw.keyword,
        volume: kw.volume,
        intent: kw.intent,
        cpc: kw.cpc
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await scraper.close();
  }
}

testFinal().catch(console.error);
