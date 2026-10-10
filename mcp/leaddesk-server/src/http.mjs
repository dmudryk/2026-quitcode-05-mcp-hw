// LeadDesk MCP over Streamable HTTP — bonus E1. Same factory as the stdio server.
//
//   node src/http.mjs        listens on http://127.0.0.1:3333/mcp (only loopback)
//
// The Host and Origin guards are called by hand in the request handler: passing them to
// toNodeHandler as an option is silently ignored, and the server would answer 200 to a forged Host.
import { createServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler, localhostHostValidation, localhostOriginValidation } from "@modelcontextprotocol/node";
import { factory } from "./server.mjs";

const PORT = 3333;
const HOST = "127.0.0.1";

const mcp = toNodeHandler(createMcpHandler(factory));
const checkHost = localhostHostValidation();
const checkOrigin = localhostOriginValidation();

createServer(async (req, res) => {
  if (!checkHost(req, res)) return; // the guard already answered 403
  if (!checkOrigin(req, res)) return;
  await mcp(req, res);
}).listen(PORT, HOST, () => {
  console.error(`leaddesk MCP over HTTP: http://${HOST}:${PORT}/mcp`);
});
