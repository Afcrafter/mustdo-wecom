import { env } from "./env";

let cached: { token: string; expireAt: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.expireAt) return cached.token;
  const corpid = env("WECOM_CORP_ID");
  const secret = env("WECOM_SECRET");
  if (!corpid || !secret) throw new Error("WECOM_CORP_ID / WECOM_SECRET 未配置");
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpid)}&corpsecret=${encodeURIComponent(secret)}`;
  const data = (await fetch(url).then((r) => r.json())) as { access_token?: string; expires_in?: number; errmsg?: string };
  if (!data.access_token) throw new Error(data.errmsg || "gettoken failed");
  cached = { token: data.access_token, expireAt: Date.now() + ((data.expires_in || 7200) - 120) * 1000 };
  return cached.token;
}

export async function useridFromCode(code: string): Promise<string> {
  const token = await accessToken();
  const url = `https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo?access_token=${token}&code=${encodeURIComponent(code)}`;
  const data = (await fetch(url).then((r) => r.json())) as { userid?: string; UserId?: string; errmsg?: string };
  const id = data.userid || data.UserId;
  if (!id) throw new Error(data.errmsg || "oauth failed");
  return id;
}

export async function sendRemind(userid: string, title: string, description: string, jump: string): Promise<void> {
  const token = await accessToken();
  const agentid = Number(env("WECOM_AGENT_ID"));
  const body = {
    touser: userid,
    msgtype: "textcard",
    agentid,
    textcard: {
      title,
      description,
      url: jump,
      btntxt: "打开时间表",
    },
  };
  const data = (await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json())) as { errcode?: number; errmsg?: string };
  if (data.errcode) throw new Error(data.errmsg || `send ${data.errcode}`);
}
