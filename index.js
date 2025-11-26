const express = require('express');
const { SemrushScraper } = require('./semrush-scraper');
const config = require('./config');

const app = express();
const port = config.server.port;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize scraper
const scraper = new SemrushScraper();

// Initialize browser on startup
(async () => {
  try {
    await scraper.initialize();
    console.log('Semrush scraper initialized successfully');
  } catch (error) {
    console.error('Failed to initialize scraper:', error);
    process.exit(1);
  }
})();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await scraper.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await scraper.close();
  process.exit(0);
});

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
    res.json(result);
  } catch (error) {
    console.error('Keyword Magic error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to fetch keyword magic data'
    });
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

module.exports = app;
