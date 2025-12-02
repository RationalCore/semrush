const express = require('express');
const { SemrushScraper } = require('./scraper');

const app = express();
const port = 3850;

// Middleware
app.use(express.json());

// Initialize scraper
const scraper = new SemrushScraper();

async function initScraper() {
  try {
    console.log('🚀 Initializing SEMrush scraper...');
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
      console.log('Sample:', keywords.slice(0, 3));

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

app.get('/keyword-overview', async (req, res) => {
  try {
    const keyword = req.query.keyword || req.query.q;
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword parameter is required' });
    }

    console.log(`🌐 New API request: "${keyword}" - Keyword Overview`);

    const startTime = Date.now();
    const result = await scraper.getKeywordOverview(keyword);
    const duration = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ SUCCESS: Keyword Overview returned in ${duration}ms`);
      console.log(`📋 Keyword: "${result.data.keyword}", Volume: ${result.data.volume || result.data.global_volume || 'Unknown'}`);
      res.json(result.data);
    } else {
      console.log(`❌ NO DATA: Keyword Overview failed for "${keyword}"`);
      res.status(404).json({ error: 'Keyword data not found' });
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
    scraper: 'semrush-scraper',
    version: '1.0.0'
  });
});

app.listen(port, () => {
  console.log(`🚀 SEMrush API server running on port ${port}`);
  console.log(`🔗 Keyword Magic: http://localhost:${port}/keyword-magic?keyword=your-keyword`);
  console.log(`🔗 Keyword Overview: http://localhost:${port}/keyword-overview?keyword=your-keyword`);
  console.log('📝 No API keys required - works with browser automation');
});
