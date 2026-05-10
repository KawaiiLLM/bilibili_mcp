import { config } from "../core/config.js";
import { credentialManager } from "../core/credential.js";
import { ValidationError } from "../core/errors.js";
import { checkLoginStatus } from "../modules/auth.js";
import { assertAllowedArgs, optionalString, requireString, type ToolRouter } from "./common.js";

const TOOL_NAME = "bilibili_config";
const CONFIG_ACTIONS = ["setup", "status"] as const;
type ConfigAction = (typeof CONFIG_ACTIONS)[number];

export const configToolRouter: ToolRouter = {
  definition: {
    name: TOOL_NAME,
    description: "Bilibili MCP 配置工具。setup 配置 CookieCloud；status 查看当前配置状态。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: CONFIG_ACTIONS },
        endpoint: { type: "string", description: "CookieCloud 服务地址，例如 http://127.0.0.1:8088" },
        uuid: { type: "string", description: "CookieCloud UUID" },
        password: { type: "string", description: "CookieCloud 端到端加密密码" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  async call(args: Record<string, unknown>): Promise<unknown> {
    assertAllowedArgs(TOOL_NAME, args, ["action", "endpoint", "uuid", "password"]);
    const action = requireConfigAction(args);
    if (action === "status") return getConfigStatus();

    const envPath = await credentialManager.configureCookieCloud({
      endpoint: requireString(TOOL_NAME, args, "endpoint"),
      uuid: requireString(TOOL_NAME, args, "uuid"),
      password: requireString(TOOL_NAME, args, "password"),
    });
    return {
      configured: true,
      saved_to: envPath,
      cookie_source: "cookiecloud",
      status: await getConfigStatus(),
    };
  },
};

async function getConfigStatus(): Promise<Record<string, unknown>> {
  const configured = Boolean(config.cookieCloudEndpoint && config.cookieCloudUuid && config.cookieCloudPassword);
  const login = configured ? await checkLoginStatus() : { isLogin: false };
  const status = credentialManager.getStatus();
  return {
    configured,
    cookie_source: "cookiecloud",
    endpoint: optionalString(config.cookieCloudEndpoint) ?? null,
    uuid_present: Boolean(config.cookieCloudUuid),
    password_present: Boolean(config.cookieCloudPassword),
    refresh_interval_minutes: status.refreshIntervalMinutes,
    refreshed_at: status.refreshedAt,
    has_credentials: status.hasCredentials,
    login: {
      checked: configured,
      is_login: login.isLogin,
      mid: login.mid,
      uname: login.uname,
    },
    transport: config.transportMode,
    http: {
      host: config.httpHost,
      port: config.httpPort,
      mcp_path: config.httpMcpPath,
      sse_path: config.httpSsePath,
      messages_path: config.httpMessagesPath,
    },
  };
}

function requireConfigAction(args: Record<string, unknown>): ConfigAction {
  const action = requireString(TOOL_NAME, args, "action");
  if (isConfigAction(action)) return action;
  throw new ValidationError("action 不受支持。", {
    tool: TOOL_NAME,
    action,
    fieldErrors: [{
      field: "action",
      message: "不支持的配置 action。",
      received: action,
      allowed_values: [...CONFIG_ACTIONS],
    }],
  });
}

function isConfigAction(action: string): action is ConfigAction {
  return CONFIG_ACTIONS.some((candidate) => candidate === action);
}
