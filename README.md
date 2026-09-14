# HorusWebsite

Официальный сайт **HorusClient**: лендинг, личный кабинет, подписки, лицензионные ключи, привязка HWID, поддержка.

## Запуск

Требуется **Node.js 22.5+** (используется встроенный `node:sqlite`).

```bash
npm install
npm start
```

Сайт: http://localhost:3000

## Что внутри

- **Лендинг** — hero, возможности, тарифы, лаунчер, сообщество (Discord/Telegram со счётчиками).
- **Аккаунт** — регистрация, вход, сессии с HttpOnly cookie, пароли через scrypt.
- **Кабинет** — профиль (Логин / UID / Почта / Дата регистрации / HWID), подписки, привязка устройства, покупка, активация ключа, безопасность.
- **Помощь** — Поддержка / Предложить идею / Сообщить о баге (тикеты в БД).
- **Сообщество** — Discord и Telegram в сайдбаре кабинета.
- **API для лаунчера** — вход, проверка лицензии, привязка/снятие HWID.

## Конфигурация и правки

- **Тарифы и названия** (Kamiki / Alpha, цены) — `PLANS` в `server.js`.
- **Ссылки и счётчики сообщества** — таблица `site_cfg` в `data/horus.sqlite`
  (`discord_url`, `discord_members`, `telegram_url`, `telegram_members`, `purchase_note`).
- **Тестовые ключи** — лежат в `licence_keys` (добавляются при первом запуске):
  - `HORUS-KAMIKI-2026-0001`, `HORUS-KAMIKI-2026-0002`
  - `HORUS-ALPHA-2026-0001`, `HORUS-ALPHA-2026-0002`
  Ключи можно генерировать/добавлять прямо в этой таблице.

## API (кратко)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/register` | Регистрация `{login, email, password}` |
| POST | `/api/login` | Вход `{login, password}` (логин или почта) |
| POST | `/api/logout` / `/api/logout-all` | Выход / выход со всех устройств |
| GET | `/api/me` | Текущий пользователь |
| POST | `/api/change-password` | Смена пароля |
| POST | `/api/change-email` | Смена почты |
| POST | `/api/hwid/bind` | Привязка устройства (лаунчер): `{hwid}` |
| POST | `/api/hwid/unbind` | Снять привязку |
| POST | `/api/hwid/reset` | Сброс раз в месяц (только Alpha) |
| POST | `/api/activate-key` | Активация ключа: `{key}` |
| GET | `/api/plans` | Тарифы |
| POST | `/api/purchase` | Создание заказа (оплата подключится позже) |
| POST | `/api/support` | Тикет: `{type: support|idea|bug, subject, message}` |
| GET | `/api/license/check` | Проверка лицензии (для лаунчера) |
| GET | `/api/stats` | Счётчики для лендинга: `{users, sales}` |

## Структура

```
server.js        приложение Express + все роуты
db.js            схема SQLite + авто-сид (папка data/ создаётся сама)
public/
  index.html     лендинг + каркас кабинета
  css/style.css  тема (тёмная, золото/синий)
  js/app.js      роутинг, лендинг, кабинет, формы
  img/logo.svg   логотип (око Хоруса)
data/horus.sqlite  база (создаётся при первом запуске; НЕ хранить в git)
```

## Дальше по плану

- Подключение оплаты (крипта / карты).
- **HorusLauncher** — отдельное приложение, которое логинится через сайт,
  привязывает HWID (`/api/hwid/bind`) и проверяет лицензию (`/api/license/check`).