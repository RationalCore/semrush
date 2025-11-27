const fs = require('fs');

try {
  let content = fs.readFileSync('corrected-semrush-scraper.js', 'utf8');

  // Switch to headless mode
  const headlessPattern = /      \/\/ Launch browser with proxy \(debug version - visible\)\n      this\.browser = await chromium\.launch\(\{\n        headless: false, \/\/ Keep corrected version in non-headless mode for debugging/;
  const headlessReplacement = `      // Launch browser with proxy
      this.browser = await chromium.launch({
        headless: true, // Run headless for server mode`;

  content = content.replace(headlessPattern, headlessReplacement);

  // Add better error handling in validateCookies
  const validateCookiesPattern = /  async validateCookies\(\) \{\n    try \{\n      console\.log\('Validating cookies\.\.\.'\);\n\n      \/\/ Попытаться открыть защищенную страницу Semrush\n      await this\.page\.goto\('https:\/\/www\.semrush\.com\/home\/', \{\n        waitUntil: 'domcontentloaded',\n        timeout: 10000\n      }\);/;
  const validateCookiesReplacement = `  async validateCookies() {
    try {
      console.log('Validating cookies...');

      // Check if page is still available before navigation
      if (!this.page || this.page.isClosed()) {
        console.log('Page is closed, cannot validate cookies');
        return false;
      }

      // Попытаться открыть защищенную страницу Semrush
      await this.page.goto('https://www.semrush.com/home/', {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });`;

  content = content.replace(validateCookiesPattern, validateCookiesReplacement);

  fs.writeFileSync('corrected-semrush-scraper.js', content);
  console.log('File updated successfully');
} catch (error) {
  console.error('Error updating file:', error);
}
