# Перевірка форми заявки через Playwright MCP

Дата: 2026-10-11, ~10:32 UTC. Сервер: `npm run dev` на `http://localhost:3000`. Браузер — Chromium
від `@playwright/mcp` (Chrome 152), без логіну, без cookie.

## Запит (дослівно)

> Відкрий http://localhost:3000, заповни форму заявки тестовими даними, відправ, перевір консоль і
> мережу. Інших адрес не відкривай, не логінься і не заходь на /login чи /dashboard. Потім збережи
> звіт у docs/mcp/evidence/playwright-form-check.md: мій запит дослівно, ланцюжок викликаних
> інструментів по порядку, чи відправилась форма і що видно в консолі й мережі.

## Ланцюжок інструментів

Виклики Playwright, по порядку:

| # | Інструмент | Що зроблено |
|---|---|---|
| 1 | `browser_navigate` | `http://localhost:3000` → сторінка «LeadDesk», форма «Розкажіть про ваш проєкт» |
| 2 | `browser_snapshot` | отримав дерево доступності й посилання на поля форми |
| 3 | `browser_fill_form` | заповнив 8 полів тестовими даними (нижче) |
| 4 | `browser_click` | кнопка «Надіслати заявку» |
| 5 | `browser_snapshot` | замість форми — «Дякуємо! Заявку отримано.» |
| 6 | `browser_console_messages` | `level: debug`, `all: true` — усі повідомлення сесії |
| 7 | `browser_network_requests` | `static: false` — лише не-статичні запити |
| 8 | `browser_network_request` | #22, заголовки |
| 9 | `browser_network_requests` | `static: true` — повний список, щоб перевірити адреси |
| 10 | `browser_network_request` | #22, `part: request-body` |
| 11 | `browser_network_request` | #22, `part: response-body` |
| 12 | `browser_close` | закрив вкладку браузера |

Інші виклики, без браузера: на початку `Read` (нотатка пам'яті проєкту) і `ToolSearch` (підвантажити
схеми інструментів Playwright). Для звіту: `Glob`, `Bash` (`git status`, `git check-ignore`),
`Grep`, `Read` (`docs/walkthrough.md`, `mcp-after.txt`), `Write`.

`browser_network_request` немає ні в `allow`, ні в `deny`, тож на кожен із трьох викликів Claude Code
питав дозволу. Так і задумано: ці відповіді містять заголовки й тіло запиту.

`/login`, `/dashboard` і `/quotes/new` не відкривав. Посилання на них є в шапці, але по них не клікав.

## Тестові дані

| Поле | Значення |
|---|---|
| Ім'я | Тест |
| Прізвище | Перевірка |
| Email | test.form@example.com |
| Телефон | +380000000000 |
| Компанія | Тестова компанія |
| Сайт | https://example.com |
| Бюджет | $500–1500 / міс. (у формі передається як `1500`) |
| Що потрібно зробити? | Тестова заявка від Playwright MCP для домашнього завдання WS5. Не обробляти. |
| Чекбокс розсилки | не відмічено |

## Чи відправилась форма

**Так.** Після кліку форма зникла, на її місці з'явилося:

> Дякуємо! Заявку отримано.
> Ми зв'яжемося з вами протягом робочого дня.

URL лишився `http://localhost:3000/`. Server Action відповів `{"status":"ok"}`, деталі в розділі
«Мережа». Запис ліда в `/dashboard` не перевіряв: заходити туди запит забороняє.

## Консоль

Усього 2 повідомлення, **0 помилок, 0 попереджень**. Обидва з'явились під час завантаження сторінки,
після відправки нових не було:

```
[INFO] Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
[LOG]  [HMR] connected
```

Це стандартні повідомлення dev-режиму Next.js.

## Мережа

Усього 22 запити, **усі на `http://localhost:3000`**. На зовнішні домени запитів не було.

- **#1–21 — `GET`, усі `200`:** документ `/`, 4 шрифти `.woff2`, 1 CSS, 14 JS-чанків
  (Turbopack, React DOM, Next.js devtools, HMR-клієнт) і `favicon.ico`.
- **#22 — `POST /` → `200 OK`, 171 мс.** Це виклик Server Action: тип `fetch`, заголовок
  `next-action`, `content-type: multipart/form-data`, відповідь `text/x-component`.
  - Тіло запиту: поля `firstName`, `lastName`, `email`, `phone`, `company`, `website`, `budget=1500`,
    `message` зі значеннями з таблиці вище і стан дії `{"status":"idle"}`. Поля чекбокса немає,
    бо він не відмічений.
  - Тіло відповіді (RSC): `{"status":"ok"}`. Дія повертає лише статус, введених даних у відповіді
    немає.
  - Заголовка `Cookie` в запиті немає: сесії не було, вхід не виконувався.

## Що лишилось на диску

Знімки сторінки й лог консолі Playwright MCP записав у `.playwright-mcp/`. Ця тека є в
`.gitignore` (рядок 49, перевірено через `git check-ignore`), тож у коміт вона не потрапляє.
