const express = require('express');
const { SemrushScraper } = require('./semrush-scraper-fixed');

const app = express();
const port = 3850;

// Middleware
app.use(express.json());

// Initialize scraper
const scraper = new SemrushScraper();

async function initScraper() {
  try {
    console.log('Initializing Semrush scraper...');
    await scraper.initialize();
    console.log('✅ Semrush scraper initialized successfully!');
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

    console.log(`API Request: Keyword Magic for "${keyword}" (limit: ${limit})`);

    const result = await scraper.getKeywordMagic(keyword, limit);

    if (result.success && result.data.suggestions.length > 0) {
      // Transform to expected format
      const keywords = result.data.suggestions.map(item => ({
        Keyword: item.keyword,
        Volume: item.volume,
        'Keyword Difficulty': item.keyword_difficulty,
        'CPC (USD)': item.cpc
      }));

      console.log(`✅ Returned ${keywords.length} keywords for "${keyword}"`);
      res.json(keywords);
    } else {
      console.log('❌ No data found, returning empty array');
      res.json([]);
    }
  } catch (error) {
    console.error('❌ API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Semrush API running on port ${port}`);
  console.log(`Keyword Magic: http://localhost:${port}/keyword-magic?keyword=your-keyword`);
});
