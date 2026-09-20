import { cookies } from "next/headers";
import { env } from "./env";

/** cookie 名：浏览器匿名会话（多用户简单隔离） */
export const SESSION_COOKIE = "mdu_userid";

/** 企微登录态 cookie（保留兼容） */
const WECOM_COOKIE = "wecom_userid";

/** 分配一个新的匿名会话 id（形如 me_xxxxxxxx） */
export function newSessionId(): string {
  return "me_" + crypto.randomUUID().replace(/-/g, "").slice(0, 18);
}

/** 是否是一个匿名会话 id */
export function isAnonymous(id: string): boolean {
  return id.startsWith("me_");
}

export function currentUserId(): string {
  const fromCookie = cookies().get(SESSION_COOKIE)?.value || "";
  const fromWecom = cookies().get(WECOM_COOKIE)?.value || "";
  // 优先匿名会话；否则企微；最后回退
  const id = fromCookie || fromWecom || env("WECOM_DEFAULT_USERID") || "dev";
  return id;
}

export function visibleLabel(userid: string): string {
  if (isAnonymous(userid)) return "访客";
  return userid;
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
