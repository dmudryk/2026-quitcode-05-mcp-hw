// LeadDesk as an MCP server — Task A of Workshop 5.
// Two business verbs instead of SQL over the whole database:
//
//   leaddesk_find_leads        reads: leads by status, newest first, only the fields the agent needs
//   leaddesk_set_lead_status   writes: changes a lead's status and records an audit entry
//   leaddesk://reference/statuses   what each status means for the team
//
//   node src/server.mjs                                   offline on fixtures/leads.json (the only mode)
//   LEADDESK_FIXTURE=/abs/path/leads.json node src/server.mjs   another fixture file
//
// The fixture is read once and never written: status changes and the audit log live in process
// memory, so after a restart the data is the same 20 leads again.
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { readFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Vocabulary of the app: LEAD_STATUSES in lib/types.ts, leadId() in lib/db.ts.
export const LEAD_STATUSES = ["new", "contacted", "qualified", "won", "lost"];
const LEAD_ID = /^lead_\d{4}$/;

const FIXTURE = process.env.LEADDESK_FIXTURE ?? fileURLToPath(new URL("../fixtures/leads.json", import.meta.url));

// Process-wide state, shared by every server instance the factory creates (the HTTP variant
// creates one per request).
let leadsPromise;
const audit = [];

function loadLeads() {
  leadsPromise ??= readFile(FIXTURE, "utf8").then((text) => JSON.parse(text).map((lead) => ({ ...lead })));
  return leadsPromise;
}

// Only what the two verbs need: no name, e-mail or message text.
const publicLead = ({ id, company, status, source, budget, createdAt }) => ({ id, company, status, source, budget, createdAt });

const formatBudget = (budget) => (budget == null ? "бюджет не вказано" : `${budget} USD/міс.`);

const fail = (text) => ({ isError: true, content: [{ type: "text", text }] });

const STATUSES_MD = `# Статуси лідів LeadDesk

Рівно п'ять статусів, ті самі, що \`LEAD_STATUSES\` у застосунку. Інших немає.

| Статус | Що означає для команди | Хто і коли переводить |
|---|---|---|
| \`new\` | Заявка прийшла з форми чи кампанії, ніхто ще не відповідав. | Ставиться автоматично під час створення ліда. Назад у \`new\` не повертаємо. |
| \`contacted\` | Менеджер зв'язався з лідом: дзвінок, лист чи повідомлення, і відповідь зафіксовано. | Менеджер — одразу після першого контакту. |
| \`qualified\` | Підтверджено потребу, бюджет і особу, яка ухвалює рішення; є підстава готувати кошторис. | Менеджер після дзвінка-кваліфікації, коли всі три пункти відомі. |
| \`won\` | Клієнт погодив кошторис і підписав договір або оплатив аванс. | Лише акаунт-менеджер або власник, коли є підписаний договір чи оплата. |
| \`lost\` | Лід відмовився, не відповідає після трьох спроб або не підходить нам. | Менеджер; у причині — чому саме лід втрачено. |

Звичний шлях: \`new\` → \`contacted\` → \`qualified\` → \`won\` або \`lost\`. З будь-якого статусу можна перейти в \`lost\`.

Для агента:

- Статус змінює лише \`leaddesk_set_lead_status\`, і кожну зміну людина спершу підтверджує.
- У \`reason\` пишемо, що сталося (наприклад, «дзвінок 10.10: підтвердили бюджет»), без персональних даних.
- Кожна зміна лишає запис в аудиті \`{ action, leadId, at }\`.
`;

export const factory = () => {
  const server = new McpServer({ name: "leaddesk", version: "0.1.0" });

  server.registerTool(
    "leaddesk_find_leads",
    {
      title: "Знайти ліди за статусом",
      description:
        "Повертає ліди LeadDesk з указаним статусом, найновіші першими: id, компанія, статус, джерело, бюджет і дата створення. Імені, email і тексту заявки не повертає. Застосовуй, щоб побачити, хто в роботі, або знайти id ліда перед зміною статусу. Тільки читає, нічого не змінює.",
      inputSchema: {
        status: z
          .enum([...LEAD_STATUSES, "any"])
          .describe("Який статус шукати: new, contacted, qualified, won або lost; any — ліди з будь-яким статусом"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Скільки лідів повернути, від 1 до 50; без значення — 10"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ status, limit = 10 }) => {
      try {
        const leads = await loadLeads();
        const matched = leads
          .filter((lead) => status === "any" || lead.status === status)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const page = matched.slice(0, limit).map(publicLead);
        const header =
          page.length === 0
            ? `Лідів зі статусом ${status} немає.`
            : `Ліди зі статусом ${status}: показано ${page.length} з ${matched.length}, найновіші першими.`;
        const lines = page.map(
          (l) => `- ${l.id} · ${l.company} · ${l.status} · ${l.source} · ${formatBudget(l.budget)} · ${l.createdAt.slice(0, 10)}`,
        );
        return {
          content: [{ type: "text", text: [header, ...lines].join("\n") }],
          structuredContent: { status, total: matched.length, returned: page.length, leads: page },
        };
      } catch (e) {
        console.error(`leaddesk_find_leads failed: ${e.message}`);
        return fail("Не вдалося прочитати ліди. Спробуй ще раз або повідом людину.");
      }
    },
  );

  server.registerTool(
    "leaddesk_set_lead_status",
    {
      title: "Змінити статус ліда",
      description:
        "ЗМІНЮЄ ДАНІ: переводить один лід LeadDesk у новий статус і записує цю зміну в аудит. Перед викликом покажи людині лід, старий і новий статус і причину та отримай її підтвердження. Статус — лише з переліку; що кожен означає — у ресурсі leaddesk://reference/statuses. Id ліда, якого не знаєш, спершу знайди через leaddesk_find_leads. Невідомий лід або той самий статус — помилка, нічого не змінюється.",
      inputSchema: {
        leadId: z
          .string()
          .regex(LEAD_ID)
          .describe("Ідентифікатор ліда у форматі lead_ і чотири цифри, напр. lead_0002"),
        status: z.enum(LEAD_STATUSES).describe("Новий статус: new, contacted, qualified, won або lost"),
        reason: z
          .string()
          .min(3)
          .max(500)
          .describe("Чому змінюємо статус, 3–500 символів, напр. «дзвінок: підтвердили бюджет». Без персональних даних"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ leadId, status, reason }) => {
      try {
        const leads = await loadLeads();
        const lead = leads.find((l) => l.id === leadId);
        if (!lead) {
          return fail(
            `Ліда ${leadId} немає. Знайди правильний id через leaddesk_find_leads (status: "any") і перепитай людину. Нічого не змінено.`,
          );
        }
        if (lead.status === status) {
          return fail(`Лід ${leadId} уже має статус ${status}. Нічого не змінено.`);
        }
        const from = lead.status;
        lead.status = status;
        const entry = { action: "lead.status_changed", leadId, at: new Date().toISOString(), from, to: status, reason };
        audit.push(entry);
        console.error(`leaddesk: ${entry.action} ${leadId} ${from} -> ${status}`);
        return {
          content: [
            {
              type: "text",
              text: `Статус ${leadId} (${lead.company}) змінено: ${from} → ${status}. Запис аудиту: ${entry.action} о ${entry.at}.`,
            },
          ],
          structuredContent: { lead: publicLead(lead), audit: entry },
        };
      } catch (e) {
        console.error(`leaddesk_set_lead_status failed: ${e.message}`);
        return fail("Не вдалося змінити статус. Нічого не змінено; повідом людину.");
      }
    },
  );

  server.registerResource(
    "leaddesk-statuses",
    "leaddesk://reference/statuses",
    {
      title: "Статуси лідів",
      description: "П'ять статусів ліда LeadDesk, що кожен означає для команди і хто переводить лід між ними",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: STATUSES_MD }] }),
  );

  return server;
};

// Run over stdio only when started directly; src/http.mjs imports the same factory.
const entry = process.argv[1] && (await realpath(process.argv[1]).catch(() => process.argv[1]));
if (entry && entry === (await realpath(fileURLToPath(import.meta.url)))) {
  await serveStdio(factory);
}
