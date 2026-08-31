import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { env } from "./env";
import type { Reminder } from "./types";

const KEY = "mustdo:reminders";
const FILE = path.join(process.cwd(), ".data", "reminders.json");

function redis(): Redis | null {
  const url = env("UPSTASH_REDIS_REST_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function readAll(): Promise<Reminder[]> {
  const r = redis();
  if (r) {
    const rows = (await r.get<Reminder[]>(KEY)) || [];
    return Array.isArray(rows) ? rows : [];
  }
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Reminder[];
  } catch {
    return [];
  }
}

async function writeAll(rows: Reminder[]): Promise<void> {
  const r = redis();
  if (r) {
    await r.set(KEY, rows);
    return;
  }
  if (process.env.VERCEL) {
    throw new Error("Vercel 上请配置 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2), "utf8");
}

export async function listByUser(userid: string): Promise<Reminder[]> {
  const rows = await readAll();
  return rows.filter((x) => x.userid === userid).sort((a, b) => a.nextFireAt.localeCompare(b.nextFireAt));
}

export async function listDue(nowIso: string): Promise<Reminder[]> {
  const rows = await readAll();
  return rows.filter((x) => x.enabled && x.nextFireAt <= nowIso);
}

export async function upsert(item: Reminder): Promise<Reminder> {
  const rows = await readAll();
  const i = rows.findIndex((x) => x.id === item.id);
  if (i >= 0) rows[i] = item;
  else rows.push(item);
  await writeAll(rows);
  return item;
}

export async function remove(id: string, userid: string): Promise<boolean> {
  const rows = await readAll();
  const next = rows.filter((x) => !(x.id === id && x.userid === userid));
  if (next.length === rows.length) return false;
  await writeAll(next);
  return true;
}

export async function get(id: string): Promise<Reminder | undefined> {
  return (await readAll()).find((x) => x.id === id);
}
