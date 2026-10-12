# Підключення MCP-серверів LeadDesk (Task B)

Конфіг: [`.mcp.json`](../../.mcp.json) і [`.claude/settings.json`](../../.claude/settings.json). Усе нижче
перевірено в сесіях Claude Code 2.1.165 на Windows 10. Джерела — журнали сесій, `/mcp` і відповіді інструментів.

- **Акаунти** (особисті чи одноразові, без клієнтських організацій і команд):
  - Supabase — окремий безкоштовний проєкт `leaddesk-ws5` (`project_ref=zwuwufvwjoonpnfaffoi`), створений
    лише під цю домашку. Під час входу в MCP обрано організацію цього проєкту.
  - Vercel — особистий акаунт на плані Hobby. У його єдиній команді, крім домашки, є інші проєкти, зокрема
    клієнтські. Тому **токен Vercel MCP на цю команду не розширювали**, а лог білду взяли з дашборда
    (див. «Vercel» нижче). Правильніше рішення на майбутнє — окремий акаунт Vercel лише для навчальних
    проєктів.
  - Figma — не використовували.
- **Третій сервер:** Playwright. Акаунт не потрібен і немає квоти викликів (у Figma Starter — 20 на місяць
  на все). До того ж урок про права тут найнаочніший: ядро сервера завжди містить `browser_run_code_unsafe`,
  і закрити його можна лише `deny` на боці Claude Code.
- **Vercel CLI на цій машині:** не встановлено. `Get-Command vercel` нічого не знаходить, і агент у сесії
  Vercel побачив те саме. Тому шлях `use_vercel_cli` → `Bash` → локальний токен CLI тут нікуди не веде.

## Сервери

| Сервер | Який доступ | Навіщо нам | Що станеться при компрометації | Чим саме звужено |
|---|---|---|---|---|
| `supabase` | 9 інструментів у `/mcp`. Схема (`list_tables`, `list_migrations`, `list_extensions`); `execute_sql` і `apply_migration` — читання й запис будь-якої таблиці проєкту під роллю `postgres` (власник таблиць, RLS на нього не діє); `get_project_url`, `get_publishable_keys`, `generate_typescript_types`; `search_docs` | Міграція схеми й сид тих самих 20 лідів, що у фікстурі сервера Task A: це дані прогону A в Task C | OAuth-токен видано на організацію Supabase, а не на URL. З ним можна читати й змінювати всі дані проєктів цієї організації (тут — синтетичні ліди з іменами, email і текстами заявок), створювати й видаляти таблиці | `project_ref=` — рівно один проєкт, у схемах інструментів немає `project_id`. `features=database,development,docs`: без `account` (немає `list_organizations`, `create_project`…), без `functions` (канал назовні), без `branching` (платне). `execute_sql` і `apply_migration` не в `allow`, тож кожен виклик схвалює людина. Окремий одноразовий проєкт |
| `vercel` | 238 інструментів у `/mcp`. OAuth-скоуп один (`openid`), тож токен — це користувач Vercel цілком: проєкти, деплої, логи, налаштування, домени, оплати | Знайти деплой і лог його білду | Купівлі `buy_*` з картки; деплой довільного коду на публічний `*.vercel.app`; посилання в обхід Deployment Protection; повідомлення в toolbar, які бачить клієнт; читання логів і налаштувань усіх проєктів, до яких має доступ токен | `deny` на всі 11 інструментів, що змінюють стан. `allow` — лише `list_deployments`, `get_deployment`, `get_deployment_build_logs`. Токен не розширено на команду з іншими проєктами. Vercel CLI не встановлено |
| `playwright` | Локальний Chrome через `@playwright/mcp@0.0.82`: відкрити будь-яку адресу, читати текст сторінки, консоль і мережу (зокрема заголовки й тіла запитів), заповнювати форми, клікати. 25 інструментів до звуження, 21 після | Перевірити форму заявки на `http://localhost:3000` | Токена немає. Ризик — недовірений текст сторінки (prompt injection) і канали назовні: `browser_navigate` на адресу з даними в query. Без `deny` — ще й RCE через `browser_run_code_unsafe` і читання файлів проєкту (`.env.local`) через `browser_file_upload` | Точна версія `@0.0.82`; `--isolated` (профіль лише в пам'яті, без логінів); `--no-webmcp`; `--allowed-origins http://localhost:3000` (зручність, а не межа безпеки). `deny`: `browser_run_code_unsafe`, `webmcp_*`, `browser_file_upload`, `browser_drop`, `browser_evaluate`. `allow` — 10 точних імен. `browser_network_request` щоразу питає. Ніколи разом із Supabase |

- **Vercel: 238 інструментів, а в `deny` — 11.** Це перелік записуючих інструментів із walkthrough. Чи є
  серед решти 227 ще записуючі, ми не перевіряли інструмент за інструментом. Усе, що не в `allow`, Claude Code
  однаково дає викликати лише після схвалення людини.
- Сервер `leaddesk` (Task A) у `.mcp.json` не входить. Його підключено зі скоупом `local` лише в теці прогону B
  у Task C.

## Supabase: схема й сид

- Міграція `supabase/migrations/0001_leaddesk.sql` створює таблицю `public.leads`. Статус — лише `new`,
  `contacted`, `qualified`, `won` або `lost`; `id` — за шаблоном `^lead_[0-9]{4}$`. Також вона додає індекс
  `leads_status_created_at_idx` і вмикає RLS.
- Сид `supabase/seed/leads.sql`: 20 рядків `lead_0001`–`lead_0020`, згенерованих із `materials/leads.json`,
  тобто ті самі, що у фікстурі сервера Task A. Після сиду `select count(*) from public.leads` дає `20`.
- Скільки інструментів Supabase видно в `/mcp` із нашим URL: **9**.
- Якими викликами створено схему й дані:
  1. `get_project_url` — агент сам перевірив, що працює з проєктом домашки (`https://zwuwufvwjoonpnfaffoi.supabase.co`);
  2. `apply_migration` (`name: leaddesk`) → `{"success":true}`;
  3. `execute_sql` із сидом → `[]`;
  4. `execute_sql` `select count(*)` → `[{"count":20}]`.

  Кожен `apply_migration` і `execute_sql` схвалено вручну, нічого не відхиляли.
- Під якою роллю працює `execute_sql`: `postgres` / `postgres`, `is_superuser = off`. Це не суперкористувач,
  але власник таблиці, тож RLS на нього не діє.

## Vercel: деплой і лог

- **Імпорт.** Vercel побачив у репозиторії два застосунки й запропонував «multi-service project» з окремим
  сервісом `mcp/leaddesk-server` і готовим `vercel.json`. Від цього ми відмовились: MCP-сервер не повинен
  жити в інтернеті. Проте перший імпорт однаково взяв теку `mcp/leaddesk-server`: `get_project` показав
  `framework: node`, білд тривав 9 с і Next.js не збирав. Виправили в дашборді (Root Directory — корінь,
  Framework Preset — Next.js) і передеплоїли. Новий деплой — Ready за 33 с.
- **Захист.** `get_project` повернув `ssoProtection: all_except_custom_domains`, тобто деплої на `*.vercel.app`
  закриті Vercel Authentication. Саме цей захист обходить `get_access_to_vercel_url`, тому він у `deny`.
- **Лог через MCP — 403.** `list_teams` повернув порожній список. `list_deployment_events` (з `teamId` і без)
  повернув `403 forbidden: Not authorized: Trying to access resource under scope …`. Розширити доступ токена
  на всю команду ми свідомо не стали, бо в ній є інші проєкти. Лог нового деплою скопійовано з дашборда в
  `docs/mcp/evidence/vercel-build-log.txt`.

## Сесії: що вмикаємо разом

У кожній сесії — щонайбільше один сервер із правом запису; браузерний сервер — ніколи разом із Supabase.
Нижче записано, як було насправді: за журналами сесій і `/mcp`.

| Крок | Увімкнено в `/mcp` | Сервер із правом запису в цій сесії |
|---|---|---|
| Вхід (лише Authenticate, агенту нічого не писали) | `supabase`, `vercel`, `playwright` | — (жодного виклику інструментів) |
| Знімок «до» | `playwright`, але **`supabase` і `vercel` лишились увімкненими** | ⚠️ Порушення правила: браузер в одній сесії з Supabase. Агент лише записав файл (`Write`), MCP-інструментів не викликав. Помітили з журналу сесії вже після неї |
| Знімок «після» | `playwright` (`supabase`, `vercel` вимкнено, видно в `/mcp`) | `playwright`; MCP-викликів не було |
| Перевірка форми в браузері | `playwright` | `playwright` |
| Міграція й сид | `supabase` | `supabase` |
| Лог білду | `vercel` — у **тій самій** сесії, що й міграція (помилка порядку, мала бути нова сесія) | `supabase`; у `vercel` усі 11 записуючих під `deny`, викликано лише читання |

**Конектори claude.ai.** Журнали показали, що в кожній сесії, крім наших серверів, були інструменти
конекторів claude.ai з того самого акаунта: CRM, документи, автоматизації. Claude Code вмикає їх
автоматично, і частина з них уміє писати. Отже, правило «один записуючий сервер на сесію» насправді не
трималось у жодній сесії Task B, хоча самі агенти цих інструментів не викликали. Висновок і захід: для
прогонів Task C конектори вимкнено змінною `ENABLE_CLAUDEAI_MCP_SERVERS=false`. Те саме вміє налаштування
`disableClaudeAiConnectors`.

## До і після звуження: третій сервер

- Як отримали перелік: нова сесія (застереження щодо сесії «до» — вище), запит «Перелічи всі інструменти
  сервера playwright, які тобі зараз доступні, по одному імені на рядок, і збережи цей перелік у
  docs/mcp/evidence/mcp-before.txt (mcp-after.txt). Жодного інструмента playwright не викликай.» Блок `deny`
  і `allow` для Playwright додано окремим комітом між двома знімками.
- `docs/mcp/evidence/mcp-before.txt`: **25** інструментів.
- `docs/mcp/evidence/mcp-after.txt`: **21** інструмент. Зникли `browser_run_code_unsafe`, `browser_file_upload`,
  `browser_drop` і `browser_evaluate`. Інструментів `webmcp_*` не було й до того: їх прибирає `--no-webmcp`,
  а `deny` — друга лінія.
- `/mcp` і після `deny` показував біля `playwright` ті самі «25 tools»: лічильник у `/mcp` заборон не враховує.
  Тому джерело переліку — саме відповідь агента.
