import { cookies } from "next/headers";
import { env } from "./env";

export function currentUserId(): string {
  const fromCookie = cookies().get("wecom_userid")?.value || "";
  if (fromCookie) return fromCookie;
  return env("WECOM_DEFAULT_USERID") || "dev";
}

export function oauthUrl(base: string): string {
  const corp = env("WECOM_CORP_ID");
  const agent = env("WECOM_AGENT_ID");
  const redirect = `${base}/api/wecom/oauth`;
  return (
    "https://open.weixin.qq.com/connect/oauth2/authorize" +
    `?appid=${encodeURIComponent(corp)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&response_type=code&scope=snsapi_base` +
    `&state=mustdo&agentid=${encodeURIComponent(agent)}#wechat_redirect`
  );
}
