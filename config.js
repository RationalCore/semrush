// Application Configuration
const config = {
  // Server settings
  server: {
    port: process.env.PORT || 3850
  },

  // Semrush credentials
  semrush: {
    username: 'akiereisen4133@hotmail.com',
    password: 'BrsJRi1TVghS'
  },

  // Proxy configuration
  proxy: {
    server: 'http://38.152.62.207:8000',
    username: 'jJPfHX',
    password: 'nuUCJ0'
  },

  // Browser configuration
  browser: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    defaultTimeout: 180000 // 3 minutes
  },

  // Timeout configurations
  timeouts: {
    navigation: 30000,
    loginWait: 10000,
    contentLoad: 8000,
    keywordOverviewWait: 15000,
    keywordMagicWait: 5000,
    additionalWait: 3000,
    extendedWait: 5000,
    fallbackWait: 2000
  },

  // Semrush URLs and settings
  semrushUrls: {
    base: 'https://www.semrush.com',
    login: 'https://www.semrush.com/login/',
    keywordOverview: (keyword, db = 'us') => `https://www.semrush.com/analytics/keywordoverview/?q=${encodeURIComponent(keyword)}&db=${db}`,
    keywordMagic: (keyword, db = 'us') => `https://www.semrush.com/analytics/keywordmagic/?q=${encodeURIComponent(keyword)}&db=${db}`,
    successUrls: ['**/home/**', '**/dashboard/**', '**/products/**']
  },

  // Default settings
  defaults: {
    database: 'us',
    maxSuggestions: 50,
    maxRelatedKeywords: 15,
    maxTrendMonths: 12
  }
};

module.exports = config;
