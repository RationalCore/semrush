const fs = require('fs');
const http = require('http');
const https = require('https');
const config = require('./config');

// Read keywords from file
function loadKeywords() {
  try {
    const content = fs.readFileSync('debug-keywords-list.txt', 'utf8');
    return content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  } catch (error) {
    console.error('Error reading keywords file:', error);
    return ['web scraping tool', 'seo tools', 'keyword research']; // fallback keywords
  }
}

// Get random keyword from list
function getRandomKeyword() {
  const keywords = loadKeywords();
  const randomIndex = Math.floor(Math.random() * keywords.length);
  return keywords[randomIndex];
}

// Make HTTP request to the endpoint
function makeRequest(keyword) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:${config.server.port}/keyword-magic?keyword=${encodeURIComponent(keyword)}`;

    console.log(`\n[${new Date().toISOString()}] Testing keyword: "${keyword}"`);
    console.log(`Requesting: ${url}`);

    const protocol = url.startsWith('https:') ? https : http;

    const req = protocol.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const result = JSON.parse(data);
            console.log(`✅ Success for keyword "${keyword}"`);
            console.log(`   Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
            console.log(`   Total suggestions: ${result.total_suggestions || 0}`);
            console.log(`   Response time: ~${result.timestamp ? new Date() - new Date(result.timestamp) : 'unknown'}ms`);

            // Show sample suggestions
            if (result.data && result.data.suggestions && result.data.suggestions.length > 0) {
              console.log(`   Sample suggestions: ${result.data.suggestions.slice(0, 3).map(s => `"${s.keyword}"`).join(', ')}`);
            }

            resolve(result);
          } else {
            console.error(`❌ HTTP Error for keyword "${keyword}": ${res.statusCode}`);
            resolve(null);
          }
        } catch (parseError) {
          console.error(`❌ Parse Error for keyword "${keyword}":`, parseError.message);
          console.error('Raw response:', data.slice(0, 200) + '...');
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request Error for keyword "${keyword}":`, error.message);
      resolve(null);
    });

    // Set timeout
    req.setTimeout(120000, () => {
      console.error(`❌ Timeout for keyword "${keyword}" (120s)`);
      req.destroy();
      resolve(null);
    });
  });
}

// Debug keyword magic endpoint
async function debugKeywordMagic() {
  console.log('🔍 Starting Keyword Magic endpoint debugging...\n');

  // Check if server is running
  try {
    await new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${config.server.port}/health`, (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Server is running and healthy');
          resolve();
        } else {
          reject(new Error(`Server returned status ${res.statusCode}`));
        }
      });
      req.on('error', () => {
        reject(new Error('Server is not running. Please start with: npm start'));
      });
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Server health check timeout'));
      });
    });
  } catch (error) {
    console.error('❌', error.message);
    console.log('\nPlease start the server first:');
    console.log('  npm start');
    return;
  }

  console.log(`\n📋 Loaded ${loadKeywords().length} keywords from debug-keywords-list.txt\n`);

  const testCount = parseInt(process.argv[2]) || 5;
  console.log(`🎯 Running ${testCount} debug requests...\n`);

  const results = {
    total: testCount,
    successful: 0,
    failed: 0,
    totalSuggestions: 0,
    executionTimes: []
  };

  for (let i = 0; i < testCount; i++) {
    const keyword = getRandomKeyword();
    const startTime = Date.now();

    const result = await makeRequest(keyword);

    const executionTime = Date.now() - startTime;
    results.executionTimes.push(executionTime);

    if (result && result.success) {
      results.successful++;
      results.totalSuggestions += result.total_suggestions || 0;
    } else {
      results.failed++;
    }

    // Wait between requests to avoid rate limiting
    if (i < testCount - 1) {
      const waitTime = 2000 + Math.random() * 3000; // 2-5 seconds random
      console.log(`⏳ Waiting ${(waitTime/1000).toFixed(1)}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 DEBUG SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total requests: ${results.total}`);
  console.log(`Successful: ${results.successful} (${((results.successful/results.total)*100).toFixed(1)}%)`);
  console.log(`Failed: ${results.failed} (${((results.failed/results.total)*100).toFixed(1)}%)`);
  console.log(`Average suggestions per successful request: ${results.successful > 0 ? (results.totalSuggestions/results.successful).toFixed(1) : 0}`);
  console.log(`Average execution time: ${(results.executionTimes.reduce((a,b) => a+b, 0)/results.executionTimes.length).toFixed(0)}ms`);
  console.log(`Min execution time: ${Math.min(...results.executionTimes)}ms`);
  console.log(`Max execution time: ${Math.max(...results.executionTimes)}ms`);

  if (results.successful === results.total) {
    console.log('\n✅ All requests successful! Keyword Magic endpoint appears to be working correctly.');
  } else if (results.successful > 0) {
    console.log('\n⚠️  Some requests failed. Check the endpoint implementation for issues.');
  } else {
    console.log('\n❌ All requests failed. Critical issues with the endpoint.');
  }
}

// Run the debug function
debugKeywordMagic().catch(error => {
  console.error('Debug script failed:', error);
  process.exit(1);
});
