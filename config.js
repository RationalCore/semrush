// Application Configuration
const config = {
  // Server settings
  server: {
    port: process.env.PORT || 3850
  },

  // Semrush credentials
  semrush: {
    username: 'bohchrisawn65909@hotmail.com',
    password: 'AAf94HgCtNf'
  },

  // Proxy configuration
  proxy: {
    server: 'http://45.4.198.164:8000',
    username: 'DJ4nGU',
    password: 'FyoaQ6'
  },

  // Browser configuration
  browser: {
    headless: false,
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
    successUrls: [
      'https://www.semrush.com/home/',
      'https://www.semrush.com/dashboard/',
      'https://www.semrush.com/products/'
    ]
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
