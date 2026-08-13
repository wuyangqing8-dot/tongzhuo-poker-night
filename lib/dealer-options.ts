import type { DealerProfile } from "./poker-types";

export const DEALER_PRESETS: DealerProfile[] = [
  { id: "classmate", name: "同学荷官", image: "/dealers/classmate.png", isCustom: false },
  { id: "lan", name: "阿岚", image: "/dealers/dealer-lan.webp", isCustom: false },
  { id: "chen", name: "陈叔", image: "/dealers/dealer-chen.webp", isCustom: false },
  { id: "qiao", name: "小乔", image: "/dealers/dealer-qiao.webp", isCustom: false },
];

export const DEFAULT_DEALER: DealerProfile = DEALER_PRESETS[0];
