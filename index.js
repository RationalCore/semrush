const express = require('express');
const { SemrushScraper } = require('./semrush-scraper');
const config = require('./config');

const app = express();
const port = config.server.port;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize scraper with browser
const scraper = new SemrushScraper();

async function initScraper() {
  try {
    console.log('Initializing Semrush scraper browser...');
    await scraper.initialize();
    console.log('✅ Semrush scraper initialized successfully!');
  } catch (error) {
    console.error('❌ Failed to initialize scraper:', error.message);
    process.exit(1);
  }
}

// Initialize scraper on startup
initScraper();

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

    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    if (limit !== null && (limit < 1 || limit > 50)) {
      return res.status(400).json({ error: 'Limit parameter must be between 1 and 50' });
    }

    console.log(`Scraping Keyword Magic for: ${keyword}${limit ? ` (limit: ${limit})` : ''}`);
    const result = await scraper.getKeywordMagic(keyword, limit);

    // Transform the result into the expected JSON structure
    let transformedResult = result.data.suggestions.map(item => ({
      Keyword: item.keyword,
      Intent: item.intent,
      Volume: item.volume,
      'Keyword Difficulty': item.keyword_difficulty,
      'CPC (USD)': item.cpc
    }));

    // Apply limit to the results if specified
    if (limit !== null && transformedResult.length > limit) {
      transformedResult = transformedResult.slice(0, limit);
    }

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
  console.log(`Keyword Magic: http://localhost:${port}/keyword-magic?keyword=your-keyword&limit=10`);
});
