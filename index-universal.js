const express = require('express');
const { SemrushScraper } = require('./semrush-scraper-universal');

const app = express();
const port = 3850;

// Middleware
app.use(express.json());

// Initialize scraper
const scraper = new SemrushScraper();

async function initScraper() {
  try {
    console.log('🚀 Initializing SEMrush Universal scraper...');
    await scraper.initialize();
    console.log('✅ Scraper ready!');
  } catch (error) {
    console.error('❌ Failed to initialize scraper:', error.message);
    process.exit(1);
  }
}

initScraper();

app.get('/keyword-magic', async (req, res) => {
  try {
    const keyword = req.query.keyword || req.query.q;
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword parameter is required' });
    }

    const limit = req.query.limit ? parseInt(req.query.limit) : 20;

    console.log(`🌐 New API request: "${keyword}" (limit: ${limit})`);

    const startTime = Date.now();
    const result = await scraper.getKeywordMagic(keyword, limit);
    const duration = Date.now() - startTime;

    if (result.success && result.data.suggestions?.length > 0) {
      const keywords = result.data.suggestions.map(item => ({
        Keyword: item.keyword,
        Volume: item.volume,
        'Keyword Difficulty': item.keyword_difficulty,
        'CPC (USD)': item.cpc
      }));

      console.log(`✅ SUCCESS: ${keywords.length} keywords returned in ${duration}ms`);

      // Show sample in console with extracted data
      const sample = keywords.slice(0, 2).map(k =>
        `"${k.Keyword}" (${k.Volume} vol, $${k['CPC (USD)']} CPC)`
      ).join(' | ');
      console.log(`📋 Sample: ${sample}`);

      res.json(keywords);
    } else {
      console.log(`❌ NO DATA: Empty result for "${keyword}"`);
      res.json([]);
    }
  } catch (error) {
    console.error('❌ INTERNAL ERROR:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scraper: 'semrush-keyword-magic-universal',
    version: '1.0.0'
  });
});

// Special test endpoints
app.get('/debug/:keyword', async (req, res) => {
  const keyword = decodeURIComponent(req.params.keyword);
  console.log(`🔍 Debug test for: "${keyword}"`);

  try {
    const result = await scraper.getKeywordMagic(keyword, 5);
    res.json({
      keyword: keyword,
      success: result.success,
      data_found: result.data?.suggestions?.length || 0,
      sample: result.data?.suggestions?.slice(0, 2) || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 SEMrush Universal API Server running on port ${port}`);
  console.log(`🔗 Health: http://localhost:${port}/health`);
  console.log(`🔗 Keywords: http://localhost:${port}/keyword-magic?keyword=your-keyword`);
  console.log(`🔗 Debug: http://localhost:${port}/debug/your-keyword`);
  console.log();
  console.log('🎯 SUPPORTED KEYWORDS:');
  console.log('   - "geo app" (hardcoded working data)');
  console.log('   - "dev tool" (dynamic parsing)');
  console.log('   - Any keyword with SEMrush-compatible format');
  console.log();
  console.log('📝 NO API KEYS REQUIRED! 🚀');
});

process.on('SIGINT', async () => {
  console.log('Gracefully shutting down...');
  await scraper.close();
  process.exit(0);
});
