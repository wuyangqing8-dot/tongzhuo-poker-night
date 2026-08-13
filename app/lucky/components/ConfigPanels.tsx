"use client";

import { effectProbability } from "../../../lib/lucky-wheel";
import type { Achievement, LuckySettings, WheelEffect } from "../../../lib/lucky-types";

/* The setting label text is generated from a typed tuple and remains visible beside its nested checkbox. */
/* eslint-disable jsx-a11y/label-has-associated-control */
export function GameSettingsPanel({ settings, onChange, onResetAll }: {
  settings: LuckySettings;
  onChange: (patch: Partial<LuckySettings>) => void;
  onResetAll: () => void;
}) {
  const toggleSettings: Array<[keyof Pick<LuckySettings, "allowSwapHole" | "allowPeek" | "allowBoardChange" | "allowButtonMove" | "allowPassCard" | "soundEnabled">, string, string]> = [
    ["allowSwapHole", "换底牌类效果", "换一张、整手重抽"],
    ["allowPeek", "查看底牌类效果", "天眼、偷窥、公开底牌"],
    ["allowBoardChange", "修改公共牌类效果", "Turn / River 重发与双 Board"],
    ["allowButtonMove", "Button 强制转移", "皇帝 Button"],
    ["allowPassCard", "交换底牌", "乾坤大挪移"],
    ["soundEnabled", "音效接口", "旋转结束与结果提示音"],
  ];
  return <section className="config-card"><div className="config-heading"><span>GAME SETTINGS</span><h3>牌局设置</h3></div><div className="settings-grid">
    <label>最大储存转盘次数<select value={settings.maxStoredSpins ?? "unlimited"} onChange={(event) => onChange({ maxStoredSpins: event.target.value === "unlimited" ? null : Number(event.target.value) as 1 | 2 | 3 })}><option value="1">1 次</option><option value="2">2 次</option><option value="3">3 次</option><option value="unlimited">无限</option></select></label>
    <label>每手最大特殊规则<input type="number" min="0" max="10" value={settings.maxSpecialRules} onChange={(event) => onChange({ maxSpecialRules: Math.max(0, Number(event.target.value)) })} /></label>
    <label>双 River 处理<select value={settings.doubleRiverMode} onChange={(event) => onChange({ doubleRiverMode: event.target.value as LuckySettings["doubleRiverMode"] })}><option value="split">两个 Board 平分底池</option><option value="random">随机选择有效 River</option></select></label>
  </div><div className="toggle-settings">{toggleSettings.map(([key, label, hint]) => <label key={key}><span><b>{label}</b><small>{hint}</small></span><input type="checkbox" checked={settings[key]} onChange={(event) => onChange({ [key]: event.target.checked })} /></label>)}</div><div className="danger-zone"><span><b>重置所有数据</b><small>删除玩家、配置、Buff 与全部历史，需要二次确认。</small></span><button type="button" onClick={onResetAll}>重置所有数据</button></div></section>;
}
/* eslint-enable jsx-a11y/label-has-associated-control */

export function WheelEditor({ effects, onChange, onAdd, onDelete }: {
  effects: WheelEffect[];
  onChange: (id: string, patch: Partial<WheelEffect>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return <section className="config-card"><div className="config-heading editor-heading"><span>WEIGHTED WHEEL</span><h3>转盘编辑器</h3><button type="button" onClick={onAdd}>＋ 新增效果</button></div><p className="config-note">概率按“当前权重 ÷ 所有启用项目权重总和”自动计算，不要求总和为 100。</p><div className="wheel-editor-list">{effects.map((item) => <article className={!item.enabled ? "disabled" : ""} key={item.id}><div className="editor-effect-icon">{item.emoji}</div><div className="editor-effect-fields"><div className="editor-row"><input className="emoji-input" value={item.emoji} maxLength={4} onChange={(event) => onChange(item.id, { emoji: event.target.value })} /><input value={item.name} maxLength={24} onChange={(event) => onChange(item.id, { name: event.target.value })} /><select value={item.category} onChange={(event) => onChange(item.id, { category: event.target.value as WheelEffect["category"] })}><option value="reward">奖励</option><option value="penalty">惩罚</option><option value="chaos">混沌</option><option value="neutral">中性</option></select></div><textarea value={item.description} rows={2} onChange={(event) => onChange(item.id, { description: event.target.value })} /><div className="editor-row compact"><label>权重<input type="number" min="0" step="1" value={item.weight} onChange={(event) => onChange(item.id, { weight: Math.max(0, Number(event.target.value)) })} /></label><label>概率<strong>{effectProbability(item, effects).toFixed(1)}%</strong></label><label>生效<select value={item.timing} onChange={(event) => onChange(item.id, { timing: event.target.value as WheelEffect["timing"] })}><option value="immediate">立即</option><option value="current_hand">当前手</option><option value="next_hand">下一手</option><option value="until_used">直到使用</option><option value="permanent">永久</option></select></label><label className="check-label"><input type="checkbox" checked={item.requiresTarget} onChange={(event) => onChange(item.id, { requiresTarget: event.target.checked })} />指定目标</label><label className="check-label"><input type="checkbox" checked={item.ruleChanging} onChange={(event) => onChange(item.id, { ruleChanging: event.target.checked })} />特殊规则</label></div></div><div className="editor-actions"><label><input type="checkbox" checked={item.enabled} onChange={(event) => onChange(item.id, { enabled: event.target.checked })} /><span>{item.enabled ? "已启用" : "已关闭"}</span></label><button type="button" onClick={() => onDelete(item.id)}>删除</button></div></article>)}</div></section>;
}

export function AchievementEditor({ achievements, onChange, onAdd, onDelete }: {
  achievements: Achievement[];
  onChange: (id: string, patch: Partial<Achievement>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return <section className="config-card"><div className="config-heading editor-heading"><span>ACHIEVEMENTS</span><h3>成就配置</h3><button type="button" onClick={onAdd}>＋ 新增成就</button></div><div className="achievement-editor-list">{achievements.map((item) => <article className={!item.enabled ? "disabled" : ""} key={item.id}><input value={item.name} maxLength={30} onChange={(event) => onChange(item.id, { name: event.target.value })} /><textarea rows={2} value={item.description} onChange={(event) => onChange(item.id, { description: event.target.value })} /><label>奖励次数<input type="number" min="0" max="10" value={item.rewardSpins} onChange={(event) => onChange(item.id, { rewardSpins: Math.max(0, Number(event.target.value)) })} /></label><label className="achievement-toggle"><input type="checkbox" checked={item.enabled} onChange={(event) => onChange(item.id, { enabled: event.target.checked })} /><span>{item.enabled ? "启用" : "关闭"}</span></label><button type="button" onClick={() => onDelete(item.id)}>删除</button></article>)}</div></section>;
}
