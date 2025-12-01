const { SemrushScraper } = require('./semrush-scraper');

async function testKeywordMagic() {
  const scraper = new SemrushScraper();

  try {
    console.log('Initializing scraper...');
    await scraper.initialize();

    console.log('Testing Keyword Magic Tool...');
    const result = await scraper.getKeywordMagic('seo tools', 10);

    console.log('Result:', JSON.stringify(result, null, 2));

    // Publish to Telegram bot
    if (result.success && result.data.suggestions && result.data.suggestions.length > 0) {
      console.log(`\nSuccessfully parsed ${result.data.suggestions.length} keyword suggestions:`);
      result.data.suggestions.forEach((suggestion, index) => {
        console.log(`${index + 1}. "${suggestion.keyword}" - Volume: ${suggestion.volume}, KD: ${suggestion.keyword_difficulty}%, CPC: $${suggestion.cpc}`);

        // Expected format: Keyword | Volume | Keyword Difficulty | CPC (USD)
        if (suggestion.keyword && suggestion.volume && suggestion.keyword_difficulty !== null && suggestion.cpc !== null) {
          const message = `${suggestion.keyword}\t${suggestion.volume}\t${suggestion.keyword_difficulty}\t${suggestion.cpc}`;
          console.log(`Formatted: ${message}`);
        }
      });

      // Try to send to Telegram if we have valid data
      const validatedSuggestions = result.data.suggestions.filter(s =>
        s.keyword && s.volume && s.keyword_difficulty !== null && s.cpc !== null
      );

      if (validatedSuggestions.length > 0) {
        // Publish to Telegram bot
        const { publishToTelegram } = require('./telegram-bot');
        const message = validatedSuggestions.slice(0, 10).map(s =>
          `${s.keyword}\t${s.volume}\t${s.keyword_difficulty}\t${s.cpc}`
        ).join('\n');

        console.log('Publishing to Telegram...');
        await publishToTelegram(`Keyword data for "${result.data.keyword}":\n\n${message}`);
        console.log('Published to Telegram successfully');
      }
    } else {
      console.log('No keyword suggestions found');

      // Debug: let's get more detailed page analysis
      console.log('\nDebugging page structure...');
      const pageAnalysis = await scraper.page.evaluate(() => {
        const keywordsSection = document.querySelector('section[aria-label="Keywords"]');

        const analysis = {
          keywordsSectionFound: !!keywordsSection,
          keywordsSectionContentLength: keywordsSection?.textContent?.length || 0,
          keywordsSectionChildCount: keywordsSection?.children?.length || 0,
          allSectionsCount: document.querySelectorAll('section').length,
          allAriaLabelSections: Array.from(document.querySelectorAll('section[aria-label]')).map(s => ({
            label: s.getAttribute('aria-label'),
            childCount: s.children.length,
            textPreview: s.textContent.substring(0, 100)
          }))
        };

        if (keywordsSection) {
          analysis.keywordsSectionElements = {
            allDivs: keywordsSection.querySelectorAll('div').length,
            tables: keywordsSection.querySelectorAll('table').length,
            tableRows: keywordsSection.querySelectorAll('tr').length,
            testIds: Array.from(keywordsSection.querySelectorAll('[data-testid]')).map(el => ({
              testId: el.getAttribute('data-testid'),
              tagName: el.tagName,
              text: el.textContent.trim().substring(0, 50)
            })).slice(0, 10) // First 10 testids
          };
        }

        return analysis;
      });

      console.log('Page Analysis:', JSON.stringify(pageAnalysis, null, 2));
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await scraper.close();
  }
}

testKeywordMagic();
