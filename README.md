<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).

# Crypto API Server

## Эндпоинты

### Checker API

#### Получение истории PnL рефералов

**GET** `/checker/referrals-pnl-history`

Возвращает базу рефералов и сабрефералов пользователя с их историей PnL за указанный период.

**Параметры запроса:**
- `email` (обязательный) - email родительского пользователя
- `start` (опциональный) - начало периода в timestamp (мс)
- `to` (опциональный) - конец периода в timestamp (мс)  
- `days` (опциональный) - количество дней назад от текущей даты

**Примеры использования:**

```bash
# Получить данные за последние 7 дней (по умолчанию)
GET /checker/referrals-pnl-history?email=user@example.com

# Получить данные за последние 30 дней
GET /checker/referrals-pnl-history?email=user@example.com&days=30

# Получить данные за конкретный период
GET /checker/referrals-pnl-history?email=user@example.com&start=1640995200000&to=1641081600000
```

**Ответ:**
```json
{
  "parentEmail": "user@example.com",
  "period": {
    "start": 1640995200000,
    "to": 1641081600000
  },
  "referrals": [
    {
      "email": "referral1@example.com",
      "username": "referral_user1",
      "level": 1,
      "apis": [
        {
          "apiName": "Binance_API",
          "market": "binance",
          "pnlHistory": [
            {
              "start": 1640995200000,
              "to": 1641081600000,
              "pnl": 150.25,
              "totalBalance": 5000.00,
              "snapshotTime": 1641081600000
            }
          ]
        }
      ],
      "totalPnl": 150.25
    }
  ],
  "totalReferrals": 1,
  "totalPnl": 150.25
}
```

**Описание полей:**
- `parentEmail` - email родительского пользователя
- `period` - период запроса
- `referrals` - массив рефералов
  - `email` - email реферала
  - `username` - имя пользователя
  - `level` - уровень реферала (1 - прямой, 2 - саб-реферал, 3 - третий уровень)
  - `apis` - API ключи реферала и их история
    - `apiName` - название API
    - `market` - биржа
    - `pnlHistory` - история PnL по дням
  - `totalPnl` - общий PnL реферала за период
- `totalReferrals` - общее количество рефералов
- `totalPnl` - общий PnL всех рефералов
