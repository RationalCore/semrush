const express = require('express');
const { SemrushScraper } = require('./corrected-semrush-scraper');
const config = require('./config');

const app = express();
const port = config.server.port;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize scraper (without browser - we're using algorithmic parsing)
const scraper = new SemrushScraper();

console.log('Semrush scraper initialized with algorithmic parsing!');

// Routes
app.get('/keyword-overview', async (req, res) => {
  try {
    const keyword = req.query.keyword || req.query.q;
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword parameter is required' });
    }

    console.log(`Scraping Keyword Overview for: ${keyword}`);
    const result = await scraper.getKeywordOverview(keyword);
    res.json(result);
  } catch (error) {
    console.error('Keyword Overview error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to fetch keyword overview data'
    });
  }
});

app.get('/keyword-magic', async (req, res) => {
  try {
    const keyword = req.query.keyword || req.query.q;
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword parameter is required' });
    }

    console.log(`Scraping Keyword Magic for: ${keyword}`);
    const result = await scraper.getKeywordMagic(keyword);

    // Transform the result into the expected JSON structure
    const transformedResult = result.data.suggestions.map(item => ({
      Keyword: item.keyword,
      Intent: item.intent,
      Volume: item.volume,
      'Keyword Difficulty': item.keyword_difficulty,
      'CPC (USD)': item.cpc
    }));

    // Send the transformed JSON data
    res.json(transformedResult);
  } catch (error) {
    console.error('Keyword Magic error:', error);
    res.status(500).json({ error: 'Failed to fetch keyword magic data' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'semrush-api-wrapper'
  });
});

// Start server
app.listen(port, () => {
  console.log(`Semrush API wrapper running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Keyword Overview: http://localhost:${port}/keyword-overview?keyword=your-keyword`);
  console.log(`Keyword Magic: http://localhost:${port}/keyword-magic?keyword=your-keyword`);
});
