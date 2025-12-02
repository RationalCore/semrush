const { SemrushScraper } = require('./semrush-scraper-final-corrected');
const fs = require('fs');

async function debugRegex() {
  const scraper = new SemrushScraper();

  try {
    await scraper.initialize();

    const url = `https://www.semrush.com/analytics/keywordmagic/?q=map%20tool&db=us`;

    console.log(`Scraping for map tool...`);

    await scraper.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await scraper.page.waitForTimeout(25000);

    // Debug regex matching
    const debugResult = await scraper.page.evaluate(() => {

      const regexPattern = /="Checkbox\.Text">([\w\s]*?)<\/span>.*?data-testid="table-cell-volume" role="cell">([\d,\.]*)<\/div>.*?<span class="sm-cell-kd__data">([\d\.]+)%?<\/span>/g;

      const tableHTML = document.body.innerHTML;
      console.log(`HTML length: ${tableHTML.length}`);

      let match;
      const matches = [];
      while ((match = regexPattern.exec(tableHTML)) !== null) {
        matches.push(match);
        if (matches.length >= 20) break; // Limit
      }

      console.log(`Regex found ${matches.length} matches`);

      // Show first few matches
      matches.slice(0, 5).forEach((match, i) => {
        console.log(`Match ${i+1}:[1] "${match[1]}" | [2] "${match[2]}" | [3] "${match[3]}"`);
      });

      return {
        htmlLength: tableHTML.length,
        matchesFound: matches.length,
        firstMatches: matches.slice(0, 5).map(m => ({
          keyword: m[1],
          volume: m[2],
          kd: m[3]
        }))
      };
    });

    console.log('Debug result:', {
      htmlLength: debugResult.htmlLength,
      matchesFound: debugResult.matchesFound,
      firstMatches: debugResult.firstMatches
    });

  } catch (error) {
    console.error('Debug failed:', error);
  } finally {
    await scraper.close();
  }
}

debugRegex().catch(console.error);
