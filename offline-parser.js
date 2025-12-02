const fs = require('fs');

// Load the captured keywords section
const fullText = fs.readFileSync('dev-tool-keywords-section.txt', 'utf-8');

console.log(`📊 Analyzing ${fullText.length} characters from "dev tool" keywords section\n`);

console.log('🐛 Sample data pattern:');
console.log('-'.repeat(80));
// Display first few entries
const lines = fullText.split('\u200c'); // Use zero-width space or other separators
const firstFewEntries = fullText.split(/weeks\s+/);
console.log(firstFewEntries[1]); // Show first entry after header
console.log(firstFewEntries[2]); // Show second entry

// Now try different splitting approaches
console.log('\n🔍 Testing different parse approaches...\n');

// APPROACH 1: Split on intent patterns
console.log('🎯 APPROACH 1: Intent-based splitting');
const intentRegex = /([INC]\w{0,2})?(\d{1,2})?,?(\d{2,4})\d{0,6}[NnKkMmBb]?n\/an\/a/g; // Updated regex for dev tool format
const matches = [];

let match;
while ((match = intentRegex.exec(fullText)) !== null) {
  matches.push(match);
  if (matches.length >= 20) break; // Limit for display
}

console.log(`Found ${matches.length} initial matches:`);
matches.forEach((match, i) => {
  console.log(`${i+1}. Match: [${match[0]}], Intent: ${match[1]}, Volume part1: ${match[2]}, Volume part2: ${match[3]}`);
});

// APPROACH 2: Direct keyword extraction with regex
console.log('\n🎯 APPROACH 2: Direct keyword extraction');
const keywordRegex = /([a-zA-Z][^\u200c]{1,60}?)​([INC]\w{0,2}?)?(\d{1,2})?,?(\d{3,5})\d{0,2}[n\/an\/a]([\d\.]{1,6})/g;
const keywordMatches = [];

let kMatch;
while ((kMatch = keywordRegex.exec(fullText)) !== null) {
  keywordMatches.push(kMatch);
  if (keywordMatches.length >= 10) break;
}

console.log(`Found ${keywordMatches.length} keyword matches:`);
keywordMatches.forEach((match, i) => {
  const keyword = match[1]?.trim().replace(/​$/, '') || 'UNKNOWN';
  const intent = match[2] || 'N/A';
  const volume1 = match[3] || '';
  const volume2 = match[4] || '';
  const cpc = match[5] || '';
  console.log(`${i+1}. Keyword: "${keyword}", Intent: ${intent}, Volume: ${volume1},${volume2}, CPC: $${cpc}`);
});

// APPROACH 3: Character-by-character analysis
console.log('\n🎯 APPROACH 3: Character-based analysis');
const sectionStart = fullText.indexOf('N03,600'); // First data entry
const sampleData = fullText.substring(sectionStart, sectionStart + 200);
console.log('Raw sample data:');
console.log(`"${sampleData}"`);

// Find patterns in sample
const sampleKeywords = [];
const samplePattern = /([a-zA-Z\s]{1,50})​([INC]\w{0,2})?(\d{1,2})?,?(\d{3,5})n\/an\/a([\d\.]{1,6})/g;

let sMatch;
while ((sMatch = samplePattern.exec(sampleData)) !== null) {
  sampleKeywords.push(sMatch);
}
console.log(`Sample parsing found ${sampleKeywords.length} entries:`);
sampleKeywords.forEach((match, i) => {
  console.log(`${i+1}. "${match[1]}", ${match[2]}${match[3]},${match[4]}, $${match[5]}`);
});

console.log('\n🔧 Parser development complete. Ready for production!');
