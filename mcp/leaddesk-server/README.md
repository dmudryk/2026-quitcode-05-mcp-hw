# LeadDesk MCP server

Доменний MCP-сервер LeadDesk (Task A): два бізнес-дієслова замість SQL на всю базу.

| Що | Тип | Анотації |
|---|---|---|
| `leaddesk_find_leads` | ліди за статусом (`new`…`lost` або `any`), найновіші першими; лише `id`, `company`, `status`, `source`, `budget`, `createdAt` | `readOnlyHint: true` |
| `leaddesk_set_lead_status` | змінює статус ліда й пише запис аудиту `{ action, leadId, at, from, to, reason }` | `readOnlyHint: false` |
| `leaddesk://reference/statuses` | ресурс `text/markdown`: п'ять статусів і що кожен означає для команди | — |

Дані — `fixtures/leads.json`, незмінна копія `materials/leads.json` (20 лідів `lead_0001`–`lead_0020`).
Сервер читає файл один раз і тримає зміни й аудит у пам'яті процесу; у файл не пише ніколи.

## Запуск

Node.js ≥ 22.19. З теки сервера:

```bash
npm ci
node src/server.mjs      # stdio: чекає клієнта на stdin, зупинка — Ctrl+C
```

Змінні оточення (необов'язкові): `LEADDESK_FIXTURE` — абсолютний шлях до іншого файла фікстури.
Секретів сервер не потребує.

## Перевірка Inspector'ом

Git Bash, з кореня репозиторію:

```bash
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs --method tools/list
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_find_leads --tool-arg status=qualified
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method tools/call --tool-name leaddesk_set_lead_status \
  --tool-arg leadId=lead_0002 --tool-arg status=contacted --tool-arg "reason=перевірка в Inspector"
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs \
  --method resources/read --uri leaddesk://reference/statuses
```

Збережені результати — у [`docs/mcp/`](../../docs/mcp/).

## Підключення до Claude Code

Скоуп `local` (за замовчуванням): сервер бачите лише ви і лише в поточній теці. Шлях — абсолютний:

```bash
claude mcp add leaddesk -- node "D:/path/to/2026-quitcode-05-mcp-hw/mcp/leaddesk-server/src/server.mjs"
```

У новій сесії `/mcp` покаже `leaddesk` із двома інструментами. Прибрати — `claude mcp remove leaddesk`.

## HTTP-варіант (бонус E1)

```bash
node src/http.mjs        # http://127.0.0.1:3333/mcp, лише loopback
```

Та сама фабрика, що в `server.mjs`. Гварди `localhostHostValidation()` і `localhostOriginValidation()`
викликаються в обробнику запиту: підроблений `Host` чи чужий `Origin` отримують 403.
