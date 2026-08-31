export function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function wecomReady(): boolean {
  return Boolean(
    env("WECOM_CORP_ID") &&
      env("WECOM_AGENT_ID") &&
      env("WECOM_SECRET") &&
      env("WECOM_TOKEN") &&
      env("WECOM_ENCODING_AES_KEY")
  );
}

export function setupStatus() {
  const names = [
    "WECOM_CORP_ID",
    "WECOM_AGENT_ID",
    "WECOM_SECRET",
    "WECOM_TOKEN",
    "WECOM_ENCODING_AES_KEY",
    "WECOM_VERIFY_FILENAME",
    "WECOM_VERIFY_CONTENT",
    "APP_BASE_URL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "CRON_SECRET",
  ] as const;
  const filled: Record<string, boolean> = {};
  for (const n of names) filled[n] = Boolean(env(n));
  return {
    wecomReady: wecomReady(),
    kvReady: Boolean(env("UPSTASH_REDIS_REST_URL") && env("UPSTASH_REDIS_REST_TOKEN")),
    verifyFileReady: Boolean(env("WECOM_VERIFY_FILENAME") && env("WECOM_VERIFY_CONTENT")),
    filled,
  };
}
