const express = require('express');
const { SemrushScraper } = require('./semrush-scraper-final-regex');

const app = express();
const port = 3850;

// Middleware
app.use(express.json());

// Initialize scraper
const scraper = new SemrushScraper();

async function initScraper() {
  try {
    console.log('🚀 Initializing SEMrush DOM Regex scraper...');
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
        `"${k.Keyword}" (${k.Volume} vol, KD: ${k['Keyword Difficulty']}%)`
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
    scraper: 'semrush-dom-regex-scraper',
    version: '2.0.0'
  });
});

app.listen(port, () => {
  console.log(`🚀 SEMrush DOM Regex API Server running on port ${port}`);
  console.log(`🔗 Health: http://localhost:${port}/health`);
  console.log(`🔗 Keywords: http://localhost:${port}/keyword-magic?keyword=your-keyword`);
  console.log();
  console.log('🎯 USING WORKING DOM REGEX PATTERN:');
  console.log('   - Checkbox.Text span > keyword');
  console.log('   - table-cell-volume div > volume');
  console.log('   - sm-cell-kd__data span > keyword difficulty %');
  console.log('   - Regex: /="Checkbox\\.Text">([\\w\\s]*?)<\\/span>.*?data-testid="table-cell-volume" role="cell">([\\d,\\.]*?)<\\/div>.*?<span class="sm-cell-kd__data">([\\d\\.]+)%?<\\/span>/g');
  console.log();
  console.log('📝 PRODUCTION READY WITH WORKING REGEX! 🚀');
});

process.on('SIGINT', async () => {
  console.log('Gracefully shutting down...');
  await scraper.close();
  process.exit(0);
});
