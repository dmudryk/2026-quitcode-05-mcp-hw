# Перевірка (Task A, Task B, бонус E)

- **Інструмент і версія, модель:** Claude Code 2.1.165 · Opus 5.5 (`claude-opus-5-5`)
- **ОС і термінал, Node:** Windows 10 Pro 19045 · Git Bash · Node 24.14.1

## Task A — сервер в Inspector

- Команди, якими зроблено чотири файли в `docs/mcp/` — як у walkthrough, Git Bash, з кореня репозиторію:

  ```bash
  I="npx -y @modelcontextprotocol/inspector@2.8.0 --cli node mcp/leaddesk-server/src/server.mjs"
  $I --method tools/list > docs/mcp/tools-list.json                                   # exit=0
  $I --method tools/call --tool-name leaddesk_set_lead_status --tool-arg leadId=lead_0002 \
     --tool-arg status=contacted --tool-arg "reason=перевірка в Inspector" > docs/mcp/set-status.json   # exit=0
  $I --method tools/call --tool-name leaddesk_set_lead_status --tool-arg leadId=nope \
     --tool-arg status=won --tool-arg reason=ok > docs/mcp/bad-input.json             # exit=5
  $I --method resources/read --uri leaddesk://reference/statuses > docs/mcp/resource-read.json   # exit=0
  ```

- `tools-list.json`: рівно два інструменти. `leaddesk_find_leads` — `"readOnlyHint": true`,
  `leaddesk_set_lead_status` — `"readOnlyHint": false` (плюс `destructiveHint: false`, `openWorldHint: false`).
  У кожного параметра є `description` з `.describe(…)`: модель бачить перелік статусів, формат
  `lead_0002`, межі `limit` 1–50 і що `reason` — без персональних даних. Опис
  `leaddesk_set_lead_status` починається з «ЗМІНЮЄ ДАНІ» і просить підтвердження людини перед викликом.
- `bad-input.json`: зламано два аргументи — `leadId=nope` (не проходить `^lead_\d{4}$`) і `reason=ok`
  (коротше за 3 символи). Результат — `"isError": true` з текстом
  `Input validation error: … leadId: Invalid string: must match pattern /^lead_\d{4}$/, reason: Too small: expected string to have >=3 characters`.
  Inspector завершився з кодом **5** і надрукував у stderr
  `{"error":{"code":"tool_is_error","message":"Tool 'leaddesk_set_lead_status' returned isError:true."}}`.
- `set-status.json`: `lead_0002` (Rynok Books) `new` → `contacted`. Запис аудиту в `structuredContent.audit`:
  `{ "action": "lead.status_changed", "leadId": "lead_0002", "at": "2026-10-10T13:34:52.746Z", "from": "new", "to": "contacted", "reason": "перевірка в Inspector" }`.
  `action` — у тому ж стилі, що `lead.created` у `app/actions.ts`.
- `resource-read.json`: `leaddesk://reference/statuses`, `"mimeType": "text/markdown"`, таблиця з
  п'яти статусів: що означає, хто і коли переводить.
- Додатково перевірено (не комічено):
  - `leaddesk_find_leads status=new limit=3` → `lead_0002`, `lead_0005`, `lead_0004`, найновіші першими. У
    відповіді немає `fullName`, `email`, `message`.
  - `leadId=lead_0099` → `isError: true`, «Ліда lead_0099 немає. Знайди правильний id через leaddesk_find_leads…», exit=5.
  - `lead_0002 status=new` (той самий статус) → `isError: true`, «уже має статус new. Нічого не змінено.», exit=5.
  - `grep -rc 'console\.log' mcp/leaddesk-server/src` → 0 у кожному файлі.
  - `cmp materials/leads.json mcp/leaddesk-server/fixtures/leads.json` → файли однакові.
- Що було найважче в описах інструментів і параметрів: пояснити моделі межу без зайвих слів: що
  `find_leads` навмисно не віддає імен і email (щоб агент не шукав їх деінде), а `set_lead_status`
  змінює дані й потребує підтвердження людини. Друге — повідомлення про помилку: не просто «не
  знайдено», а що робити далі (знайти id через `leaddesk_find_leads`, перепитати людину).

## Task B — що зробили агенти з серверами

- **Supabase:** <які інструменти викликав агент для міграції й сиду; що ви схвалили вручну; чи щось відхилили>
- **Vercel:** <як задеплоїли (git-інтеграція); яким інструментом отримали лог; що в ньому>
- **Playwright:** <ланцюжок інструментів; чи відправилась форма; що в консолі й мережі>
- Що агент зробив сам, без прохання (наприклад, викликав інструмент, який ви не очікували): <… / нічого>

## Task E (бонус)

- Варіант: **E1 — HTTP-сервер** `mcp/leaddesk-server/src/http.mjs`.
- Та сама фабрика `factory`, що в `src/server.mjs` (імпорт; stdio там запускається лише при прямому
  запуску файла). Залежність `"@modelcontextprotocol/node": "2.1.0"` — точна версія в
  `mcp/leaddesk-server/package.json`.
- Гварди `localhostHostValidation()` і `localhostOriginValidation()` викликаються **в обробнику запиту**
  перед `mcp(req, res)`; сервер слухає лише `127.0.0.1:3333`.
- Запуск: `node mcp/leaddesk-server/src/http.mjs`. `body.json` — у тимчасовій теці поза репозиторієм
  (і він є в `.gitignore`). Команди й відповіді (Git Bash):

  ```bash
  printf '%s' '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}' > body.json
  H=(-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "MCP-Protocol-Version: 2026-07-28" -H "Mcp-Method: tools/list")
  ```

  1. Звичайний запит:

     ```
     $ curl -s -w '\nHTTP %{http_code}\n' "${H[@]}" --data-binary @body.json http://127.0.0.1:3333/mcp
     {"result":{"tools":[{"name":"leaddesk_find_leads", … },{"name":"leaddesk_set_lead_status", … }],"resultType":"complete", … ,"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"leaddesk","version":"0.1.0"}}},"jsonrpc":"2.0","id":1}
     HTTP 200
     ```

  2. Підроблений `Host` (DNS rebinding):

     ```
     $ curl -s -w '\nHTTP %{http_code}\n' "${H[@]}" -H "Host: evil.example" --data-binary @body.json http://127.0.0.1:3333/mcp
     {"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Host: evil.example"},"id":null}
     HTTP 403
     ```

  3. Чужий `Origin` (запит зі сторінки в браузері):

     ```
     $ curl -s -w '\nHTTP %{http_code}\n' "${H[@]}" -H "Origin: https://evil.example" --data-binary @body.json http://127.0.0.1:3333/mcp
     {"jsonrpc":"2.0","error":{"code":-32000,"message":"Invalid Origin: evil.example"},"id":null}
     HTTP 403
     ```

  4. Без заголовка `MCP-Protocol-Version`:

     ```
     $ curl -s -w '\nHTTP %{http_code}\n' -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Mcp-Method: tools/list" --data-binary @body.json http://127.0.0.1:3333/mcp
     {"jsonrpc":"2.0","error":{"code":-32020,"message":"Bad Request: the request headers and body disagree: the body envelope names protocol version 2026-07-28 but the required MCP-Protocol-Version header is absent", … },"id":1}
     HTTP 400
     ```

- Висновок: 200 / 403 / 403 / 400, як і очікувалось. Захист від DNS rebinding і від запитів зі
  сторінок у браузері тримається на двох рядках `if (!check…(req, res)) return;`. Без них сервер на
  `127.0.0.1` відповідав би 200 будь-якій сторінці, яка змусила браузер постукати на цей порт.
  Автентифікації HTTP-варіант не має, тому він лише для loopback.
