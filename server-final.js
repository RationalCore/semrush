const express = require('express');
const { SemrushScraper } = require('./semrush-scraper-complete-final');

const app = express();
const port = 3850;

// Middleware
app.use(express.json());

// Initialize scraper
const scraper = new SemrushScraper();

async function initScraper() {
  try {
    console.log('🚀 Initializing COMPREHENSIVE SEMrush scraper...');
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
      const sample = keywords.slice(0, 5).map(k =>
        `"${k.Keyword}" (${k.Volume}vol, ${k['Keyword Difficulty']}%KD, $${k['CPC (USD)']}CPC)`
      ).join(' | ');
      console.log(`📋 Top 5: ${sample}`);

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
    scraper: 'semrush-complete-regex-scraper',
    version: '3.0.0'
  });
});

app.listen(port, () => {
  console.log(`🚀 COMPREHENSIVE SEMrush API Server v3.0.0 running on port ${port}`);
  console.log(`🔗 Health: http://localhost:${port}/health`);
  console.log(`🔗 Keywords: http://localhost:${port}/keyword-magic?keyword=your-keyword`);
  console.log();
  console.log('🎯 ADVANCED DOM REGEX EXTRACTION FEATURES:');
  console.log('   ✅ Negative lookahead excludes UI elements');
  console.log('   ✅ Extracts all 4 fields: Keyword, Volume, KD%, CPC');
  console.log('   ✅ Precise regex pattern with named groups');
  console.log('   ✅ Complete data validation and cleaning');
  console.log('   ✅ Includes first highest-volume result');
  console.log();
  console.log('📝 PRODUCTION READY WITH COMPLETE SEMRUSH INTEGRATION! 🚀');
});

process.on('SIGINT', async () => {
  console.log('Gracefully shutting down...');
  await scraper.close();
  process.exit(0);
});
