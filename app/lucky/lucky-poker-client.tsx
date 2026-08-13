"use client";

/* Vinext uses a normal same-origin anchor to cross from the anonymous local controller to the authenticated table. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { useRef, useState } from "react";
import { effectAllowed, grantableSpinCount, secureRandom, weightedPick } from "../../lib/lucky-wheel";
import type { Achievement, ActiveEffect, HistoryEvent, LuckyGameState, LuckyPlayer, WheelEffect } from "../../lib/lucky-types";
import { AchievementEditor, GameSettingsPanel, WheelEditor } from "./components/ConfigPanels";
import { EffectPanel } from "./components/EffectPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { Modal } from "./components/Modal";
import { PlayerCard } from "./components/PlayerCard";
import { PokerWheel } from "./components/PokerWheel";
import { luckyId, useLuckyGame } from "./use-lucky-game";

type MainView = "game" | "players" | "history" | "settings";
type SettingsView = "game" | "wheel" | "achievements";

const categoryName = { reward: "奖励", penalty: "惩罚", chaos: "混沌", neutral: "中性" };
const timingName = { immediate: "立即执行", current_hand: "当前手", next_hand: "下一手", until_used: "持续到使用", permanent: "永久" };
const playerAvatars = ["🦊", "🐼", "🐯", "🐧", "🐲", "🦁", "🐵", "🐙", "🦄", "🦅"];

function historyItem(state: LuckyGameState, input: Omit<HistoryEvent, "id" | "handNumber" | "at">): HistoryEvent {
  return { id: luckyId("history"), handNumber: state.handNumber, at: Date.now(), ...input };
}

export default function LuckyPokerClient() {
  const { state: storedState, updateState, resetAll } = useLuckyGame();
  const [view, setView] = useState<MainView>("game");
  const [settingsView, setSettingsView] = useState<SettingsView>("game");
  const [toast, setToast] = useState("");
  const [showAchievement, setShowAchievement] = useState(false);
  const [achievementPlayerId, setAchievementPlayerId] = useState("");
  const [achievementId, setAchievementId] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winnerId, setWinnerId] = useState("");
  const [result, setResult] = useState<WheelEffect | null>(null);
  const [resultTargetId, setResultTargetId] = useState("");
  const [resolvingResult, setResolvingResult] = useState(false);
  const [diceFace, setDiceFace] = useState(1);
  const [diceRolling, setDiceRolling] = useState(false);
  const [creditBurstPlayerId, setCreditBurstPlayerId] = useState("");
  const spinTimer = useRef<number | null>(null);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  if (!storedState) return <main className="lucky-loading"><span>♠</span><h1>Lucky Poker</h1><p>正在读取本地牌局…</p></main>;
  const state = storedState;

  const selectedPlayer = state.players.find((player) => player.id === state.selectedPlayerId) ?? state.players[0];
  const eligibleEffects = state.effects.filter((item) => item.enabled && item.weight > 0 && effectAllowed(item, state.settings));
  const enabledAchievements = state.achievements.filter((item) => item.enabled);

  function playTone(kind: "reward" | "penalty" | "tick") {
    if (!state.settings.soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = new AudioContextClass();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = kind === "reward" ? 720 : kind === "penalty" ? 180 : 420;
      gain.gain.setValueAtTime(0.08, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.24);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.24);
    } catch { /* Sound is optional. */ }
  }

  function selectPlayer(playerId: string) {
    updateState((current) => ({ ...current, selectedPlayerId: playerId }));
  }

  function addPlayer() {
    if (state.players.length >= 10) return notify("最多支持 10 名玩家。");
    const index = state.players.length;
    const player: LuckyPlayer = {
      id: luckyId("player"), name: `玩家 ${index + 1}`, avatar: playerAvatars[index % playerAvatars.length], wheelCredits: 0,
      totalSpins: 0, achievementCount: 0, effects: [], createdAt: Date.now(),
    };
    updateState((current) => ({ ...current, players: [...current.players, player], selectedPlayerId: player.id, history: [...current.history, historyItem(current, { playerId: player.id, playerName: player.name, type: "player", title: "新增玩家", detail: `${player.name} 加入娱乐牌局` })] }));
    notify(`${player.name} 已加入。`);
  }

  function renamePlayer(playerId: string, name: string) {
    updateState((current) => ({ ...current, players: current.players.map((player) => player.id === playerId ? { ...player, name } : player) }));
  }

  function deletePlayer(player: LuckyPlayer) {
    if (state.players.length <= 1) return notify("至少保留一名玩家。");
    if (!window.confirm(`确定删除「${player.name}」吗？其 Buff 与统计也会删除。`)) return;
    updateState((current) => {
      const players = current.players.filter((item) => item.id !== player.id);
      return { ...current, players, selectedPlayerId: current.selectedPlayerId === player.id ? players[0].id : current.selectedPlayerId, history: [...current.history, historyItem(current, { playerId: player.id, playerName: player.name, type: "player", title: "删除玩家", detail: `${player.name} 离开娱乐牌局` })] };
    });
  }

  function resetPlayer(player: LuckyPlayer) {
    if (!window.confirm(`重置「${player.name}」的转盘次数、Buff 和统计吗？`)) return;
    updateState((current) => ({ ...current, players: current.players.map((item) => item.id === player.id ? { ...item, wheelCredits: 0, totalSpins: 0, achievementCount: 0, effects: [] } : item), history: [...current.history, historyItem(current, { playerId: player.id, playerName: player.name, type: "player", title: "重置玩家", detail: "转盘次数、效果与统计已清空" })] }));
  }

  function resetSession() {
    if (!window.confirm("一键重置本局？玩家名单和自定义配置会保留。")) return;
    updateState((current) => ({ ...current, handNumber: 1, players: current.players.map((player) => ({ ...player, wheelCredits: 0, totalSpins: 0, achievementCount: 0, effects: [] })), history: [], selectedPlayerId: current.players[0]?.id ?? "" }));
    notify("本局状态已重置。");
  }

  function openAchievementModal() {
    setAchievementPlayerId(selectedPlayer?.id ?? state.players[0]?.id ?? "");
    setAchievementId(enabledAchievements[0]?.id ?? "");
    setShowAchievement(true);
  }

  function triggerAchievement() {
    const player = state.players.find((item) => item.id === achievementPlayerId);
    const achievement = state.achievements.find((item) => item.id === achievementId && item.enabled);
    if (!player || !achievement) return notify("请选择玩家和成就。");
    const granted = grantableSpinCount(player.wheelCredits, achievement.rewardSpins, state.settings.maxStoredSpins);
    if (granted <= 0) return notify("该玩家转盘次数已达到上限。");
    updateState((current) => ({
      ...current,
      players: current.players.map((item) => item.id === player.id ? { ...item, wheelCredits: item.wheelCredits + granted, achievementCount: item.achievementCount + 1 } : item),
      selectedPlayerId: player.id,
      history: [...current.history, historyItem(current, { playerId: player.id, playerName: player.name, type: "achievement", title: `完成成就「${achievement.name}」`, detail: `获得 ${granted} 次转盘${granted < achievement.rewardSpins ? "（受储存上限限制）" : ""}` })],
    }));
    setCreditBurstPlayerId(player.id);
    window.setTimeout(() => setCreditBurstPlayerId(""), 1200);
    setShowAchievement(false);
    notify(`${player.name} 获得 ${granted} 次转盘。`);
  }

  function startSpin() {
    if (!selectedPlayer) return notify("请先添加并选择玩家。");
    if (spinning || result) return;
    if (selectedPlayer.wheelCredits <= 0) return notify("该玩家没有可用的转盘次数。");
    if (!eligibleEffects.length) return notify("当前设置下没有可抽取的转盘效果。");
    const winner = weightedPick(eligibleEffects, secureRandom);
    const index = eligibleEffects.findIndex((item) => item.id === winner.id);
    const segment = 360 / eligibleEffects.length;
    const targetAngle = 360 - (index * segment + segment / 2);
    const normalized = ((rotation % 360) + 360) % 360;
    const delta = (targetAngle - normalized + 360) % 360;
    const nextRotation = rotation + 7 * 360 + delta;
    setSpinning(true);
    setWinnerId("");
    setRotation(nextRotation);
    updateState((current) => ({ ...current, players: current.players.map((item) => item.id === selectedPlayer.id ? { ...item, wheelCredits: item.wheelCredits - 1, totalSpins: item.totalSpins + 1 } : item), history: [...current.history, historyItem(current, { playerId: selectedPlayer.id, playerName: selectedPlayer.name, type: "spin", title: "转动转盘", detail: "消耗 1 次转盘机会" })] }));
    if (spinTimer.current) window.clearTimeout(spinTimer.current);
    spinTimer.current = window.setTimeout(() => {
      setSpinning(false);
      setWinnerId(winner.id);
      setResult(winner);
      setResultTargetId(state.players.find((item) => item.id !== selectedPlayer.id)?.id ?? "");
      playTone(winner.category === "penalty" ? "penalty" : "reward");
    }, 4200);
  }

  function activeRuleCount(current: LuckyGameState, effectiveHand: number) {
    return current.players.flatMap((player) => player.effects).filter((item) => item.status === "active" && item.ruleChanging && item.effectiveHand === effectiveHand).length;
  }

  function addActiveEffect(current: LuckyGameState, owner: LuckyPlayer, effect: WheelEffect, targetId?: string) {
    const target = current.players.find((item) => item.id === targetId);
    const effectiveHand = effect.timing === "next_hand" ? current.handNumber + 1 : current.handNumber;
    const active: ActiveEffect = {
      id: luckyId("active"), sourceEffectId: effect.id, name: effect.name, emoji: effect.emoji, category: effect.category,
      description: effect.description, timing: effect.timing, status: "active", appliedHand: current.handNumber, effectiveHand,
      targetPlayerId: target?.id, targetPlayerName: target?.name, ruleChanging: effect.ruleChanging,
    };
    return { ...current, players: current.players.map((item) => item.id === owner.id ? { ...item, effects: [...item.effects, active] } : item) };
  }

  function finalizeResult(effect: WheelEffect, mode: "apply" | "abandon", diceResult?: number) {
    if (!selectedPlayer || resolvingResult) return;
    if (mode === "abandon") {
      updateState((current) => ({ ...current, history: [...current.history, historyItem(current, { playerId: selectedPlayer.id, playerName: selectedPlayer.name, type: "effect", title: `放弃「${effect.name}」`, detail: "效果未应用" })] }));
      setResult(null); setWinnerId(""); return;
    }
    if (effect.requiresTarget && (!resultTargetId || resultTargetId === selectedPlayer.id)) return notify("请选择另一名目标玩家。");
    const effectiveHand = effect.timing === "next_hand" ? state.handNumber + 1 : state.handNumber;
    if (effect.ruleChanging && activeRuleCount(state, effectiveHand) >= state.settings.maxSpecialRules) return notify("本手特殊规则数量已达到上限。");
    if (!effectAllowed(effect, state.settings)) return notify("当前牌局设置不允许这个效果。");
    setResolvingResult(true);
    updateState((current) => {
      const owner = current.players.find((item) => item.id === selectedPlayer.id);
      if (!owner) return current;
      let next = current;
      let detail = timingName[effect.timing];
      if (effect.id === "spin-again") {
        const granted = grantableSpinCount(owner.wheelCredits, 1, current.settings.maxStoredSpins);
        next = { ...next, players: next.players.map((item) => item.id === owner.id ? { ...item, wheelCredits: item.wheelCredits + granted } : item) };
        detail = granted ? "立即获得 1 次额外转盘" : "转盘次数已达上限，未增加";
      } else if (effect.id === "thanks") {
        detail = "什么都没有发生";
      } else if (effect.id === "destiny-die" && diceResult) {
        if (diceResult <= 2) {
          const penalties = current.effects.filter((item) => item.enabled && item.category === "penalty" && effectAllowed(item, current.settings));
          const penalty = penalties.length ? weightedPick(penalties, secureRandom) : null;
          if (penalty) next = addActiveEffect(next, owner, penalty);
          detail = penalty ? `骰出 ${diceResult}，获得随机惩罚「${penalty.name}」` : `骰出 ${diceResult}，但没有可用惩罚`;
        } else if (diceResult <= 4) {
          detail = `骰出 ${diceResult}，什么都没有发生`;
        } else {
          const granted = grantableSpinCount(owner.wheelCredits, 1, current.settings.maxStoredSpins);
          next = { ...next, players: next.players.map((item) => item.id === owner.id ? { ...item, wheelCredits: item.wheelCredits + granted } : item) };
          detail = granted ? `骰出 ${diceResult}，获得 1 次额外转盘` : `骰出 ${diceResult}，但次数已达上限`;
        }
        next = { ...next, history: [...next.history, historyItem(current, { playerId: owner.id, playerName: owner.name, type: "dice", title: `命运骰子：${diceResult}`, detail })] };
      } else if (effect.timing !== "immediate") {
        next = addActiveEffect(next, owner, effect, resultTargetId);
      }
      return { ...next, history: [...next.history, historyItem(current, { playerId: owner.id, playerName: owner.name, type: "spin", title: `获得「${effect.name}」`, detail: `${detail}${effect.requiresTarget ? ` · 目标：${current.players.find((item) => item.id === resultTargetId)?.name ?? "未指定"}` : ""}` })] };
    });
    window.setTimeout(() => { setResult(null); setWinnerId(""); setResolvingResult(false); setDiceRolling(false); }, 350);
  }

  function applyResult() {
    if (!result || resolvingResult) return;
    if (result.id !== "destiny-die") return finalizeResult(result, "apply");
    setDiceRolling(true);
    let ticks = 0;
    const interval = window.setInterval(() => { setDiceFace(1 + Math.floor(secureRandom() * 6)); ticks += 1; if (ticks >= 18) { window.clearInterval(interval); const final = 1 + Math.floor(secureRandom() * 6); setDiceFace(final); window.setTimeout(() => finalizeResult(result, "apply", final), 500); } }, 90);
  }

  function updateEffectStatus(playerId: string, effect: ActiveEffect, status: "used" | "removed") {
    if (effect.status !== "active") return;
    if (status === "used" && effect.timing === "next_hand" && state.handNumber < effect.effectiveHand) return notify(`该效果将在 Hand #${effect.effectiveHand} 生效。`);
    if (status === "used" && effect.ruleChanging && !window.confirm("请确认该公共牌或特殊规则效果仍在 Showdown 前使用，已经结算的底池不能修改。")) return;
    const player = state.players.find((item) => item.id === playerId);
    if (!player) return;
    updateState((current) => ({ ...current, players: current.players.map((item) => item.id === playerId ? { ...item, effects: item.effects.map((active) => active.id === effect.id && active.status === "active" ? { ...active, status } : active) } : item), history: [...current.history, historyItem(current, { playerId, playerName: player.name, type: "effect", title: `${status === "used" ? "使用" : "移除"}「${effect.name}」`, detail: status === "used" ? effect.description : "手动移除效果" })] }));
    notify(`「${effect.name}」已${status === "used" ? "使用" : "移除"}。`);
  }

  function nextHand() {
    updateState((current) => {
      const nextNumber = current.handNumber + 1;
      let expired = 0;
      const players = current.players.map((player) => ({ ...player, effects: player.effects.map((effect) => {
        const shouldExpire = effect.status === "active" && ((effect.timing === "current_hand" && effect.effectiveHand < nextNumber) || (effect.timing === "next_hand" && effect.effectiveHand < nextNumber));
        if (shouldExpire) expired += 1;
        return shouldExpire ? { ...effect, status: "expired" as const } : effect;
      }) }));
      return { ...current, handNumber: nextNumber, players, history: [...current.history, historyItem(current, { type: "hand", title: `开始 Hand #${nextNumber}`, detail: expired ? `${expired} 个未使用的一次性效果已过期` : "一次性效果生命周期已更新" })] };
    });
    notify(`已开始 Hand #${state.handNumber + 1}。`);
  }

  function updateWheelEffect(id: string, patch: Partial<WheelEffect>) { updateState((current) => ({ ...current, effects: current.effects.map((item) => item.id === id ? { ...item, ...patch } : item) })); }
  function addWheelEffect() { const item: WheelEffect = { id: luckyId("effect"), name: "新效果", emoji: "✨", category: "neutral", description: "填写这个娱乐效果的说明。", weight: 1, enabled: true, timing: "next_hand", requiresTarget: false, ruleChanging: false }; updateState((current) => ({ ...current, effects: [...current.effects, item] })); }
  function deleteWheelEffect(id: string) { if (window.confirm("删除这个转盘效果吗？")) updateState((current) => ({ ...current, effects: current.effects.filter((item) => item.id !== id) })); }
  function updateAchievement(id: string, patch: Partial<Achievement>) { updateState((current) => ({ ...current, achievements: current.achievements.map((item) => item.id === id ? { ...item, ...patch } : item) })); }
  function addAchievement() { const item: Achievement = { id: luckyId("achievement"), name: "新成就", description: "填写线下玩家人工确认的触发条件。", rewardSpins: 1, enabled: true }; updateState((current) => ({ ...current, achievements: [...current.achievements, item] })); }
  function deleteAchievement(id: string) { if (window.confirm("删除这个成就吗？")) updateState((current) => ({ ...current, achievements: current.achievements.filter((item) => item.id !== id) })); }
  function confirmResetAll() { if (window.confirm("第一次确认：这会删除所有 Lucky Poker 本地数据。") && window.confirm("第二次确认：确定无法恢复地重置全部数据吗？")) { resetAll(); setView("game"); notify("所有本地数据已重置。"); } }

  const navItems: Array<[MainView, string, string]> = [["game", "♠", "牌局"], ["players", "♟", "玩家"], ["history", "⌛", "历史"], ["settings", "⚙", "设置"]];

  return (
    <main className="lucky-app">
      <header className="lucky-header"><a className="lucky-brand" href="/lucky"><span>♠</span><div><b>娱乐德州</b><small>LUCKY POKER</small></div></a><div className="hand-display"><small>当前手牌</small><b>HAND #{state.handNumber}</b></div><nav>{navItems.map(([key, icon, label]) => <button className={view === key ? "active" : ""} type="button" onClick={() => setView(key)} key={key}><span>{icon}</span>{label}</button>)}</nav><div className="header-actions"><a href="/">返回线上牌桌</a><button type="button" onClick={resetSession}>重置本局</button></div></header>

      {view === "game" && <div className="lucky-game-grid">
        <section className="lucky-panel players-panel"><div className="lucky-section-title"><span><small>PLAYERS</small><b>当前牌局</b></span><em>{state.players.length}/10</em></div><div className="compact-player-list">{state.players.map((player) => <button className={player.id === state.selectedPlayerId ? "selected" : ""} type="button" onClick={() => selectPlayer(player.id)} key={player.id}><span>{player.avatar}</span><div><b>{player.name}</b><small>{player.effects.filter((item) => item.status === "active").length} 个效果</small></div><em>{player.wheelCredits}<small>次</small>{creditBurstPlayerId === player.id && <i>+1</i>}</em></button>)}</div><button className="panel-secondary-button" type="button" onClick={() => setView("players")}>管理玩家</button></section>

        <section className="wheel-console"><div className="wheel-console-heading"><span><small>WEIGHTED RANDOM</small><h1>命运转盘</h1></span><div className="selected-spinner"><span>{selectedPlayer?.avatar ?? "?"}</span><div><small>当前玩家</small><b>{selectedPlayer?.name ?? "请添加玩家"}</b></div><em>{selectedPlayer?.wheelCredits ?? 0} 次</em></div></div><PokerWheel effects={eligibleEffects} rotation={rotation} spinning={spinning} winnerId={winnerId} /><button className="spin-button" type="button" disabled={spinning || !selectedPlayer || selectedPlayer.wheelCredits <= 0 || !!result} onClick={startSpin}><span>{spinning ? "转盘旋转中…" : "开始转盘"}</span><small>{selectedPlayer?.wheelCredits ? "消耗 1 次机会 · 结果由权重算法预先决定" : "先通过成就获得转盘次数"}</small></button><div className="wheel-legend"><span className="reward">奖励</span><span className="penalty">惩罚</span><span className="chaos">混沌</span><span className="neutral">中性</span></div></section>

        <EffectPanel players={state.players} currentHand={state.handNumber} onUse={(playerId, effect) => updateEffectStatus(playerId, effect, "used")} onRemove={(playerId, effect) => updateEffectStatus(playerId, effect, "removed")} />

        <section className="game-command-bar"><button className="achievement-button" type="button" onClick={openAchievementModal}><span>🏆</span><div><b>触发成就</b><small>人工确认后增加转盘次数</small></div></button><button type="button" onClick={startSpin} disabled={spinning || !selectedPlayer?.wheelCredits}><span>🎡</span><div><b>开始转盘</b><small>{selectedPlayer?.name ?? "未选择玩家"}</small></div></button><button type="button" onClick={nextHand}><span>→</span><div><b>开始下一手</b><small>进入 Hand #{state.handNumber + 1}</small></div></button><button type="button" onClick={() => setView("history")}><span>⌛</span><div><b>历史记录</b><small>{state.history.length} 条操作</small></div></button></section>

        <section className="rule-reminder"><b>重要规则</b><p>已经结算的底池不能重新修改；公共牌类效果必须在 Showdown 前使用；重铸后的第二张 Turn / River 必须接受；开始下一手后，上手未使用的一次性效果会过期。</p></section>
      </div>}

      {view === "players" && <div className="lucky-page"><div className="page-heading"><span><small>4–10 PLAYERS</small><h1>玩家管理</h1><p>点击卡片选择当前获得转盘资格的玩家，名称可直接编辑。</p></span><button type="button" onClick={addPlayer} disabled={state.players.length >= 10}>＋ 新增玩家</button></div><div className="player-management-grid">{state.players.map((player) => <PlayerCard key={player.id} player={player} selected={player.id === state.selectedPlayerId} creditBurst={creditBurstPlayerId === player.id} onSelect={() => selectPlayer(player.id)} onRename={(name) => renamePlayer(player.id, name)} onReset={() => resetPlayer(player)} onDelete={() => deletePlayer(player)} />)}</div><section className="player-stats"><div><small>玩家人数</small><b>{state.players.length}</b></div><div><small>本局转盘</small><b>{state.players.reduce((sum, player) => sum + player.totalSpins, 0)}</b></div><div><small>触发成就</small><b>{state.players.reduce((sum, player) => sum + player.achievementCount, 0)}</b></div><div><small>生效效果</small><b>{state.players.flatMap((player) => player.effects).filter((effect) => effect.status === "active").length}</b></div></section></div>}

      {view === "history" && <div className="lucky-page"><HistoryPanel state={state} onClear={() => { if (window.confirm("清空全部历史记录吗？")) updateState((current) => ({ ...current, history: [] })); }} /></div>}

      {view === "settings" && <div className="lucky-page settings-page"><div className="page-heading"><span><small>LOCAL CONFIGURATION</small><h1>配置中心</h1><p>所有设置只保存在当前浏览器的 localStorage。</p></span></div><div className="settings-tabs"><button className={settingsView === "game" ? "active" : ""} type="button" onClick={() => setSettingsView("game")}>牌局设置</button><button className={settingsView === "wheel" ? "active" : ""} type="button" onClick={() => setSettingsView("wheel")}>转盘配置</button><button className={settingsView === "achievements" ? "active" : ""} type="button" onClick={() => setSettingsView("achievements")}>成就配置</button></div>{settingsView === "game" && <GameSettingsPanel settings={state.settings} onChange={(patch) => updateState((current) => ({ ...current, settings: { ...current.settings, ...patch } }))} onResetAll={confirmResetAll} />}{settingsView === "wheel" && <WheelEditor effects={state.effects} onChange={updateWheelEffect} onAdd={addWheelEffect} onDelete={deleteWheelEffect} />}{settingsView === "achievements" && <AchievementEditor achievements={state.achievements} onChange={updateAchievement} onAdd={addAchievement} onDelete={deleteAchievement} />}</div>}

      <nav className="lucky-mobile-nav">{navItems.map(([key, icon, label]) => <button className={view === key ? "active" : ""} type="button" onClick={() => setView(key)} key={key}><span>{icon}</span>{label}</button>)}</nav>

      {showAchievement && <Modal title="触发成就" kicker="ACHIEVEMENT" onClose={() => setShowAchievement(false)}><div className="achievement-steps"><div><b>1</b><span>选择玩家</span></div><div><b>2</b><span>选择成就</span></div><div><b>3</b><span>确认奖励</span></div></div><label className="lucky-field">获得资格的玩家<select value={achievementPlayerId} onChange={(event) => setAchievementPlayerId(event.target.value)}>{state.players.map((player) => <option value={player.id} key={player.id}>{player.avatar} {player.name} · 当前 {player.wheelCredits} 次</option>)}</select></label><label className="lucky-field">完成的成就<select value={achievementId} onChange={(event) => setAchievementId(event.target.value)}>{enabledAchievements.map((item) => <option value={item.id} key={item.id}>{item.name} · +{item.rewardSpins} 次</option>)}</select></label>{state.achievements.find((item) => item.id === achievementId) && <div className="achievement-preview"><span>🏆</span><div><b>{state.achievements.find((item) => item.id === achievementId)?.name}</b><p>{state.achievements.find((item) => item.id === achievementId)?.description}</p></div><em>+{state.achievements.find((item) => item.id === achievementId)?.rewardSpins}</em></div>}<button className="lucky-primary" type="button" onClick={triggerAchievement}>确认并增加转盘次数</button></Modal>}

      {result && <Modal title={`${result.emoji} ${result.name}`} kicker={`${categoryName[result.category]} · ${timingName[result.timing]}`} onClose={() => !resolvingResult && finalizeResult(result, "abandon")}><div className={`result-card ${result.category}`}><span>{result.emoji}</span><b>命运已选定</b><p>{result.description}</p></div>{result.requiresTarget && <label className="lucky-field">指定目标玩家<select value={resultTargetId} onChange={(event) => setResultTargetId(event.target.value)}><option value="">请选择目标</option>{state.players.filter((item) => item.id !== selectedPlayer?.id).map((player) => <option value={player.id} key={player.id}>{player.avatar} {player.name}</option>)}</select></label>}{result.id === "destiny-die" && <div className={`dice-stage ${diceRolling ? "rolling" : ""}`}><span>{diceFace}</span><small>{diceRolling ? "命运骰子滚动中…" : "应用后开始掷骰"}</small></div>}<div className="result-actions"><button type="button" disabled={resolvingResult || diceRolling} onClick={() => finalizeResult(result, "abandon")}>放弃效果</button><button className="lucky-primary" type="button" disabled={resolvingResult || diceRolling} onClick={applyResult}>{result.id === "destiny-die" ? "掷命运骰子" : "应用效果"}</button></div><small className="result-rule-note">应用即写入本地历史；请勿对已结算底池追溯修改。</small></Modal>}

      {toast && <div className="lucky-toast" role="status">{toast}</div>}
    </main>
  );
}
