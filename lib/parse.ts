/**
 * 自然语言 → 提醒板块
 *
 * 两档解析：
 * 1. 硅基流动 SiliconFlow（DeepSeek V4 Flash，OpenAI 兼容接口）—— 配了 SILICONFLOW_API_KEY 时启用
 * 2. 本地规则兜底 —— 没配 key 也能用，识别中文日期/时间/重复间隔
 */
import { env } from "./env";

export type ParsedTask = {
  title: string;
  note: string;
  /** 首次提醒时间（绝对 ISO） */
  remindAt: string;
  /** 0 = 只提醒一次；其它 = 每隔 N 分钟 */
  intervalMinutes: number;
  tag: string;
};

const SILICONFLOW_URL = "https://api.siliconflow.cn/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-V4-Flash";

export function siliconflowConfigured(): boolean {
  return Boolean(env("SILICONFLOW_API_KEY"));
}

export async function parseTasks(text: string, now = new Date()): Promise<{ tasks: ParsedTask[]; llm: boolean }> {
  if (env("SILICONFLOW_API_KEY")) {
    try {
      const tasks = await parseWithLLM(text, now);
      if (tasks.length) return { tasks, llm: true };
    } catch (e) {
      console.warn("[parse] 硅基流动调用失败，回退本地规则:", e);
    }
  }
  return { tasks: parseByRules(text, now), llm: false };
}

/* ────────────────────────── 硅基流动 DeepSeek ────────────────────────── */

function buildPrompt(now: Date): string {
  const tz = tzOffset(now);
  const humanNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  return [
    "你是日程解析器。把用户一句/一段自然语言里所有待办事项，逐条拆成结构化 JSON。",
    "规则：",
    "1. 输出必须是合法 JSON 对象 {\"items\":[{...}]}，不要 markdown 代码块，不要多余文字。",
    `2. 当前时间：${humanNow}（周${weekday}，时区 ${tz}）。所有 firstAt 都要按这个时间算成绝对 ISO 8601 字符串（含时区，如 ${tz}）。`,
    "3. 每条字段：title=简短事项名（去掉时间词）；note=补充信息（链接/地点/金额/找谁等，没有就空字符串）；firstAt=首次提醒绝对时间；intervalMinutes=重复间隔分钟数（只提醒一次=0，每15分钟=15，每小时=60，每天=1440，每周=10080，每30分钟=30……没写重复就 0）；tag 从 工作/学习/生活/健康/财务/其他 六类里选一个最贴切的。",
    "4. 时间理解：没写日期默认今天；写了上午/下午/晚上按 12 小时制处理；只写日期没写时间默认当天 09:00。",
    "5. 如果算出的时间已经过去：没写明确日期的自动顺延到下一个未来时刻（同钟点往后天推）；写了星期几的推到下周同一天。",
    "6. 多个事项拆多条（用 ；。！换行「然后/另外/还有」等分隔），不要合并。",
  ].join("\n");
}

async function callLlm(text: string, system: string): Promise<string> {
  const res = await fetch(SILICONFLOW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("SILICONFLOW_API_KEY")}`,
    },
    body: JSON.stringify({
      model: env("SILICONFLOW_MODEL") || DEFAULT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      temperature: 0,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`siliconflow HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content || "";
}

async function parseWithLLM(text: string, now: Date): Promise<ParsedTask[]> {
  const system = buildPrompt(now);
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const content = await callLlm(text, system);
      const json = extractJson(content);
      if (!json || !Array.isArray(json.items)) throw new Error("模型返回格式不对");

      const tasks: ParsedTask[] = [];
      for (const it of json.items as Record<string, unknown>[]) {
        const title = String(it.title || "").trim();
        if (!title) continue;
        const remindAt = toValidFutureIso(String(it.firstAt || ""), now);
        tasks.push({
          title: title.slice(0, 120),
          note: String(it.note || "").trim().slice(0, 300),
          remindAt,
          intervalMinutes: Math.max(0, Math.floor(Number(it.intervalMinutes) || 0)),
          tag: String(it.tag || "其他"),
        });
      }
      if (tasks.length) return tasks.slice(0, 20);
      throw new Error("模型没拆出有效事项");
    } catch (e) {
      lastErr = e;
      if (attempt === 1) console.warn(`[parse] 硅基流动第 ${attempt} 次失败，重试一次:`, String(e).slice(0, 300));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function extractJson(s: string): { items?: unknown[] } | null {
  const cleaned = s.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as { items?: unknown[] };
  } catch {
    return null;
  }
}

/* ────────────────────────── 本地规则兜底 ────────────────────────── */

const WEEKDAY_CN: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
};

export function parseByRules(text: string, now = new Date()): ParsedTask[] {
  const segments = splitSegments(text);
  const tasks: ParsedTask[] = [];
  for (const seg of segments) {
    const t = parseSegment(seg, now);
    if (t) tasks.push(t);
  }
  return tasks.slice(0, 20);
}

function splitSegments(text: string): string[] {
  const parts = text
    .replace(/[，,、]/g, "，") // 逗号不拆，先归一
    .split(/\n|；|;|。|！|？|\.\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    // 用「然后/接着/另外/还有/对了/以及」再切一刀，连词留给后一段
    const sub = p.split(/(?:然后|接着|另外|还有|对了|以及)/).map((s) => s.trim()).filter(Boolean);
    out.push(...sub);
  }
  return out.filter(Boolean);
}

function parseSegment(seg: string, now: Date): ParsedTask | null {
  let s = seg;

  // 0) 先认星期几（每周一/下周一/周一……），别让「每周」把星期几吃掉
  let weekday = 0; // 1-7，0=未指定
  let weeklyRepeat = false;
  const wd = s.match(/(每)?(下|本)?(?:周|星期|礼拜)([一二三四五六日天])(?!次|个|半|月)/);
  if (wd) {
    weekday = WEEKDAY_CN[wd[3]] || 0;
    weeklyRepeat = Boolean(wd[1]); // 带「每」→ 默认每周重复
    s = s.replace(wd[0], " ");
  }

  // 1) 重复间隔（数字式）
  let interval = weeklyRepeat ? 10080 : 0;
  if (!interval) {
    const intRe = [
      /每\s*(\d+(?:\.\d+)?)\s*分钟/, /每\s*(\d+(?:\.\d+)?)\s*分/,
      /每\s*(\d+(?:\.\d+)?)\s*小时/, /每\s*(\d+(?:\.\d+)?)\s*个?钟头/,
      /每\s*(\d+(?:\.\d+)?)\s*天/, /每\s*(\d+(?:\.\d+)?)\s*个?礼拜/,
      /每\s*(\d+(?:\.\d+)?)\s*个?周/, /每\s*(\d+(?:\.\d+)?)\s*个?星期/, /每\s*(\d+(?:\.\d+)?)\s*个?月/,
    ];
    for (const re of intRe) {
      const m = s.match(re);
      if (m) {
        const n = parseFloat(m[1]);
        if (/小时|钟头/.test(re.source)) interval = Math.round(n * 60);
        else if (/天/.test(re.source)) interval = Math.round(n * 1440);
        else if (/礼拜|周|星期/.test(re.source)) interval = Math.round(n * 10080);
        else if (/月/.test(re.source)) interval = Math.round(n * 43200);
        else interval = Math.round(n);
        s = s.replace(re, " ");
        break;
      }
    }
  }
  if (!interval) {
    if (/每小时/.test(s)) { interval = 60; s = s.replace(/每小时/g, " "); }
    else if (/每天/.test(s)) { interval = 1440; s = s.replace(/每天/g, " "); }
    else if (/每周/.test(s)) { interval = 10080; s = s.replace(/每周/g, " "); }
    else if (/每月/.test(s)) { interval = 43200; s = s.replace(/每月/g, " "); }
    else s = s.replace(/(?:只)?(?:提醒|催|叫)(?:我|你)?一次/g, " ");
  }

  // 2) 备注（括号 / 备注：）→ note
  let note = "";
  const paren = s.match(/[（(]([^）)]*)[）)]/);
  if (paren) { note = paren[1].trim(); s = s.replace(paren[0], " "); }
  const bz = s.match(/备注[:：]\s*(.+)$/);
  if (bz) { note = (note ? note + " " : "") + bz[1].trim(); s = s.replace(bz[0], " "); }

  // 3) 日期
  let dayOffset = 0; // 相对天数
  let m = s.match(/(大后天|后天|明天|今天|昨晚|今早|明早)/);
  if (m) {
    const kw = m[1];
    dayOffset = kw === "大后天" ? 3 : kw === "后天" ? 2 : kw === "明天" || kw === "明早" ? 1 : 0;
    s = s.replace(m[0], " ");
  } else if ((m = s.match(/(\d{1,2})[月\/-](\d{1,2})[日号]?/))) {
    const base = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (base.getTime() >= startOfDay(now).getTime()) dayOffset = Math.round((base.getTime() - startOfDay(now).getTime()) / 86400000);
    s = s.replace(m[0], " ");
  }

  // 4) 时间（含只有「上午/下午」没写数字的）
  let hour = -1, minute = 0;
  let meridiem = 0; // 0 未定 1 am 2 pm
  if (/凌晨|清晨/.test(s)) meridiem = 1;
  else if (/早上|上午|早晨/.test(s)) meridiem = 1;
  else if (/中午/.test(s)) meridiem = 0;
  else if (/下午|傍晚|晚上|夜里|夜间|今晚/.test(s)) meridiem = 2;
  m = s.match(/(\d{1,2})[:：](\d{1,2})/);
  if (m) {
    hour = Number(m[1]); minute = Number(m[2]);
    s = s.replace(m[0], " ");
  } else if ((m = s.match(/(\d{1,2})\s*点\s*(?:(\d{1,2})\s*分|一刻|三刻|半)?/))) {
    hour = Number(m[1]);
    minute = m[2] ? Number(m[2]) : /半/.test(m[0]) ? 30 : /一刻/.test(m[0]) ? 15 : /三刻/.test(m[0]) ? 45 : 0;
    s = s.replace(m[0], " ");
  }
  if (hour >= 0 && hour <= 24 && minute >= 0 && minute <= 59) {
    if (meridiem === 2 && hour < 12) hour += 12;
    else if (meridiem === 1 && hour === 12) hour = 0;
  } else {
    hour = -1;
  }
  // 只有时段词没写数字：按时段给默认钟点
  if (hour < 0 && meridiem !== 0) {
    hour = meridiem === 2 ? 15 : meridiem === 1 ? 9 : 12;
  }
  const hadTime = hour >= 0;

  // 5) 收尾：剥掉时间/语气残留，得到干净标题
  s = s.replace(/(?:凌晨|清晨|早上|上午|早晨|中午|下午|傍晚|晚上|夜里|夜间|今晚|今早|明早|白天|每)/g, " ");
  s = s.replace(/(?:记得|帮我|提醒我|提醒你|请提醒|到时候|务必|一定要|需要提醒)/g, " ");
  s = s.replace(/(?:催|提醒)(?:我|你)?(?:一次|一下|一遍|几遍)?$/g, " ");
  s = s.replace(/[，,、。；;！？\s]+/g, " ").trim();
  for (let i = 0; i < 3; i++) {
    const t = s.replace(/^(?:记得|帮我|提醒我|请提醒|到时候|务必|一定要|需要提醒)/, " ").trim();
    if (t === s) break;
    s = t;
  }
  const title = (s || (note ? "待办事项" : "") || "提醒事项").slice(0, 120);
  if (!title && !note) return null;

  // 6) 计算首次时间
  const first = startOfDay(now);
  first.setDate(first.getDate() + dayOffset);
  if (weekday) {
    let diff = weekday - isoWeekday(first);
    if (diff < 0) diff += 7;
    first.setDate(first.getDate() + diff);
  }
  if (hadTime) {
    first.setHours(hour, minute, 0, 0);
    if (first.getTime() <= now.getTime()) {
      if (interval > 0) {
        // 已到点/已过 → 顺着间隔推到下一个未来时刻
        while (first.getTime() <= now.getTime()) first.setTime(first.getTime() + interval * 60000);
      } else if (weekday) {
        first.setDate(first.getDate() + 7);
      } else {
        do { first.setDate(first.getDate() + 1); } while (first.getTime() <= now.getTime());
      }
    }
  } else if (dayOffset || weekday) {
    // 只写了日期没写时间 → 默认当天 09:00
    first.setHours(9, 0, 0, 0);
  } else {
    // 完全没写时间 → 一次性：1 小时后；重复的：一个间隔后
    const ahead = interval > 0 ? interval : 60;
    return {
      title,
      note,
      remindAt: new Date(now.getTime() + ahead * 60000).toISOString(),
      intervalMinutes: interval,
      tag: guessTag(title + " " + note),
    };
  }

  return {
    title,
    note,
    remindAt: first.toISOString(),
    intervalMinutes: interval,
    tag: guessTag(title + " " + note),
  };
}

function guessTag(s: string): string {
  if (/学习|课程|作业|论文|考试|复习|上课|读书|背|交作业|打卡学习/.test(s)) return "学习";
  if (/开会|会议|周会|汇报|工作|邮件|加班|项目|报告|客户|面试|代码|上线/.test(s)) return "工作";
  if (/房租|账单|付款|报销|银行|工资|税|信用卡|还款|续费|缴费|交费|买|转账|充/.test(s)) return "财务";
  if (/药|健身|运动|喝水|睡觉|体检|牙|复诊|跑[步圈]?|瑜伽|拉伸/.test(s)) return "健康";
  if (/快递|取|寄|买菜|做饭|家务|洗衣|充电|丢垃圾|拿|收拾/.test(s)) return "生活";
  return "其他";
}

/* ────────────────────────── 工具 ────────────────────────── */

function toValidFutureIso(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return defaultTime(now);
  if (d.getTime() <= now.getTime() - 60_000) {
    // 时间已过/接近：顺延到最近未来（LLM 已经处理过，这里是最后一道保险）
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

function defaultTime(now: Date): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function tzOffset(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}
