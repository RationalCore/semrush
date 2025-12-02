const express = require('express');
const { SemrushScraper } = require('./semrush-scraper-fixed-final');

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

    const result = await scraper.getKeywordMagic(keyword, limit);

    if (result.success && result.data.suggestions?.length > 0) {
      const keywords = result.data.suggestions.map(item => ({
        Keyword: item.keyword,
        Volume: item.volume,
        'Keyword Difficulty': item.keyword_difficulty,
        'CPC (USD)': item.cpc
      }));

      console.log(`✅ SUCCESS: ${keywords.length} keywords returned for "${keyword}"`);

      // Show sample in console
      console.log('📋 Sample:', keywords.slice(0, 2).map(k => `${k.Keyword} (vol:${k.Volume}, cpc:$${k['CPC (USD)']})`));

      res.json(keywords);
    } else {
      console.log(`❌ NO DATA: Returning empty array for "${keyword}"`);
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
    scraper: 'semrush-keyword-magic-production'
  });
});

// For demo purposes - hardcoded demo data
app.get('/demo', (req, res) => {
  console.log('📚 Returning demo data for "geo app"');

  const demoData = [
    {
      "Keyword": "geo app",
      "Volume": 80,
      "Keyword Difficulty": 35,
      "CPC (USD)": 0.37
    },
    {
      "Keyword": "nat geo app",
      "Volume": 480,
      "Keyword Difficulty": 35,
      "CPC (USD)": 1.04
    },
    {
      "Keyword": "geo dash app",
      "Volume": 10,
      "Keyword Difficulty": 35,
      "CPC (USD)": 0.0
    },
    {
      "Keyword": "geo tracker app",
      "Volume": 10,
      "Keyword Difficulty": 35,
      "CPC (USD)": 0.3
    },
    {
      "Keyword": "geo force app",
      "Volume": 10,
      "Keyword Difficulty": 35,
      "CPC (USD)": 0.0
    },
    {
      "Keyword": "geo cash app",
      "Volume": 90,
      "Keyword Difficulty": 35,
      "CPC (USD)": 0.08
    },
    {
      "Keyword": "geo quiz app",
      "Volume": 90,
      "Keyword Difficulty": 35,
      "CPC (USD)": 0.03
    },
    {
      "Keyword": "geo fencing app",
      "Volume": 70,
      "Keyword Difficulty": 35,
      "CPC (USD)": 0.35
    }
  ];

  res.json(demoData);
});

app.listen(port, () => {
  console.log(`🚀 SEMrush API Server running on port ${port}`);
  console.log(`🔗 Health: http://localhost:${port}/health`);
  console.log(`🔗 Keywords: http://localhost:${port}/keyword-magic?keyword=your-keyword`);
  console.log(`🔗 Demo: http://localhost:${port}/demo`);
  console.log(`🎯 Supports hardcoded data for "geo app" keyphrase`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await scraper.close();
  process.exit(0);
});
