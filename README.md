# Semrush API Wrapper

Обертка для semrush.com с использованием Playwright для автоматизации API вызовов через веб-интерфейс.

## Установка

```bash
npm install
npx playwright install chromium
```

## Запуск

```bash
npm start
```

Сервер будет доступен на порту 3000.

## API Endpoints

### GET /health

Проверка здоровья сервиса.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-26T07:13:00.000Z",
  "service": "semrush-api-wrapper"
}
```

### GET /keyword-overview?keyword={keyword}

Получение данных Keyword Overview для указанного ключевого слова.

**Parameters:**
- `keyword` (string, required) - Ключевое слово для анализа

**Response:**
```json
{
  "success": true,
  "data": {
    "keyword": "seo",
    "volume": 1000000,
    "cpc": 2.15,
    "competition": 78.5,
    "trend": [
      {"month": "2024-01", "volume": 823000},
      {"month": "2024-02", "volume": 823000}
    ],
    "related": [
      {"keyword": "seo services", "volume": 33100, "cpc": 18.56}
    ]
  },
  "timestamp": "2025-11-26T07:13:00.000Z",
  "keyword": "seo",
  "database": "us"
}
```

### GET /keyword-magic?keyword={keyword}

Получение данных Keyword Magic (предложения ключевых слов) для указанного ключевого слова.

**Parameters:**
- `keyword` (string, required) - Базовое ключевое слово для генерации предложений

**Response:**
```json
{
  "success": true,
  "data": {
    "keyword": "seo",
    "suggestions": [
      {
        "keyword": "seo services",
        "volume": 33100,
        "cpc": 18.56,
        "competition": 45.2
      }
    ]
  },
  "timestamp": "2025-11-26T07:13:00.000Z",
  "keyword": "seo",
  "database": "us",
  "total_suggestions": 50
}
```

## Конфигурация

### Прокси

Сервис использует прокси для доступа к semrush.com:
```
http://38.152.62.207:8000:jJPfHX:nuUCJ0
```

### Аутентификация

Автоматическая аутентификация с сохранением сессии:

**Функциональность Cookie:**
- После успешного логина куки сохраняются в файл `cookies.json`
- При последующих запусках куки загружаются автоматически
- Логин по паролю происходит только при отсутствии валидных куки или если они старше 7 дней
- Это значительно ускоряет последующие запросы и уменьшает нагрузку на сервер Semrush

**Учетные данные:**
- Email: akiereisen4133@hotmail.com
- Password: BrsJRi1TVghS (используется из переменных окружения или захардкожено)

**Безопасность:**
- Файл `cookies.json` добавлен в `.gitignore` и не должен попадать в репозиторий
- Каждый пользователь должен иметь свои собственные куки
```

### Проверка здоровья сервиса
```bash
curl "http://localhost:3000/health"
```

## Структура проекта

- `index.js` - Главный сервер Express.js
- `semrush-scraper.js` - Класс для работы с semrush через Playwright
- `package.json` - Зависимости и скрипты
- `README.md` - Документация

## Зависимости

- **express** - Веб-фреймворк для API
- **playwright** - Браузерная автоматизация для семруша

## Безопасность

- Используется прокси для обхода гео-ограничений
- Автоматическая аутентификация в semrush
- Ограничение API на US базу данных только
- Graceful shutdown для корректного закрытия браузера
