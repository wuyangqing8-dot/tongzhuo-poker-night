"use client";

import { ChangeEvent, CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AuthenticatedUser,
  CardCode,
  PartyEffectEvent,
  PartyRuntimeEffect,
  PartySpin,
  PartyTriggerId,
  PlayerAction,
  PublicGameView,
  PublicPlayer,
  Suit,
} from "../lib/poker-types";
import { potFractionRaiseTarget } from "../lib/bet-sizing";
import { DEALER_PRESETS } from "../lib/dealer-options";
import { getStrategyAdvice } from "../lib/strategy-advisor";
import { DEFAULT_PARTY_TRIGGERS, ONLINE_PARTY_EFFECTS, ONLINE_PARTY_TRIGGERS, partyEffect } from "../lib/online-party";
import OnlinePartyWheel from "./online-party-wheel";
import PartyEffectOverlay from "./party-effect-overlay";
import PokerRulesModal from "./poker-rules-modal";

type ClientProps = {
  user: AuthenticatedUser;
  initialRoomCode?: string;
};

const suitGlyph: Record<Suit, "♠" | "♥" | "♦" | "♣"> = {
  S: "♠", H: "♥", D: "♦", C: "♣",
};

const phaseName = {
  waiting: "等待开局",
  preflop: "翻牌前",
  flop: "翻牌圈",
  turn: "转牌圈",
  river: "河牌圈",
  showdown: "摊牌",
};

const seatColors = ["#ef7658", "#8ca98d", "#d2a7aa", "#809bb1", "#b99c72", "#d89066"];
const relativeSeats = ["", "seat-bottom-right", "seat-right", "seat-top-right", "seat-top-left", "seat-left"];
type AmountUnit = "chips" | "bb";

const strategyActions = [
  { key: "fold", label: "弃牌" },
  { key: "check", label: "过牌" },
  { key: "call", label: "跟注" },
  { key: "raise", label: "加注" },
] as const;

function formatAmount(amount: number, bigBlind: number, unit: AmountUnit) {
  if (unit === "chips") return Math.round(amount).toLocaleString();
  const blinds = amount / Math.max(1, bigBlind);
  const precision = Number.isInteger(blinds) ? 0 : Math.abs(blinds) >= 10 ? 1 : 2;
  return `${blinds.toFixed(precision).replace(/\.?0+$/, "")} BB`;
}

type DealBurst = {
  id: string;
  kind: "hole" | "board";
  count: number;
  startIndex: number;
};

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "牌";
  return [...trimmed].slice(0, 2).join("").toUpperCase();
}

function Card({ code, small = false, hidden = false, delay = 0 }: { code?: CardCode; small?: boolean; hidden?: boolean; delay?: number }) {
  if (hidden || !code) {
    return (
      <div className={`playing-card card-hidden ${small ? "card-small" : ""}`} style={{ animationDelay: `${delay}ms` }} aria-label="背面牌">
        <span className="card-back-mark">同</span>
      </div>
    );
  }
  const rank = code.slice(0, -1) === "T" ? "10" : code.slice(0, -1);
  const suit = suitGlyph[code.slice(-1) as Suit];
  const red = suit === "♥" || suit === "♦";
  return (
    <div className={`playing-card ${small ? "card-small" : ""}`} style={{ animationDelay: `${delay}ms` }} aria-label={`${rank}${suit}`}>
      <span className={red ? "card-red" : ""}>{rank}</span>
      <span className={`card-suit ${red ? "card-red" : ""}`}>{suit}</span>
    </div>
  );
}

function PlayerSeat({ player, position, dealer, active, phase, amountUnit, bigBlind }: {
  player?: PublicPlayer;
  position: string;
  dealer?: boolean;
  active?: boolean;
  phase: PublicGameView["phase"];
  amountUnit: AmountUnit;
  bigBlind: number;
}) {
  if (!player) {
    return (
      <div className={`player-seat empty-seat ${position}`}>
        <span className="empty-avatar">＋</span>
        <span>空座位</span>
      </div>
    );
  }
  const showBacks = phase !== "waiting" && player.lastAction !== "下手牌加入" && player.hole === null;
  return (
    <div className={`player-seat ${position} ${active ? "active-seat" : ""} ${player.folded ? "folded-seat" : ""}`}>
      {player.tablePosition && <span className="seat-position-badge" title={positionName(player.tablePosition)}>{player.tablePosition}</span>}
      {(showBacks || player.hole?.length) && (
        <div className="opponent-cards" aria-label={`${player.name}的手牌`}>
          {player.hole?.length
            ? <>{player.hole.map((card, index) => <Card key={`${card}-${index}`} code={card} small delay={index * 60} />)}{Array.from({ length: Math.max(0, 2 - player.hole.length) }, (_, index) => <Card key={`party-hidden-${index}`} small hidden delay={(player.hole?.length ?? 0) * 60} />)}</>
            : <><Card small hidden /><Card small hidden delay={60} /></>}
        </div>
      )}
      <div className="avatar-wrap">
        <span className="avatar" style={{ background: seatColors[player.seat % seatColors.length] }}>{initials(player.name)}</span>
        {dealer && <span className="dealer-chip">D</span>}
      </div>
      <span className="player-name">{player.name}{player.isBot ? " · BOT" : ""}</span>
      <span className="player-chips">{formatAmount(player.chips, bigBlind, amountUnit)}{amountUnit === "chips" ? " 筹码" : ""}</span>
      <span className={`connection-dot ${player.isOnline ? "online" : ""}`} title={player.isOnline ? "在线" : "暂时离线"} />
      {player.lastAction && <span className="player-status">{player.lastAction}</span>}
    </div>
  );
}

function positionName(position: NonNullable<PublicPlayer["tablePosition"]>) {
  const names: Record<NonNullable<PublicPlayer["tablePosition"]>, string> = {
    "BTN / SB": "庄家兼小盲位",
    BTN: "庄家位",
    SB: "小盲位",
    BB: "大盲位",
    UTG: "枪口位",
    "UTG+1": "枪口位后一位",
    "UTG+2": "枪口位后二位",
    MP: "中间位",
    LJ: "Lojack 位",
    HJ: "Hijack 位",
    CO: "关煞位",
  };
  return names[position];
}

function DealAnimation({ burst, positions }: { burst: DealBurst | null; positions: string[] }) {
  if (!burst) return null;
  if (burst.kind === "board") {
    return (
      <div className="deal-animation-layer" aria-hidden="true">
        {Array.from({ length: burst.count }, (_, index) => {
          const boardIndex = Math.min(4, burst.startIndex + index);
          return <i key={`${burst.id}-${index}`} className={`flying-card deal-to-board-${boardIndex}`} style={{ "--deal-delay": `${index * 115}ms` } as CSSProperties}><span>同桌</span></i>;
        })}
      </div>
    );
  }

  const targets = [...positions, "hero"];
  return (
    <div className="deal-animation-layer" aria-hidden="true">
      {targets.flatMap((target, targetIndex) => Array.from({ length: 2 }, (_, cardIndex) => {
        const dealIndex = targetIndex * 2 + cardIndex;
        return <i key={`${burst.id}-${target}-${cardIndex}`} className={`flying-card deal-to-${target}`} style={{ "--deal-delay": `${dealIndex * 78}ms`, "--deal-tilt": `${cardIndex ? 7 : -7}deg` } as CSSProperties}><span>同桌</span></i>;
      }))}
    </div>
  );
}

async function prepareDealerPhoto(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("请选择一张照片");
  if (file.size > 8 * 1024 * 1024) throw new Error("原始照片不能超过 8MB");
  const source = URL.createObjectURL(file);
  try {
    const image = document.createElement("img");
    image.src = source;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("无法读取这张照片"));
    });
    const size = 480;
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const sourceWidth = size / scale;
    const sourceHeight = size / scale;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理这张照片");
    context.drawImage(
      image,
      (image.naturalWidth - sourceWidth) / 2,
      (image.naturalHeight - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      size,
      size,
    );
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function apiRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json() as { error?: string; game?: PublicGameView; needsRoom?: boolean; needsJoin?: boolean; left?: boolean };
  if (response.status === 401) {
    window.location.href = `/login?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new Error("需要登录");
  }
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

export default function PokerClient({ user, initialRoomCode }: ClientProps) {
  const [game, setGame] = useState<PublicGameView | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [view, setView] = useState<"table" | "lobby">("table");
  const [lobbyMode, setLobbyMode] = useState<"create" | "join">(initialRoomCode ? "join" : "create");
  const [roomMode, setRoomMode] = useState<"classic" | "party">("classic");
  const [partyTriggerDraft, setPartyTriggerDraft] = useState<PartyTriggerId[]>([...DEFAULT_PARTY_TRIGGERS]);
  const [joinCode, setJoinCode] = useState(initialRoomCode ?? "");
  const [showRules, setShowRules] = useState(false);
  const [showRebuy, setShowRebuy] = useState(false);
  const [showDealerSettings, setShowDealerSettings] = useState(false);
  const [showPartySettings, setShowPartySettings] = useState(false);
  const [customDealerPreview, setCustomDealerPreview] = useState("");
  const [dealerPhotoBusy, setDealerPhotoBusy] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [message, setMessage] = useState("");
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [potPercent, setPotPercent] = useState(50);
  const [amountUnit, setAmountUnit] = useState<AmountUnit>("chips");
  const [showGto, setShowGto] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [dealBurst, setDealBurst] = useState<DealBurst | null>(null);
  const [partyWheelOpen, setPartyWheelOpen] = useState(false);
  const [partyWheelSpinning, setPartyWheelSpinning] = useState(false);
  const [partyWheelRotation, setPartyWheelRotation] = useState(0);
  const [partyWheelResult, setPartyWheelResult] = useState<PartySpin | null>(null);
  const [partyTableEvent, setPartyTableEvent] = useState<PartyEffectEvent | null>(null);
  const polling = useRef(false);
  const previousDealState = useRef<{ handNumber: number; boardCount: number } | null>(null);
  const previousPartyEventId = useRef<string | null>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("pn-side-w") : null;
    if (saved && layoutRef.current) layoutRef.current.style.setProperty("--side-w", `${saved}px`);
  }, []);

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const layout = layoutRef.current;
    if (!layout) return;
    const handle = event.currentTarget;
    handle.classList.add("dragging");
    resizing.current = true;
    const onMove = (moveEvent: PointerEvent) => {
      if (!resizing.current || !layout) return;
      const rect = layout.getBoundingClientRect();
      const next = Math.max(240, Math.min(560, rect.right - moveEvent.clientX));
      layout.style.setProperty("--side-w", `${next}px`);
    };
    const onUp = () => {
      resizing.current = false;
      handle.classList.remove("dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const current = layout.style.getPropertyValue("--side-w");
      if (current) localStorage.setItem("pn-side-w", current.replace("px", ""));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const notify = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  const loadGame = useCallback(async (quiet = false) => {
    if (polling.current) return;
    polling.current = true;
    try {
      const code = game?.room.code ?? initialRoomCode;
      const data = await apiRequest(`/api/game${code ? `?code=${encodeURIComponent(code)}` : ""}`);
      if (data.game) {
        setGame(data.game);
        setView("table");
        setError("");
      } else if (data.needsJoin) {
        setJoinCode(code ?? "");
        setLobbyMode("join");
        setView("lobby");
      } else if (data.needsRoom) {
        setView("lobby");
      }
    } catch (loadError) {
      if (!quiet) setError(loadError instanceof Error ? loadError.message : "同步失败");
    } finally {
      polling.current = false;
      setLoading(false);
    }
  }, [game?.room.code, initialRoomCode]);

  useEffect(() => { if (view === "table") void loadGame(); }, [loadGame, view]);

  useEffect(() => {
    const sync = window.setInterval(() => {
      if (document.visibilityState === "visible" && game && view === "table") void loadGame(true);
    }, 1_200);
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => { window.clearInterval(sync); window.clearInterval(clock); };
  }, [game, loadGame, view]);

  useEffect(() => {
    if (game?.validActions.canRaise) {
      setRaiseAmount((current) => current >= game.validActions.minRaiseTo && current <= game.validActions.maxRaiseTo
        ? current
        : game.validActions.minRaiseTo);
    }
  }, [game?.version, game?.validActions.canRaise, game?.validActions.minRaiseTo]);

  useEffect(() => {
    const savedUnit = window.localStorage.getItem("tongzhuo-amount-unit");
    const savedGto = window.localStorage.getItem("tongzhuo-gto-advisor");
    if (savedUnit === "bb") setAmountUnit("bb");
    if (savedGto === "on") setShowGto(true);
  }, []);

  useEffect(() => {
    if (!game) return;
    const previous = previousDealState.current;
    const current = { handNumber: game.handNumber, boardCount: game.board.length };
    previousDealState.current = current;
    let burst: DealBurst | null = null;
    if ((!previous || previous.handNumber !== current.handNumber) && game.handNumber > 0 && !["waiting", "showdown"].includes(game.phase)) {
      burst = { id: `hand-${game.handNumber}-${Date.now()}`, kind: "hole", count: 2, startIndex: 0 };
    } else if (previous && previous.handNumber === current.handNumber && current.boardCount > previous.boardCount) {
      burst = { id: `board-${game.handNumber}-${current.boardCount}-${Date.now()}`, kind: "board", count: current.boardCount - previous.boardCount, startIndex: previous.boardCount };
    }
    if (!burst) return;
    setDealBurst(burst);
    const finish = window.setTimeout(() => setDealBurst(null), 1_450);
    return () => window.clearTimeout(finish);
  }, [game?.handNumber, game?.board.length]);

  const latestPartyEvent = game?.party?.effectEvents.at(-1);
  useEffect(() => {
    if (!latestPartyEvent || latestPartyEvent.id === previousPartyEventId.current) return;
    previousPartyEventId.current = latestPartyEvent.id;
    if (Date.now() - latestPartyEvent.at > 12_000) return;
    setPartyTableEvent(latestPartyEvent);
    const hide = window.setTimeout(() => setPartyTableEvent(null), latestPartyEvent.kind === "executed" ? 4_800 : 3_800);
    return () => window.clearTimeout(hide);
  }, [latestPartyEvent?.id]);

  async function createOrJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const body = lobbyMode === "join"
        ? { mode: "join", code: String(form.get("code") || joinCode) }
        : {
            mode: "create",
            name: String(form.get("name") || "同学牌局"),
            maxPlayers: Number(form.get("maxPlayers")),
            startingChips: Number(form.get("startingChips")),
            bigBlind: Number(form.get("bigBlind")),
            bots: Number(form.get("bots")),
            gameMode: roomMode,
            partyTriggers: roomMode === "party" ? partyTriggerDraft : [],
          };
      const data = await apiRequest("/api/rooms", { method: "POST", body: JSON.stringify(body) });
      if (data.game) {
        setGame(data.game);
        setView("table");
        window.history.replaceState({}, "", `/table?room=${encodeURIComponent(data.game.room.code)}`);
        notify(lobbyMode === "join" ? "已加入牌桌" : "房间已创建，服务器已完成随机发牌");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败");
    } finally { setPending(false); }
  }

  async function sendAction(action: PlayerAction, amount?: number) {
    if (!game || pending) return;
    setPending(true);
    setError("");
    try {
      const data = await apiRequest("/api/game", {
        method: "POST",
        body: JSON.stringify({ code: game.room.code, type: "action", action, amount }),
      });
      if (data.game) setGame(data.game);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "操作失败");
      void loadGame(true);
    } finally { setPending(false); }
  }

  async function startNextHand() {
    if (!game || pending) return;
    setPending(true);
    try {
      const data = await apiRequest("/api/game", { method: "POST", body: JSON.stringify({ code: game.room.code, type: "start" }) });
      if (data.game) setGame(data.game);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "无法开始"); }
    finally { setPending(false); }
  }

  async function toggleTablePause() {
    if (!game || pending || game.room.ownerId !== user.id) return;
    setPending(true);
    setError("");
    try {
      const data = await apiRequest("/api/game", {
        method: "POST",
        body: JSON.stringify({ code: game.room.code, type: "table_pause", paused: !game.paused }),
      });
      if (data.game) setGame(data.game);
      notify(game.paused ? "牌局已恢复，倒计时继续" : "牌局已暂停，发牌与计时已冻结");
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "无法修改暂停状态");
    } finally {
      setPending(false);
    }
  }

  function togglePartyTrigger(triggerId: PartyTriggerId) {
    setPartyTriggerDraft((current) => current.includes(triggerId)
      ? current.filter((item) => item !== triggerId)
      : [...current, triggerId]);
  }

  function openPartySettings() {
    if (!game?.party) return;
    setPartyTriggerDraft([...game.party.enabledTriggers]);
    setShowPartySettings(true);
  }

  async function savePartySettings() {
    if (!game || !partyTriggerDraft.length || pending) return;
    setPending(true);
    setError("");
    try {
      const data = await apiRequest("/api/game", {
        method: "POST",
        body: JSON.stringify({ code: game.room.code, type: "party_config", triggers: partyTriggerDraft }),
      });
      if (data.game) setGame(data.game);
      setShowPartySettings(false);
      notify("娱乐触发条件已更新");
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "无法更新娱乐规则");
    } finally {
      setPending(false);
    }
  }

  async function spinOnlinePartyWheel(targetId: string) {
    if (!game || pending || partyWheelSpinning) return;
    setPending(true);
    setPartyWheelOpen(true);
    setPartyWheelResult(null);
    setPartyWheelSpinning(true);
    try {
      const data = await apiRequest("/api/game", {
        method: "POST",
        body: JSON.stringify({ code: game.room.code, type: "party_spin", targetId }),
      });
      if (!data.game?.party?.lastSpin) throw new Error("服务器没有返回转盘结果");
      const spin = data.game.party.lastSpin;
      const segment = 360 / ONLINE_PARTY_EFFECTS.length;
      const targetAngle = 360 - (spin.effectIndex * segment + segment / 2);
      setPartyWheelRotation((current) => current + 6 * 360 + ((targetAngle - (current % 360) + 360) % 360));
      setGame(data.game);
      window.setTimeout(() => {
        setPartyWheelResult(spin);
        setPartyWheelSpinning(false);
      }, 3900);
    } catch (spinError) {
      setPartyWheelOpen(false);
      setPartyWheelSpinning(false);
      setError(spinError instanceof Error ? spinError.message : "无法转动娱乐转盘");
    } finally {
      setPending(false);
    }
  }

  function canUsePartyEffect(effect: PartyRuntimeEffect, player: PublicPlayer) {
    if (!game || effect.status !== "pending") return false;
    const definition = partyEffect(effect.effectId);
    const mayControl = player.id === game.viewerId || (player.isBot && game.room.ownerId === user.id);
    if (!mayControl || definition?.control !== "manual") return false;
    if (definition.useWindow === "before_hand") return ["waiting", "showdown"].includes(game.phase) && effect.appliesHand === game.handNumber + 1;
    if (effect.appliesHand !== game.handNumber || player.folded) return false;
    if (definition.useWindow === "preflop") return game.phase === "preflop";
    if (definition.useWindow === "before_turn") return game.phase === "preflop" || game.phase === "flop";
    if (definition.useWindow === "before_river") return game.phase === "preflop" || game.phase === "flop" || game.phase === "turn";
    return false;
  }

  async function usePartyEffect(effectInstanceId: string) {
    if (!game || pending) return;
    setPending(true);
    setError("");
    try {
      const data = await apiRequest("/api/game", {
        method: "POST",
        body: JSON.stringify({ code: game.room.code, type: "party_use", effectInstanceId }),
      });
      if (data.game) setGame(data.game);
      notify("娱乐效果已交给服务器执行");
    } catch (effectError) {
      setError(effectError instanceof Error ? effectError.message : "无法使用这个效果");
      void loadGame(true);
    } finally {
      setPending(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!game || !message.trim()) return;
    const text = message.trim();
    setMessage("");
    try {
      const data = await apiRequest("/api/game", { method: "POST", body: JSON.stringify({ code: game.room.code, type: "chat", message: text }) });
      if (data.game) setGame(data.game);
    } catch (chatError) { setError(chatError instanceof Error ? chatError.message : "消息发送失败"); }
  }

  async function copyInvite() {
    if (!game) return;
    const link = `${window.location.origin}/?room=${encodeURIComponent(game.room.code)}`;
    try { await navigator.clipboard.writeText(link); notify("邀请链接已复制，同学可用自己的邮箱注册 / 登录"); }
    catch { notify(`房间码：${game.room.code}`); }
  }

  async function leaveTable() {
    if (!game || pending || !window.confirm("确定离开当前牌桌吗？本手牌会自动弃牌。")) return;
    setPending(true);
    setError("");
    try {
      await apiRequest("/api/game", {
        method: "POST",
        body: JSON.stringify({ code: game.room.code, type: "leave" }),
      });
      setGame(null);
      setView("lobby");
      setLobbyMode("join");
      setJoinCode("");
      window.history.replaceState({}, "", "/");
      notify("已离开牌桌");
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "无法离开牌桌");
    } finally {
      setPending(false);
    }
  }

  async function manageRoom(type: "rebuy" | "add_bot" | "kick", options?: { amount?: number; targetId?: string }) {
    if (!game || pending) return;
    setPending(true);
    setError("");
    try {
      const data = await apiRequest("/api/game", {
        method: "POST",
        body: JSON.stringify({ code: game.room.code, type, ...options }),
      });
      if (data.game) setGame(data.game);
      if (type === "rebuy") {
        setShowRebuy(false);
        notify(["preflop", "flop", "turn", "river"].includes(game.phase) ? "补码已预约，将在下一手生效" : "补码成功");
      } else if (type === "add_bot") notify("机器人已加入牌桌");
      else notify("玩家已移出房间");
    } catch (manageError) {
      setError(manageError instanceof Error ? manageError.message : "房间操作失败");
    } finally { setPending(false); }
  }

  function openDealerSettings() {
    if (!game || game.room.ownerId !== user.id) return;
    setCustomDealerPreview(game.dealer.isCustom ? game.dealer.image : "");
    setShowDealerSettings(true);
  }

  async function chooseDealer(presetId: string, image?: string) {
    if (!game || pending) return;
    setPending(true);
    setError("");
    try {
      const data = await apiRequest("/api/game", {
        method: "POST",
        body: JSON.stringify({ code: game.room.code, type: "set_dealer", dealer: { presetId, image } }),
      });
      if (data.game) setGame(data.game);
      setShowDealerSettings(false);
      notify(presetId === "custom" ? "自定义荷官已上桌" : "荷官已更换");
    } catch (dealerError) {
      setError(dealerError instanceof Error ? dealerError.message : "更换荷官失败");
    } finally { setPending(false); }
  }

  async function handleDealerPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setDealerPhotoBusy(true);
    setError("");
    try {
      setCustomDealerPreview(await prepareDealerPhoto(file));
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "照片处理失败");
    } finally { setDealerPhotoBusy(false); }
  }

  function kick(target: PublicPlayer) {
    if (window.confirm(`确定将「${target.name}」移出房间吗？`)) {
      void manageRoom("kick", { targetId: target.id });
    }
  }

  const viewer = game?.players.find((player) => player.id === game.viewerId);
  const turnPlayer = game?.players.find((player) => player.seat === game.turnSeat);
  const timerNow = game?.paused && game.pausedAt ? game.pausedAt : now;
  const secondsLeft = game?.actionDeadline ? Math.max(0, Math.ceil((game.actionDeadline - timerNow) / 1000)) : 0;
  const nextHandSeconds = game?.nextHandAt ? Math.max(0, Math.ceil((game.nextHandAt - timerNow) / 1000)) : 0;
  const timerProgress = `${Math.min(100, (secondsLeft / 25) * 100)}%`;

  const positionedPlayers = useMemo(() => {
    if (!game || !viewer) return [];
    const items: Array<{ position: string; player?: PublicPlayer }> = [];
    for (let offset = 1; offset < game.room.maxPlayers; offset += 1) {
      const seat = (viewer.seat + offset) % game.room.maxPlayers;
      items.push({ position: relativeSeats[offset] || "seat-left", player: game.players.find((item) => item.seat === seat && !item.isKicked) });
    }
    return items;
  }, [game, viewer]);

  const sessionResults = useMemo(() => {
    if (!game) return [];
    return game.players
      .filter((player) => !player.isKicked)
      .map((player) => ({
        ...player,
        net: player.chips + player.contribution + (player.pendingRebuy ?? 0) - (player.totalBuyIn ?? game.room.startingChips),
      }))
      .sort((left, right) => right.net - left.net);
  }, [game]);

  const gtoAdvice = useMemo(() => {
    if (!game || !viewer || viewer.folded) return null;
    return getStrategyAdvice({
      phase: game.phase,
      hole: viewer.hole ?? [],
      board: game.board,
      pot: game.pot,
      callAmount: game.validActions.callAmount,
      stack: viewer.chips,
    });
  }, [game, viewer]);

  function setPotFraction(fraction: number) {
    if (!game || !viewer || !game.validActions.canRaise) return;
    setPotPercent(Math.max(1, Math.round(fraction * 100)));
    setRaiseAmount(potFractionRaiseTarget({
      pot: game.pot,
      callAmount: game.validActions.callAmount,
      playerStreetBet: viewer.streetBet,
      fraction,
      chipStep: 1,
      minRaiseTo: game.validActions.minRaiseTo,
      maxRaiseTo: game.validActions.maxRaiseTo,
    }));
  }

  function setPrecisePotPercent(value: number) {
    if (!game || !viewer) return;
    const percent = Math.max(1, Math.min(300, Math.round(value || 1)));
    setPotPercent(percent);
    if (!game.validActions.canRaise) return;
    setRaiseAmount(potFractionRaiseTarget({
      pot: game.pot,
      callAmount: game.validActions.callAmount,
      playerStreetBet: viewer.streetBet,
      fraction: percent / 100,
      chipStep: 1,
      minRaiseTo: game.validActions.minRaiseTo,
      maxRaiseTo: game.validActions.maxRaiseTo,
    }));
  }

  function selectAmountUnit(unit: AmountUnit) {
    setAmountUnit(unit);
    window.localStorage.setItem("tongzhuo-amount-unit", unit);
  }

  function toggleGto() {
    const next = !showGto;
    window.localStorage.setItem("tongzhuo-gto-advisor", next ? "on" : "off");
    setShowGto(next);
    if (next && typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 980px)").matches) {
      setShowMobilePanel(true);
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="brand-mark">♠</span>
        <h1>正在连接牌桌</h1>
        <p>验证账号并同步服务器牌局…</p>
        <i className="loading-line" />
      </main>
    );
  }

  if (view === "lobby" || !game) {
    return (
      <main className="lobby-screen">
        <div className="lobby-brand"><span className="brand-mark">♠</span><span><b>同桌</b><small>POKER NIGHT</small></span></div>
        <section className="lobby-card">
          <span className="modal-kicker">SERVER TABLE</span>
          <h1>{lobbyMode === "join" ? "加入同学的牌桌" : "今晚，开一桌"}</h1>
          <p>服务器随机洗牌、自动判定行动顺序与牌型；登录后换设备也能回到自己的座位。</p>
          <div className="lobby-tabs">
            <button className={lobbyMode === "create" ? "active" : ""} type="button" onClick={() => setLobbyMode("create")}>创建房间</button>
            <button className={lobbyMode === "join" ? "active" : ""} type="button" onClick={() => setLobbyMode("join")}>输入房间码</button>
          </div>
          {game && <button className="back-to-table" type="button" onClick={() => setView("table")}>← 返回当前牌桌 · {game.room.name}</button>}
          <form className="create-form" onSubmit={createOrJoin}>
            {lobbyMode === "join" ? (
              <label>房间码<input name="code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="TONG-XXXXXX" required /></label>
            ) : (
              <>
                <fieldset className="mode-selector"><legend>选择牌桌模式</legend><button className={roomMode === "classic" ? "selected" : ""} type="button" onClick={() => setRoomMode("classic")}><span>♠</span><b>常规德州</b><small>标准规则、服务器洗牌与自动结算</small></button><button className={roomMode === "party" ? "selected party" : "party"} type="button" onClick={() => setRoomMode("party")}><span>🎡</span><b>娱乐德州</b><small>自动成就、服务器转盘与真实效果</small></button></fieldset>
                {roomMode === "party" && <fieldset className="trigger-selector"><legend>房主选择自动触发条件</legend><div>{ONLINE_PARTY_TRIGGERS.map((trigger) => <label className={partyTriggerDraft.includes(trigger.id) ? "selected" : ""} key={trigger.id}><input type="checkbox" checked={partyTriggerDraft.includes(trigger.id)} onChange={() => togglePartyTrigger(trigger.id)} /><span><b>{trigger.name}</b><small>{trigger.description}</small></span></label>)}</div><p>结算满足条件后，服务器自动给对应玩家增加一次转盘资格；每人最多储存 3 次。</p></fieldset>}
                <label>房间名字<input name="name" defaultValue="周五夜牌局" maxLength={24} required /></label>
                <div className="form-row">
                  <label>座位数<select name="maxPlayers" defaultValue="6"><option value="4">4 人桌</option><option value="6">6 人桌</option></select></label>
                  <label>电脑玩家<select name="bots" defaultValue="2"><option value="0">不添加</option><option value="1">1 位</option><option value="2">2 位</option><option value="3">3 位</option></select></label>
                </div>
                <div className="form-row">
                  <label>初始筹码<select name="startingChips" defaultValue="5000"><option value="3000">3,000</option><option value="5000">5,000</option><option value="10000">10,000</option></select></label>
                  <label>大盲注<select name="bigBlind" defaultValue="40"><option value="20">20</option><option value="40">40</option><option value="100">100</option></select></label>
                </div>
              </>
            )}
            {error && <p className="form-error">{error}</p>}
            <button className="primary-action" type="submit" disabled={pending}>{pending ? "正在连接…" : lobbyMode === "join" ? "加入并入座" : "创建并开始"}</button>
          </form>
          <div className="account-strip"><span className="my-avatar">{initials(user.displayName)}</span><span><b>{user.displayName}</b><small>{user.email}</small></span><span className="account-links"><a href="/profile">个人战绩</a><a href="/api/auth/logout?return_to=/">退出</a></span></div>
          <button className="lucky-entry-link" type="button" onClick={() => { setLobbyMode("create"); setRoomMode("party"); }}><span>🎡</span><b>创建线上娱乐德州</b><small>条件由房主选择，服务器自动判定并真实执行效果</small></button>
        </section>
        <p className="lobby-note">娱乐积分，无现金充值与提现</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" aria-label="同桌牌桌"><span className="brand-mark">♠</span><span className="brand-word">同桌</span><span className="brand-note">POKER NIGHT</span></button>
        <nav className="main-nav" aria-label="主导航">
          <button className="nav-item active" type="button">牌桌</button>
          <button className="nav-item" type="button" onClick={() => { setLobbyMode("create"); setError(""); setView("lobby"); }}>新房间</button>
          <button className="nav-item" type="button" onClick={() => { setLobbyMode("join"); setJoinCode(""); setError(""); setView("lobby"); }}>加入房间</button>
          <button className="nav-item" type="button" onClick={() => { setLobbyMode("create"); setRoomMode("party"); setError(""); setView("lobby"); }}>娱乐桌</button>
          <button className="nav-item" type="button" onClick={() => setShowRules(true)}>规则</button>
        </nav>
          <div className="topbar-actions">
            <span className={`table-mode-badge ${game.room.mode}`}>{game.room.mode === "party" ? "🎡 娱乐德州" : "♠ 常规德州"}</span>
            <span className={`server-badge ${game.paused ? "paused" : ""}`}><i /> {game.paused ? "牌桌已暂停" : "服务器已同步"}</span>
            {game.room.ownerId === user.id && <button className={`pause-table-button ${game.paused ? "resume" : ""}`} type="button" onClick={toggleTablePause} disabled={pending}>{game.paused ? "▶ 恢复牌局" : "Ⅱ 暂停牌局"}</button>}
            {game.room.mode === "party" && game.room.ownerId === user.id && <button className="party-settings-button" type="button" onClick={openPartySettings}>娱乐规则</button>}
            {game.room.ownerId === user.id && <button className="dealer-settings-button" type="button" onClick={openDealerSettings}>♣ 荷官</button>}
            <button className="chip-button" type="button" onClick={() => setShowRebuy(true)}>◉ 补码</button>
          <button className="invite-button" type="button" onClick={copyInvite}>＋ 邀请同学登录</button>
          <a className="my-avatar" href="/profile" title="查看个人主页" aria-label="查看个人主页">{initials(user.displayName)}</a>
        </div>
      </header>

      <section className="game-heading">
        <div>
          <div className="eyebrow-row"><span className="eyebrow">实时联机房间</span><button className="room-code" type="button" onClick={copyInvite}>{game.room.code} ⧉</button></div>
          <h1>{game.room.name}</h1>
          <p>第 {game.handNumber} 手 · {phaseName[game.phase]} · 盲注 {game.room.smallBlind} / {game.room.bigBlind}</p>
        </div>
        <div className="room-tools"><div className="table-display-switches"><div className="unit-switch" aria-label="筹码显示单位"><button className={amountUnit === "chips" ? "active" : ""} type="button" onClick={() => selectAmountUnit("chips")}>筹码</button><button className={amountUnit === "bb" ? "active" : ""} type="button" onClick={() => selectAmountUnit("bb")}>BB</button></div><button className={`gto-switch ${showGto ? "active" : ""}`} type="button" aria-pressed={showGto} onClick={toggleGto}>GTO 参考</button></div><span className="safe-play">服务器发牌 · 非现金</span><button className="more-button" type="button" onClick={() => setShowRules(true)}>•••</button></div>
      </section>

      {error && <button className="game-error" type="button" onClick={() => setError("")}>同步提示：{error} ×</button>}

      <div className="game-layout" ref={layoutRef}>
        <section className="table-panel" aria-label="实时德州扑克牌桌">
          <div className={`turn-banner ${game.paused ? "is-paused" : ""}`}>
            <div><span className="turn-label">{game.paused ? "牌桌已暂停" : game.phase === "showdown" ? game.resultText : game.validActions.isYourTurn ? "轮到你了" : turnPlayer ? `${turnPlayer.name} 行动中` : "等待牌局开始"}</span><span className="turn-hint">{game.paused ? `${game.pausedByName ?? "房主"} 暂停了发牌和倒计时` : game.validActions.isYourTurn ? game.validActions.callAmount ? `需跟注 ${formatAmount(game.validActions.callAmount, game.room.bigBlind, amountUnit)}` : "可以过牌或加注" : "状态会自动同步"}</span></div>
            <span className="timer">{game.paused ? "PAUSED" : game.phase === "showdown" ? `下一手 ${nextHandSeconds}s` : secondsLeft ? `00:${String(secondsLeft).padStart(2, "0")}` : "LIVE"}</span>
            <div className="timer-track"><span style={{ width: game.phase === "showdown" ? `${(nextHandSeconds / (game.room.mode === "party" ? 15 : 8)) * 100}%` : timerProgress }} /></div>
          </div>

          <div className="poker-room">
            <PartyEffectOverlay event={partyTableEvent} />
            {game.paused && <div className="table-paused-overlay" role="status"><span>Ⅱ</span><b>牌桌暂停中</b><p>自动发牌、机器人操作和所有行动倒计时均已冻结。</p><small>{game.room.ownerId === user.id ? "点击顶部“恢复牌局”继续" : "等待房主恢复牌局"}</small></div>}
            <div className="ambient-copy ambient-left">SERVER SHUFFLED</div><div className="ambient-copy ambient-right">LIVE TABLE</div>
            <div className={`table-dealer ${dealBurst ? "is-dealing" : ""}`}>
              <button type="button" onClick={openDealerSettings} disabled={game.room.ownerId !== user.id} aria-label={game.room.ownerId === user.id ? "更换荷官" : `荷官 ${game.dealer.name}`}>
                <img src={game.dealer.image} alt={`${game.dealer.name}荷官`} />
                <span><b>{game.dealer.name}</b><small>{game.room.ownerId === user.id ? "点击更换" : "本桌荷官"}</small></span>
              </button>
              <i className="dealer-card-stack" aria-hidden="true"><span /><span /><span /></i>
            </div>
            <DealAnimation burst={dealBurst} positions={positionedPlayers.filter((item) => item.player && !item.player.folded).map((item) => item.position)} />
            <div className="table-shadow" />
            <div className="poker-table">
              <div className="table-rail" /><div className="felt-texture" /><div className="table-brand"><span>同桌</span><small>FAIR PLAY</small></div>
              <div className="board-area">
                <div className="pot-label">底池</div><strong>{formatAmount(game.pot, game.room.bigBlind, amountUnit)}</strong>
                <div className="chip-stack"><i className="chip chip-coral" /><i className="chip chip-cream" /><i className="chip chip-dark" /></div>
                <div className="community-cards">
                  {Array.from({ length: 5 }, (_, index) => game.board[index]
                    ? <Card key={`${game.handNumber}-${game.board[index]}`} code={game.board[index]} delay={index * 70} />
                    : <div className="card-placeholder" key={`empty-${index}`} aria-label="尚未发出的公共牌" />)}
                </div>
                {!!game.actionFeed.length && <div className="table-action-feed" aria-live="polite">{game.actionFeed.slice(-3).map((move, index, moves) => <div className={`table-action ${index === moves.length - 1 ? "latest" : ""}`} key={move.id}><span>{move.playerName}{move.isBot ? " · BOT" : ""}</span><b>{move.label}{move.amount > 0 ? ` ${formatAmount(move.amount, game.room.bigBlind, amountUnit)}` : ""}</b></div>)}</div>}
              </div>
              {positionedPlayers.map((item, index) => <PlayerSeat key={item.player?.id ?? `empty-${index}`} player={item.player} position={item.position} dealer={item.player?.seat === game.dealerSeat} active={item.player?.seat === game.turnSeat} phase={game.phase} amountUnit={amountUnit} bigBlind={game.room.bigBlind} />)}
              {viewer && (
                <div className={`hero-seat ${viewer.folded ? "hero-folded" : ""}`}>
                  <div className="hero-cards">{viewer.hole?.length ? viewer.hole.map((card, index) => <Card key={card} code={card} small delay={index * 90} />) : <><Card small hidden /><Card small hidden delay={90} /></>}</div>
                  <div className="hero-profile">{viewer.tablePosition && <span className="hero-position-badge" title={positionName(viewer.tablePosition)}>{viewer.tablePosition}</span>}<span className="hero-avatar">{initials(viewer.name)}</span><span><b>你 · {viewer.name}</b><small>{formatAmount(viewer.chips, game.room.bigBlind, amountUnit)}{amountUnit === "chips" ? " 筹码" : ""}</small></span></div>
                  <span className="hand-strength">{viewer.lastAction || phaseName[game.phase]}</span>
                </div>
              )}
            </div>
          </div>

          <div className="action-dock">
            <div className="hand-summary"><span>当前状态</span><b>{game.phase === "showdown" ? "本手结束" : game.validActions.isYourTurn ? "请行动" : "等待中"}</b><small>{pending ? "服务器确认操作中…" : phaseName[game.phase]}</small></div>
            {game.phase === "showdown" ? (
              <button className="primary-action next-hand" type="button" disabled={game.room.ownerId !== user.id || pending || game.paused} onClick={startNextHand}>{game.paused ? "牌桌暂停中" : game.room.ownerId === user.id ? "立即开始下一手" : `下一手将在 ${nextHandSeconds} 秒后开始`}</button>
            ) : (
              <div className="action-buttons">
                <button className="action-button fold-action" type="button" disabled={!game.validActions.canFold || pending} onClick={() => sendAction("fold")}><span>弃牌</span><kbd>F</kbd></button>
                <button className="action-button check-action" type="button" disabled={!game.validActions.canCheck || pending} onClick={() => sendAction("check")}><span>过牌</span><kbd>K</kbd></button>
                <button className="action-button call-action" type="button" disabled={!game.validActions.canCall || pending} onClick={() => sendAction("call")}><span>跟注</span><b>{formatAmount(game.validActions.callAmount, game.room.bigBlind, amountUnit)}</b></button>
                <button className="action-button raise-action" type="button" disabled={!game.validActions.canRaise || pending} onClick={() => sendAction("raise", raiseAmount)}><span>加注到</span><b>{formatAmount(raiseAmount, game.room.bigBlind, amountUnit)}</b></button>
              </div>
            )}
            {game.phase !== "showdown" && (
              <>
                <div className="pot-presets"><span>底池 <b>{formatAmount(game.pot, game.room.bigBlind, amountUnit)}</b></span><button type="button" disabled={!game.validActions.canRaise} onClick={() => setPotFraction(1 / 3)}>1/3</button><button type="button" disabled={!game.validActions.canRaise} onClick={() => setPotFraction(1 / 2)}>1/2</button><button type="button" disabled={!game.validActions.canRaise} onClick={() => setPotFraction(2 / 3)}>2/3</button><button type="button" disabled={!game.validActions.canRaise} onClick={() => setPotFraction(1)}>1×</button></div>
                <div className="raise-control"><button type="button" disabled={!game.validActions.canRaise} onClick={() => setRaiseAmount(game.validActions.minRaiseTo)}>最小</button><input type="range" min={game.validActions.minRaiseTo || 0} max={Math.max(game.validActions.minRaiseTo, game.validActions.maxRaiseTo)} step={1} value={game.validActions.canRaise ? raiseAmount : 0} disabled={!game.validActions.canRaise} onChange={(event) => setRaiseAmount(Number(event.target.value))} aria-label="加注筹码数量，最小分度一筹码" /><button type="button" disabled={!game.validActions.canRaise} onClick={() => setRaiseAmount(game.validActions.maxRaiseTo)}>全下</button></div>
                <div className="precise-pot-control"><label htmlFor="pot-percent"><span>精确底池比例</span><b>{potPercent}%</b></label><input id="pot-percent" type="range" min="1" max="300" step="1" value={potPercent} disabled={!game.validActions.canRaise} onChange={(event) => setPrecisePotPercent(Number(event.target.value))} /><span className="percent-input"><input type="number" min="1" max="300" step="1" value={potPercent} disabled={!game.validActions.canRaise} onChange={(event) => setPrecisePotPercent(Number(event.target.value))} aria-label="底池百分比" />%</span><small>加注到 {formatAmount(raiseAmount, game.room.bigBlind, amountUnit)}</small></div>
              </>
            )}
          </div>
        </section>

        <div className="panel-resizer" role="separator" aria-orientation="vertical" aria-label="拖动调节右侧信息栏宽度" onPointerDown={startResize} />

        <aside className={`side-panel ${showMobilePanel ? "mobile-panel-open" : ""}`}>
          <div className="side-tabs"><button className="active" type="button">房间动态</button><button type="button">第 {game.handNumber} 手</button></div>
          <div className="players-card">
            <div className="section-title"><span>本桌玩家</span><small>{game.players.filter((player) => !player.isKicked).length} / {game.room.maxPlayers}</small></div>
            <div className="mini-player-list">{game.players.filter((player) => !player.isKicked).map((player) => <div className="mini-player" key={player.id}><span className="mini-avatar" style={{ background: seatColors[player.seat % seatColors.length] }}>{initials(player.name)}</span><span><b>{player.name}{player.id === game.viewerId ? "（你）" : ""}{player.isBot ? " · BOT" : ""}</b><small>{formatAmount(player.chips, game.room.bigBlind, amountUnit)}{amountUnit === "chips" ? " 筹码" : ""}{player.pendingRebuy ? ` · 待补 ${formatAmount(player.pendingRebuy, game.room.bigBlind, amountUnit)}` : ""}</small></span><span className="player-row-actions"><i className={player.isOnline ? "online-dot" : "away-dot"} />{game.room.ownerId === user.id && player.id !== user.id && <button type="button" onClick={() => kick(player)} disabled={pending}>移出</button>}</span></div>)}</div>
            {game.room.ownerId === user.id && <div className="host-tools"><button type="button" onClick={copyInvite}>＋ 邀请真人</button><button type="button" onClick={() => manageRoom("add_bot")} disabled={pending || game.players.filter((player) => !player.isKicked).length >= game.room.maxPlayers}>♟ 添加机器人</button></div>}
          </div>
          {game.room.mode === "party" && game.party && (
            <div className="party-room-card">
              <div className="section-title"><span>🎡 转盘与技能栏</span><small>限时使用 · 服务器执行</small></div>
              {game.party.lastAwards.length > 0 && <div className="party-award-banner"><b>刚刚触发</b>{game.party.lastAwards.map((award) => <span key={award.id}>{award.playerName} · {award.triggerName} +1</span>)}</div>}
              <div className="party-player-list">
                {game.players.filter((player) => !player.isKicked).map((player) => {
                  const runtime = game.party?.playerStates[player.id];
                  const effects = runtime?.effects.filter((effect) => effect.status === "pending" || effect.status === "active") ?? [];
                  const canSpin = !!runtime?.credits && (player.id === game.viewerId || game.room.ownerId === user.id && player.isBot);
                  return (
                    <article key={player.id}>
                      <div><b>{player.name}{player.isBot ? " · BOT" : ""}</b><small>成就 {runtime?.achievementCount ?? 0} · 转盘 {runtime?.credits ?? 0} 次</small></div>
                      <button type="button" disabled={!canSpin || pending || partyWheelSpinning} onClick={() => spinOnlinePartyWheel(player.id)}>{runtime?.credits ? "开始转盘" : "等待触发"}</button>
                      {effects.length > 0 && <div className="party-skill-list">{effects.map((effect) => {
                        const definition = partyEffect(effect.effectId);
                        const usable = canUsePartyEffect(effect, player);
                        return <div className={`party-skill ${effect.status}`} key={effect.id}><span>{definition?.emoji ?? "✦"}</span><div><b>{definition?.name ?? effect.effectId}</b><small>{effect.status === "active" ? `已激活 · Hand #${effect.appliesHand}` : `${definition?.useWindowLabel ?? "下一手"} · 限 Hand #${effect.appliesHand}`}</small></div>{definition?.control === "manual" ? <button className="party-use-button" type="button" disabled={!usable || pending} onClick={() => usePartyEffect(effect.id)}>{effect.status === "active" ? "已激活" : usable ? "立即使用" : "等待时机"}</button> : <em>自动</em>}</div>;
                      })}</div>}
                    </article>
                  );
                })}
              </div>
              {game.party.effectEvents.length > 0 && <div className="party-event-history"><b>效果动态</b>{[...game.party.effectEvents].reverse().slice(0, 4).map((event) => <div key={event.id}><span>{event.emoji}</span><p><strong>{event.title}</strong><small>{event.detail}</small></p><em>H#{event.handNumber}</em></div>)}</div>}
              {game.party.lastSpin && <div className="last-party-spin"><span>{game.party.lastSpin.emoji}</span><div><small>最近转盘结果</small><b>{game.party.lastSpin.playerName} · {game.party.lastSpin.effectName}</b></div></div>}
            </div>
          )}
          <div className="results-card"><div className="section-title"><span>本场输赢</span><small>含当前底池</small></div><div className="results-list">{sessionResults.map((player, index) => <div className="result-row" key={player.id}><span className="result-rank">{index + 1}</span><span className="mini-avatar" style={{ background: seatColors[player.seat % seatColors.length] }}>{initials(player.name)}</span><span><b>{player.name}{player.id === game.viewerId ? "（你）" : ""}</b><small>带入 {formatAmount(player.totalBuyIn ?? game.room.startingChips, game.room.bigBlind, amountUnit)}</small></span><strong className={player.net > 0 ? "net-win" : player.net < 0 ? "net-loss" : "net-even"}>{player.net > 0 ? "+" : ""}{formatAmount(player.net, game.room.bigBlind, amountUnit)}</strong></div>)}</div><p className="results-note">当前筹码与已投入底池，减去累计带入筹码</p></div>
          <div className="log-card"><div className="section-title"><span>行动记录</span><small>服务端</small></div><div className="game-logs">{[...game.logs].reverse().slice(0, 7).map((log) => <p className={log.kind} key={log.id}><time>{new Date(log.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>{log.text}</p>)}</div></div>
          {showGto && <section className="gto-advisor" aria-label="GTO近似策略参考"><div className="gto-advisor-head"><span><b>GTO 参考</b><small>本地近似策略 · 非求解器输出</small></span>{gtoAdvice && <strong>{gtoAdvice.handLabel}</strong>}</div>{gtoAdvice ? <><div className="strategy-mix">{strategyActions.map(({ key, label }) => <div className={`strategy-row ${gtoAdvice.mix[key] === 0 ? "inactive" : ""}`} key={key}><span>{label}</span><i><em style={{ width: `${gtoAdvice.mix[key]}%` }} /></i><b>{gtoAdvice.mix[key]}%</b></div>)}</div><p>{gtoAdvice.summary} · 牌力指数 {gtoAdvice.strength}%{gtoAdvice.potOdds ? ` · 跟注门槛 ${gtoAdvice.potOdds}%` : ""}</p></> : <p className="gto-empty">等待下一手牌或你已经弃牌，当前不显示策略概率。</p>}</section>}
          <div className="chat-card"><div className="section-title"><span>牌桌聊天</span><small>跨设备同步</small></div><div className="chat-messages">{game.chats.length ? game.chats.map((item) => <div className="chat-message" key={item.id}><span className="chat-avatar" style={{ background: seatColors[Math.abs(item.userId.length) % seatColors.length] }}>{initials(item.name).slice(0, 1)}</span><div><span className="chat-meta"><b>{item.name}</b><time>{new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></span><p>{item.text}</p></div></div>) : <p className="empty-chat">还没有消息，先打个招呼吧。</p>}</div><form className="chat-form" onSubmit={sendMessage}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="说点什么…" maxLength={120} aria-label="聊天消息" /><button type="submit" aria-label="发送">↗</button></form></div>
          <div className="room-exit-actions">
            <button className="leave-table-button" type="button" onClick={leaveTable} disabled={pending}>离开牌桌</button>
            <a className="leave-room" href="/api/auth/logout?return_to=/">退出账号</a>
          </div>
        </aside>
      </div>

      <button className="mobile-panel-toggle" type="button" onClick={() => setShowMobilePanel(!showMobilePanel)}>{showMobilePanel ? "收起动态" : "房间动态"}</button>

      {showRules && <PokerRulesModal mode={game.room.mode} enabledTriggers={game.party?.enabledTriggers ?? []} onClose={() => setShowRules(false)} />}
      {showPartySettings && <div className="modal-backdrop"><section className="modal-card party-settings-modal" role="dialog" aria-modal="true" aria-label="娱乐德州设置"><button className="modal-close" type="button" onClick={() => setShowPartySettings(false)}>×</button><span className="modal-kicker">HOST PARTY CONFIG</span><h2>选择自动触发条件</h2><p>修改只影响之后结算的手牌。条件由服务器根据真实牌型和行动记录自动判断。</p><div className="party-trigger-settings">{ONLINE_PARTY_TRIGGERS.map((trigger) => <label className={partyTriggerDraft.includes(trigger.id) ? "selected" : ""} key={trigger.id}><input type="checkbox" checked={partyTriggerDraft.includes(trigger.id)} onChange={() => togglePartyTrigger(trigger.id)} /><span><b>{trigger.name}</b><small>{trigger.description}</small></span></label>)}</div><button className="primary-action" type="button" disabled={pending || !partyTriggerDraft.length} onClick={savePartySettings}>{pending ? "正在保存…" : `保存 ${partyTriggerDraft.length} 项条件`}</button></section></div>}
      {partyWheelOpen && <OnlinePartyWheel rotation={partyWheelRotation} spinning={partyWheelSpinning} result={partyWheelResult} onClose={() => { if (!partyWheelSpinning) setPartyWheelOpen(false); }} />}
      {showDealerSettings && <div className="modal-backdrop" onMouseDown={() => setShowDealerSettings(false)}><section className="modal-card dealer-settings-card" role="dialog" aria-modal="true" aria-labelledby="dealer-settings-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setShowDealerSettings(false)}>×</button><span className="modal-kicker">DEALER SELECT</span><h2 id="dealer-settings-title">选择本桌荷官</h2><p>只有房主可以更换，所有玩家会实时看到同一位荷官。</p><div className="dealer-choice-grid">{DEALER_PRESETS.map((dealer) => <button className={game.dealer.id === dealer.id ? "selected" : ""} type="button" key={dealer.id} onClick={() => chooseDealer(dealer.id)} disabled={pending}><img src={dealer.image} alt="" /><span><b>{dealer.name}</b><small>{dealer.id === "classmate" ? "你的默认照片" : "内置人物"}</small></span>{game.dealer.id === dealer.id && <i>✓</i>}</button>)}</div><div className="custom-dealer-upload">{customDealerPreview ? <img src={customDealerPreview} alt="自定义荷官预览" /> : <span className="upload-placeholder">＋</span>}<span><b>使用自己的照片</b><small>自动裁成头像，仅保存到当前房间</small></span><label>{dealerPhotoBusy ? "处理中…" : "选择照片"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleDealerPhoto} disabled={dealerPhotoBusy || pending} /></label></div>{customDealerPreview && <button className="primary-action use-custom-dealer" type="button" onClick={() => chooseDealer("custom", customDealerPreview)} disabled={pending || dealerPhotoBusy}>{pending ? "正在同步…" : "使用这张照片"}</button>}<small className="dealer-privacy-note">照片会压缩后同步给本房间的玩家，请使用已获授权的图片。</small></section></div>}
      {showRebuy && <div className="modal-backdrop" onMouseDown={() => setShowRebuy(false)}><section className="modal-card rebuy-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setShowRebuy(false)}>×</button><span className="modal-kicker">REBUY</span><h2>补充桌面筹码</h2><p>牌局进行中提交的筹码会在下一手开始前到账，不会影响当前底池。</p><div className="rebuy-balance"><span>当前筹码</span><b>{viewer?.chips.toLocaleString() ?? 0}</b>{viewer?.pendingRebuy ? <small>已预约 +{viewer.pendingRebuy.toLocaleString()}</small> : <small>本桌上限 {(game.room.startingChips * 5).toLocaleString()}</small>}</div><div className="rebuy-options"><button type="button" disabled={pending} onClick={() => manageRoom("rebuy", { amount: 1000 })}>+1,000</button><button type="button" disabled={pending} onClick={() => manageRoom("rebuy", { amount: 3000 })}>+3,000</button><button type="button" disabled={pending} onClick={() => manageRoom("rebuy", { amount: game.room.startingChips })}>+{game.room.startingChips.toLocaleString()}</button></div><small className="rebuy-note">娱乐积分，无充值与提现</small></section></div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
