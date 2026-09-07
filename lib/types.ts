export type Reminder = {
  id: string;
  userid: string;
  title: string;
  note: string;
  /** 首次提醒时间 ISO */
  remindAt: string;
  /** 0 = 只提醒一次；其它 = 之后每隔 N 分钟再催 */
  intervalMinutes: number;
  /** 下一次开火时间 */
  nextFireAt: string;
  enabled: boolean;
  lastFiredAt: string | null;
  /** 板块分类（AI 识别，可选）：工作/学习/生活/健康/财务/其他 */
  tag?: string;
  /** 写入时间 ISO（老数据可能没有，用于“按添加顺序”排序） */
  createdAt?: string;
};

export const INTERVALS: { label: string; minutes: number }[] = [
  { label: "只提醒一次", minutes: 0 },
  { label: "每 15 分钟", minutes: 15 },
  { label: "每 30 分钟", minutes: 30 },
  { label: "每小时", minutes: 60 },
  { label: "每 3 小时", minutes: 180 },
  { label: "每天", minutes: 1440 },
  { label: "每 3 天", minutes: 4320 },
  { label: "每周", minutes: 10080 },
];
