import "server-only";
import type { ConnectionType } from "@/lib/nodes/types";
import { findRecords } from "../../integrations/airtable";
import { readRows, selectRows } from "../../integrations/google-sheets";
import { createPage, getPage } from "../../integrations/notion";
import { openConnection } from "../../oauth/store";
import { sendTelegram } from "../../oauth/telegram";
import { OAuthError } from "../../oauth/types";
import { asObject, NodeError, ok, type Executor } from "../types";

// Executors for connected services. Each call uses the workflow owner's own connection,
// looked up with an ownership check, so a workflow can never act through anyone else's account.

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();

export async function connection(ownerId: Parameters<typeof openConnection>[0], id: unknown, type: ConnectionType) {
  try {
    return await openConnection(ownerId, id, type);
  } catch (error) {
    if (error instanceof OAuthError) throw new NodeError(error.message);
    throw error;
  }
}

async function token(ownerId: Parameters<typeof openConnection>[0], id: unknown, type: ConnectionType): Promise<string> {
  const { secret } = await connection(ownerId, id, type);
  if (!secret.accessToken) throw new NodeError("This connection has no access. Reconnect it in Connections.");
  return secret.accessToken;
}

export const connectorExecutors: Record<string, Executor> = {
  "sheets.lookup_rows": async ({ config, input, ownerId, signal, log }) => {
    const access = await token(ownerId, config.credentialId, "google_account");
    const grid = await readRows(access, str(config.spreadsheetId), str(config.sheet), signal);
    const rows = selectRows(grid, { approvedColumn: str(config.approvedColumn), paidColumn: str(config.paidColumn), matchColumn: str(config.matchColumn), matchValue: str(config.matchValue) });
    log(`Read ${Math.max(grid.length - 1, 0)} rows, ${rows.length} approved and unpaid${config.matchColumn ? ` for ${str(config.matchValue)}` : ""}.`);
    return ok({ ...asObject(input), rows, rowCount: rows.length });
  },

  "airtable.lookup": async ({ config, input, ownerId, signal }) => {
    const access = await token(ownerId, config.credentialId, "airtable_account");
    const maxRecords = Math.min(20, Math.max(1, Number(config.maxRecords) || 1));
    const records = await findRecords(
      access,
      { baseId: str(config.baseId), table: str(config.table), matchField: str(config.matchField), matchValue: str(config.matchValue), statusField: str(config.statusField), statusValue: str(config.statusValue), maxRecords },
      signal,
    );
    if (!records.length) throw new NodeError(`No ${str(config.table)} record has ${str(config.matchField)} = "${str(config.matchValue).slice(0, 60)}" and ${str(config.statusField)} = "${str(config.statusValue)}". Nothing was sent.`);
    if (records.length > maxRecords) throw new NodeError(`More than ${maxRecords} records matched, so the run stopped rather than guess which to pay.`);
    const rows = records.map((r) => ({ ...r.fields, recordId: r.id }));
    return ok({ ...asObject(input), records, rows, record: rows[0] });
  },

  "notion.get_page": async ({ config, input, ownerId, signal }) => {
    const access = await token(ownerId, config.credentialId, "notion_workspace");
    return ok({ ...asObject(input), policy: await getPage(access, str(config.pageId), signal) });
  },

  "notion.create_page": async ({ config, input, ownerId, signal }) => {
    const access = await token(ownerId, config.credentialId, "notion_workspace");
    const page = await createPage(access, { databaseId: str(config.databaseId), titleProperty: str(config.titleProperty) || "Name", title: str(config.title), summary: str(config.summary) }, signal);
    return ok({ ...asObject(input), notionPage: page });
  },

  "notify.telegram": async ({ config, input, ownerId }) => {
    const { account } = await connection(ownerId, config.credentialId, "telegram_chat");
    try {
      await sendTelegram(account.id, str(config.message));
    } catch (error) {
      throw new NodeError(error instanceof OAuthError ? error.message : "Telegram didn't accept the message.");
    }
    return ok(asObject(input));
  },
};
