# Проверка комиссий пользователя

## Описание
Новый endpoint `/checkUserCommissions` позволяет проверить расчет комиссий пользователя за указанный период без изменения данных в базе данных и без отправки сообщений.

**Логика проверки вынесена в отдельный модуль `CommissionCheckService`** для лучшей организации кода и следования принципам SOLID.

## Основные особенности
- ✅ **НЕ записывает** ничего в базу данных
- ✅ **НЕ отправляет** уведомления или сообщения  
- ✅ **НЕ изменяет** стартовую дату пользователя
- ✅ Использует точно такие же расчеты как основная система
- ✅ Выводит детальную информацию в консоль и возвращает в ответе
- ✅ Показывает реферальные выплаты
- ✅ Учитывает дельты API и все типы комиссий
- ✅ **Вынесена в отдельный модуль** для чистой архитектуры

## Архитектура
```
src/
├── commission-check/
│   ├── commission-check.service.ts     # Основная логика проверки
│   ├── commission-check.module.ts      # Модуль NestJS
│   └── index.ts                        # Экспорты модуля
├── markets/
│   ├── markets.controller.ts           # Endpoint
│   └── markets.service.ts              # Делегирует в CommissionCheckService
```

## Endpoint
```
POST /markets/checkUserCommissions
```

## Формат запроса
```json
{
  "email": "user@example.com",
  "startDate": 1672531200000,
  "endDate": 1675209600000
}
```

**Параметры:**
- `email` (string) - Email пользователя
- `startDate` (number) - Дата начала периода в миллисекундах (timestamp)
- `endDate` (number) - Дата окончания периода в миллисекундах (timestamp)

## Пример ответа
```json
{
  "status": true,
  "data": {
    "userEmail": "user@example.com",
    "username": "UserName",
    "startDate": "01.01.2023",
    "endDate": "31.01.2023",
    "commissionSettings": {
      "privatePercent": 5,
      "privateAbsolute": null,
      "countedCommission": 3,
      "balanceForCommissions": 1000
    },
    "totalCommissionByApis": 150.25,
    "finalTotalCommission": 150.25,
    "apis": [
      {
        "apiName": "API-001",
        "startBalance": 5000,
        "endBalance": 5500,
        "startPnl": 100,
        "endPnl": 150,
        "realizedPnl": 75,
        "pnlDelta": 50,
        "totalProfit": 125,
        "totalProfitWithDelta": 130,
        "lastApiDelta": 5,
        "commission": 6.50,
        "commissionSource": "Пользовательская приватная комиссия: 5%",
        "refPaid": [
          {
            "username": "ReferrerUser",
            "email": "referrer@example.com",
            "amount": 2.60,
            "explanation": "Комиссия за 1 уровня, от пользователя user@example.com"
          }
        ],
        "totalRefPaid": 2.60,
        "reportsCount": 31
      }
    ],
    "summary": {
      "totalApis": 3,
      "totalReports": 93,
      "totalStartBalance": 15000,
      "totalEndBalance": 16500,
      "totalRealizedPnl": 225,
      "totalPnlDelta": 150,
      "totalRefPaid": 7.80
    }
  }
}
```

## Информация в консоли
Метод выводит подробную информацию в консоль:

```
=== ПРОВЕРКА КОМИССИЙ ПОЛЬЗОВАТЕЛЯ ===
Email: user@example.com
Период: 01.01.2023 - 31.01.2023
=====================================

Найдено API ключей: 3
1. API-001 (Bybit)
2. API-002 (Bybit)  
3. API-003 (Binance)

=== ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ ===
Последняя дата комиссии в БД: 25.01.2023
ВНИМАНИЕ: Используем переданные даты, НЕ БД!

=== ОТЧЕТЫ ЗА ПЕРИОД ===
Найдено отчетов: 93

=== НАСТРОЙКИ КОМИССИЙ ===
Приватная комиссия - процент: 5%
Приватная комиссия - абсолютная: null USDT
Расчетная комиссия: 3%
Баланс для комиссий: 1000 USDT

=== ДЕТАЛЬНЫЙ РАСЧЕТ ПО API ===

--- API: API-001 ---
Отчетов: 31
Период: 01.01.2023 - 31.01.2023
PnL начальный: 100.00
PnL конечный: 150.00
Реализованный PnL за период: 75.00
Последняя дельта API: 5.00
Дельта PnL: 50.00
Общая прибыль: 125.00
Общая прибыль с дельтой: 130.00
Источник комиссии: Пользовательская приватная комиссия: 5%
Комиссия: 6.50 USDT
Реферальные выплаты:
  ReferrerUser (referrer@example.com): 2.60 USDT - Комиссия за 1 уровня, от пользователя user@example.com
Общая сумма реферальных выплат: 2.60 USDT

=== ИТОГОВЫЙ РЕЗУЛЬТАТ ===
Пользователь: UserName (user@example.com)
Период: 01.01.2023 - 31.01.2023
Общая комиссия по API: 150.25 USDT
Итоговая комиссия: 150.25 USDT
===============================
```

## Приоритет комиссий
Система применяет комиссии в следующем порядке:
1. **API приватная комиссия** (процент)
2. **API абсолютная комиссия** 
3. **Пользовательская приватная комиссия** (процент)
4. **Пользовательская абсолютная комиссия** (применяется в конце к общей сумме)
5. **Расчетная комиссия** (процент)

## Реферальные выплаты
- **1 уровень**: 20% от комиссии
- **2 уровень**: 7% от комиссии  
- **3 уровень**: 3% от комиссии

## Ошибки
```json
{
  "status": false,
  "error": "Пользователь с email user@example.com не найден или у него нет API ключей"
}
```

```json
{
  "status": false,
  "error": "Нет отчетов за указанный период"
}
```

## Примеры использования

### cURL
```bash
curl -X POST http://localhost:3000/markets/checkUserCommissions \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "startDate": 1672531200000,
    "endDate": 1675209600000
  }'
```

### JavaScript/Fetch
```javascript
const response = await fetch('/markets/checkUserCommissions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@example.com',
    startDate: 1672531200000, // 01.01.2023
    endDate: 1675209600000    // 31.01.2023
  })
});

const result = await response.json();
console.log(result);
```

### Конвертация дат
```javascript
// Из строки в timestamp
const startTimestamp = new Date('2023-01-01').getTime();
const endTimestamp = new Date('2023-01-31').getTime();

// Из timestamp в строку
const dateStr = new Date(1672531200000).toLocaleDateString();
``` 