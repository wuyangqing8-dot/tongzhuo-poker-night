"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AuthenticatedUser,
  CardCode,
  PlayerAction,
  PublicGameView,
  PublicPlayer,
  Suit,
} from "../lib/poker-types";
import { potFractionRaiseTarget } from "../lib/bet-sizing";

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

function PlayerSeat({ player, position, dealer, active, phase }: {
  player?: PublicPlayer;
  position: string;
  dealer?: boolean;
  active?: boolean;
  phase: PublicGameView["phase"];
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
      {(showBacks || player.hole?.length) && (
        <div className="opponent-cards" aria-label={`${player.name}的手牌`}>
          {player.hole?.length
            ? player.hole.map((card, index) => <Card key={card} code={card} small delay={index * 60} />)
            : <><Card small hidden /><Card small hidden delay={60} /></>}
        </div>
      )}
      <div className="avatar-wrap">
        <span className="avatar" style={{ background: seatColors[player.seat % seatColors.length] }}>{initials(player.name)}</span>
        {dealer && <span className="dealer-chip">D</span>}
      </div>
      <span className="player-name">{player.name}{player.isBot ? " · BOT" : ""}</span>
      <span className="player-chips">{player.chips.toLocaleString()} 筹码</span>
      <span className={`connection-dot ${player.isOnline ? "online" : ""}`} title={player.isOnline ? "在线" : "暂时离线"} />
      {player.lastAction && <span className="player-status">{player.lastAction}</span>}
    </div>
  );
}

async function apiRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json() as { error?: string; game?: PublicGameView; needsRoom?: boolean; needsJoin?: boolean };
  if (response.status === 401) {
    window.location.href = `/signin-with-chatgpt?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`;
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
  const [joinCode, setJoinCode] = useState(initialRoomCode ?? "");
  const [showRules, setShowRules] = useState(false);
  const [showRebuy, setShowRebuy] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [message, setMessage] = useState("");
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [now, setNow] = useState(Date.now());
  const polling = useRef(false);

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
    if (game?.validActions.canRaise) setRaiseAmount(game.validActions.minRaiseTo);
  }, [game?.version, game?.validActions.canRaise, game?.validActions.minRaiseTo]);

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
          };
      const data = await apiRequest("/api/rooms", { method: "POST", body: JSON.stringify(body) });
      if (data.game) {
        setGame(data.game);
        setView("table");
        window.history.replaceState({}, "", `/?room=${encodeURIComponent(data.game.room.code)}`);
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
    try { await navigator.clipboard.writeText(link); notify("联机邀请链接已复制"); }
    catch { notify(`房间码：${game.room.code}`); }
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

  function kick(target: PublicPlayer) {
    if (window.confirm(`确定将「${target.name}」移出房间吗？`)) {
      void manageRoom("kick", { targetId: target.id });
    }
  }

  const viewer = game?.players.find((player) => player.id === game.viewerId);
  const turnPlayer = game?.players.find((player) => player.seat === game.turnSeat);
  const secondsLeft = game?.actionDeadline ? Math.max(0, Math.ceil((game.actionDeadline - now) / 1000)) : 0;
  const nextHandSeconds = game?.nextHandAt ? Math.max(0, Math.ceil((game.nextHandAt - now) / 1000)) : 0;
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

  function setPotFraction(fraction: number) {
    if (!game || !viewer || !game.validActions.canRaise) return;
    setRaiseAmount(potFractionRaiseTarget({
      pot: game.pot,
      callAmount: game.validActions.callAmount,
      playerStreetBet: viewer.streetBet,
      fraction,
      bigBlind: game.room.bigBlind,
      minRaiseTo: game.validActions.minRaiseTo,
      maxRaiseTo: game.validActions.maxRaiseTo,
    }));
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
          <div className="account-strip"><span className="my-avatar">{initials(user.displayName)}</span><span><b>{user.displayName}</b><small>{user.email}</small></span><a href="/signout-with-chatgpt?return_to=/">退出</a></div>
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
          <button className="nav-item" type="button" onClick={() => setShowRules(true)}>规则</button>
        </nav>
        <div className="topbar-actions">
          <span className="server-badge"><i /> 服务器已同步</span>
          <button className="chip-button" type="button" onClick={() => setShowRebuy(true)}>◉ 补码</button>
          <button className="invite-button" type="button" onClick={copyInvite}>＋ 邀请同学</button>
          <span className="my-avatar" title={user.displayName}>{initials(user.displayName)}</span>
        </div>
      </header>

      <section className="game-heading">
        <div>
          <div className="eyebrow-row"><span className="eyebrow">实时联机房间</span><button className="room-code" type="button" onClick={copyInvite}>{game.room.code} ⧉</button></div>
          <h1>{game.room.name}</h1>
          <p>第 {game.handNumber} 手 · {phaseName[game.phase]} · 盲注 {game.room.smallBlind} / {game.room.bigBlind}</p>
        </div>
        <div className="room-tools"><span className="safe-play">服务器发牌 · 非现金</span><button className="more-button" type="button" onClick={() => setShowRules(true)}>•••</button></div>
      </section>

      {error && <button className="game-error" type="button" onClick={() => setError("")}>同步提示：{error} ×</button>}

      <div className="game-layout">
        <section className="table-panel" aria-label="实时德州扑克牌桌">
          <div className="turn-banner">
            <div><span className="turn-label">{game.phase === "showdown" ? game.resultText : game.validActions.isYourTurn ? "轮到你了" : turnPlayer ? `${turnPlayer.name} 行动中` : "等待牌局开始"}</span><span className="turn-hint">{game.validActions.isYourTurn ? game.validActions.callAmount ? `需跟注 ${game.validActions.callAmount}` : "可以过牌或加注" : "状态会自动同步"}</span></div>
            <span className="timer">{game.phase === "showdown" ? `下一手 ${nextHandSeconds}s` : secondsLeft ? `00:${String(secondsLeft).padStart(2, "0")}` : "LIVE"}</span>
            <div className="timer-track"><span style={{ width: game.phase === "showdown" ? `${(nextHandSeconds / 8) * 100}%` : timerProgress }} /></div>
          </div>

          <div className="poker-room">
            <div className="ambient-copy ambient-left">SERVER SHUFFLED</div><div className="ambient-copy ambient-right">LIVE TABLE</div>
            <div className="table-shadow" />
            <div className="poker-table">
              <div className="table-rail" /><div className="felt-texture" /><div className="table-brand"><span>同桌</span><small>FAIR PLAY</small></div>
              <div className="board-area">
                <div className="pot-label">底池</div><strong>{game.pot.toLocaleString()}</strong>
                <div className="chip-stack"><i className="chip chip-coral" /><i className="chip chip-cream" /><i className="chip chip-dark" /></div>
                <div className="community-cards">
                  {Array.from({ length: 5 }, (_, index) => game.board[index]
                    ? <Card key={`${game.handNumber}-${game.board[index]}`} code={game.board[index]} delay={index * 70} />
                    : <div className="card-placeholder" key={`empty-${index}`} aria-label="尚未发出的公共牌" />)}
                </div>
              </div>
              {positionedPlayers.map((item, index) => <PlayerSeat key={item.player?.id ?? `empty-${index}`} player={item.player} position={item.position} dealer={item.player?.seat === game.dealerSeat} active={item.player?.seat === game.turnSeat} phase={game.phase} />)}
              {viewer && (
                <div className={`hero-seat ${viewer.folded ? "hero-folded" : ""}`}>
                  <div className="hero-cards">{viewer.hole?.length ? viewer.hole.map((card, index) => <Card key={card} code={card} small delay={index * 90} />) : <><Card small hidden /><Card small hidden delay={90} /></>}</div>
                  <div className="hero-profile"><span className="hero-avatar">{initials(viewer.name)}</span><span><b>你 · {viewer.name}</b><small>{viewer.chips.toLocaleString()} 筹码</small></span></div>
                  <span className="hand-strength">{viewer.lastAction || phaseName[game.phase]}</span>
                </div>
              )}
            </div>
          </div>

          <div className="action-dock">
            <div className="hand-summary"><span>当前状态</span><b>{game.phase === "showdown" ? "本手结束" : game.validActions.isYourTurn ? "请行动" : "等待中"}</b><small>{pending ? "服务器确认操作中…" : phaseName[game.phase]}</small></div>
            {game.phase === "showdown" ? (
              <button className="primary-action next-hand" type="button" disabled={game.room.ownerId !== user.id || pending} onClick={startNextHand}>{game.room.ownerId === user.id ? "立即开始下一手" : `下一手将在 ${nextHandSeconds} 秒后开始`}</button>
            ) : (
              <div className="action-buttons">
                <button className="action-button fold-action" type="button" disabled={!game.validActions.canFold || pending} onClick={() => sendAction("fold")}><span>弃牌</span><kbd>F</kbd></button>
                <button className="action-button check-action" type="button" disabled={!game.validActions.canCheck || pending} onClick={() => sendAction("check")}><span>过牌</span><kbd>K</kbd></button>
                <button className="action-button call-action" type="button" disabled={!game.validActions.canCall || pending} onClick={() => sendAction("call")}><span>跟注</span><b>{game.validActions.callAmount}</b></button>
                <button className="action-button raise-action" type="button" disabled={!game.validActions.canRaise || pending} onClick={() => sendAction("raise", raiseAmount)}><span>加注到</span><b>{raiseAmount.toLocaleString()}</b></button>
              </div>
            )}
            {game.phase !== "showdown" && (
              <>
                <div className="pot-presets"><span>底池 <b>{game.pot.toLocaleString()}</b></span><button type="button" disabled={!game.validActions.canRaise} onClick={() => setPotFraction(1 / 3)}>1/3</button><button type="button" disabled={!game.validActions.canRaise} onClick={() => setPotFraction(1 / 2)}>1/2</button><button type="button" disabled={!game.validActions.canRaise} onClick={() => setPotFraction(2 / 3)}>2/3</button><button type="button" disabled={!game.validActions.canRaise} onClick={() => setPotFraction(1)}>1×</button></div>
                <div className="raise-control"><button type="button" disabled={!game.validActions.canRaise} onClick={() => setRaiseAmount(game.validActions.minRaiseTo)}>最小</button><input type="range" min={game.validActions.minRaiseTo || 0} max={Math.max(game.validActions.minRaiseTo, game.validActions.maxRaiseTo)} step={game.room.bigBlind} value={raiseAmount} disabled={!game.validActions.canRaise} onChange={(event) => setRaiseAmount(Number(event.target.value))} aria-label="加注筹码数量" /><button type="button" disabled={!game.validActions.canRaise} onClick={() => setRaiseAmount(game.validActions.maxRaiseTo)}>全下</button></div>
              </>
            )}
          </div>
        </section>

        <aside className={`side-panel ${showMobilePanel ? "mobile-panel-open" : ""}`}>
          <div className="side-tabs"><button className="active" type="button">房间动态</button><button type="button">第 {game.handNumber} 手</button></div>
          <div className="players-card">
            <div className="section-title"><span>本桌玩家</span><small>{game.players.filter((player) => !player.isKicked).length} / {game.room.maxPlayers}</small></div>
            <div className="mini-player-list">{game.players.filter((player) => !player.isKicked).map((player) => <div className="mini-player" key={player.id}><span className="mini-avatar" style={{ background: seatColors[player.seat % seatColors.length] }}>{initials(player.name)}</span><span><b>{player.name}{player.id === game.viewerId ? "（你）" : ""}{player.isBot ? " · BOT" : ""}</b><small>{player.chips.toLocaleString()} 筹码{player.pendingRebuy ? ` · 待补 ${player.pendingRebuy.toLocaleString()}` : ""}</small></span><span className="player-row-actions"><i className={player.isOnline ? "online-dot" : "away-dot"} />{game.room.ownerId === user.id && player.id !== user.id && <button type="button" onClick={() => kick(player)} disabled={pending}>移出</button>}</span></div>)}</div>
            {game.room.ownerId === user.id && <div className="host-tools"><button type="button" onClick={copyInvite}>＋ 邀请真人</button><button type="button" onClick={() => manageRoom("add_bot")} disabled={pending || game.players.filter((player) => !player.isKicked).length >= game.room.maxPlayers}>♟ 添加机器人</button></div>}
          </div>
          <div className="results-card"><div className="section-title"><span>本场输赢</span><small>含当前底池</small></div><div className="results-list">{sessionResults.map((player, index) => <div className="result-row" key={player.id}><span className="result-rank">{index + 1}</span><span className="mini-avatar" style={{ background: seatColors[player.seat % seatColors.length] }}>{initials(player.name)}</span><span><b>{player.name}{player.id === game.viewerId ? "（你）" : ""}</b><small>带入 {(player.totalBuyIn ?? game.room.startingChips).toLocaleString()}</small></span><strong className={player.net > 0 ? "net-win" : player.net < 0 ? "net-loss" : "net-even"}>{player.net > 0 ? "+" : ""}{player.net.toLocaleString()}</strong></div>)}</div><p className="results-note">当前筹码与已投入底池，减去累计带入筹码</p></div>
          <div className="log-card"><div className="section-title"><span>行动记录</span><small>服务端</small></div><div className="game-logs">{[...game.logs].reverse().slice(0, 7).map((log) => <p className={log.kind} key={log.id}><time>{new Date(log.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time>{log.text}</p>)}</div></div>
          <div className="chat-card"><div className="section-title"><span>牌桌聊天</span><small>跨设备同步</small></div><div className="chat-messages">{game.chats.length ? game.chats.map((item) => <div className="chat-message" key={item.id}><span className="chat-avatar" style={{ background: seatColors[Math.abs(item.userId.length) % seatColors.length] }}>{initials(item.name).slice(0, 1)}</span><div><span className="chat-meta"><b>{item.name}</b><time>{new Date(item.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time></span><p>{item.text}</p></div></div>) : <p className="empty-chat">还没有消息，先打个招呼吧。</p>}</div><form className="chat-form" onSubmit={sendMessage}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="说点什么…" maxLength={120} aria-label="聊天消息" /><button type="submit" aria-label="发送">↗</button></form></div>
          <a className="leave-room" href="/signout-with-chatgpt?return_to=/">退出账号</a>
        </aside>
      </div>

      <button className="mobile-panel-toggle" type="button" onClick={() => setShowMobilePanel(!showMobilePanel)}>{showMobilePanel ? "收起动态" : "房间动态"}</button>

      {showRules && <div className="modal-backdrop" onMouseDown={() => setShowRules(false)}><section className="modal-card rules-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setShowRules(false)}>×</button><span className="modal-kicker">正常德州规则</span><h2>这次，牌局是真的</h2><div className="rule-list"><div><b>01</b><span><strong>服务器安全洗牌</strong><small>每手使用加密随机数重新洗 52 张牌，前端拿不到牌堆。</small></span></div><div><b>02</b><span><strong>严格轮流行动</strong><small>过牌、跟注、加注、全下和超时均由服务器验证。</small></span></div><div><b>03</b><span><strong>自动结算边池</strong><small>支持平分底池、全下边池与七选五最佳牌型。</small></span></div></div><button className="primary-action" type="button" onClick={() => setShowRules(false)}>回到牌桌</button></section></div>}
      {showRebuy && <div className="modal-backdrop" onMouseDown={() => setShowRebuy(false)}><section className="modal-card rebuy-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" type="button" onClick={() => setShowRebuy(false)}>×</button><span className="modal-kicker">REBUY</span><h2>补充桌面筹码</h2><p>牌局进行中提交的筹码会在下一手开始前到账，不会影响当前底池。</p><div className="rebuy-balance"><span>当前筹码</span><b>{viewer?.chips.toLocaleString() ?? 0}</b>{viewer?.pendingRebuy ? <small>已预约 +{viewer.pendingRebuy.toLocaleString()}</small> : <small>本桌上限 {(game.room.startingChips * 5).toLocaleString()}</small>}</div><div className="rebuy-options"><button type="button" disabled={pending} onClick={() => manageRoom("rebuy", { amount: 1000 })}>+1,000</button><button type="button" disabled={pending} onClick={() => manageRoom("rebuy", { amount: 3000 })}>+3,000</button><button type="button" disabled={pending} onClick={() => manageRoom("rebuy", { amount: game.room.startingChips })}>+{game.room.startingChips.toLocaleString()}</button></div><small className="rebuy-note">娱乐积分，无充值与提现</small></section></div>}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
