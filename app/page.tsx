"use client";

import { FormEvent, useMemo, useState } from "react";

type Suit = "♠" | "♥" | "♦" | "♣";

type CardProps = {
  rank: string;
  suit: Suit;
  small?: boolean;
  hidden?: boolean;
  delay?: number;
};

type PlayerProps = {
  name: string;
  initials: string;
  chips: number;
  position: string;
  color: string;
  status?: string;
  dealer?: boolean;
  active?: boolean;
  folded?: boolean;
  empty?: boolean;
};

type ChatMessage = {
  id: number;
  name: string;
  text: string;
  time: string;
  color: string;
};

const tablePlayers: PlayerProps[] = [
  {
    name: "周扬",
    initials: "ZY",
    chips: 4760,
    position: "seat-top-left",
    color: "#d89066",
    status: "跟注 240",
  },
  {
    name: "林墨",
    initials: "LM",
    chips: 5320,
    position: "seat-top-right",
    color: "#8ca98d",
    status: "思考中",
    active: true,
  },
  {
    name: "Mia",
    initials: "MI",
    chips: 2980,
    position: "seat-right",
    color: "#d2a7aa",
    status: "弃牌",
    folded: true,
  },
  {
    name: "陈一凡",
    initials: "CY",
    chips: 6240,
    position: "seat-bottom-right",
    color: "#809bb1",
    status: "大盲 40",
    dealer: true,
  },
  {
    name: "Leo",
    initials: "LE",
    chips: 3880,
    position: "seat-left",
    color: "#b99c72",
    status: "过牌",
  },
];

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    name: "周扬",
    text: "今晚谁赢谁点奶茶 🧋",
    time: "21:08",
    color: "#d89066",
  },
  {
    id: 2,
    name: "Mia",
    text: "说好了不许偷看表情啊",
    time: "21:09",
    color: "#d2a7aa",
  },
  {
    id: 3,
    name: "林墨",
    text: "这手有点意思",
    time: "21:11",
    color: "#8ca98d",
  },
];

function Card({ rank, suit, small = false, hidden = false, delay = 0 }: CardProps) {
  const red = suit === "♥" || suit === "♦";

  return (
    <div
      className={`playing-card ${small ? "card-small" : ""} ${hidden ? "card-hidden" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      aria-label={hidden ? "背面牌" : `${rank}${suit}`}
    >
      {hidden ? (
        <span className="card-back-mark">同</span>
      ) : (
        <>
          <span className={red ? "card-red" : ""}>{rank}</span>
          <span className={`card-suit ${red ? "card-red" : ""}`}>{suit}</span>
        </>
      )}
    </div>
  );
}

function PlayerSeat(player: PlayerProps) {
  if (player.empty) {
    return (
      <button className={`player-seat empty-seat ${player.position}`} type="button">
        <span className="empty-avatar">＋</span>
        <span>邀请同学</span>
      </button>
    );
  }

  return (
    <div
      className={`player-seat ${player.position} ${player.active ? "active-seat" : ""} ${player.folded ? "folded-seat" : ""}`}
    >
      <div className="avatar-wrap">
        <span className="avatar" style={{ background: player.color }}>
          {player.initials}
        </span>
        {player.dealer && <span className="dealer-chip">D</span>}
      </div>
      <span className="player-name">{player.name}</span>
      <span className="player-chips">{player.chips.toLocaleString()} 筹码</span>
      {player.status && <span className="player-status">{player.status}</span>}
    </div>
  );
}

export default function Home() {
  const [roomName, setRoomName] = useState("周五夜牌局");
  const [roomCode, setRoomCode] = useState("TONG-8246");
  const [showCreate, setShowCreate] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [messages, setMessages] = useState(initialMessages);
  const [message, setMessage] = useState("");
  const [raiseAmount, setRaiseAmount] = useState(480);
  const [pot, setPot] = useState(1240);
  const [myChips, setMyChips] = useState(4140);
  const [riverVisible, setRiverVisible] = useState(false);
  const [handEnded, setHandEnded] = useState(false);
  const [actionText, setActionText] = useState("轮到你了");
  const [toast, setToast] = useState("");
  const [round, setRound] = useState(18);

  const progress = useMemo(() => `${Math.max(10, (round / 18) * 100)}%`, [round]);

  function notify(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function copyInvite() {
    const invite = `来「${roomName}」打牌，房间码：${roomCode}`;
    try {
      await navigator.clipboard.writeText(invite);
      notify("邀请信息已复制，发给同学吧");
    } catch {
      notify(`房间码：${roomCode}`);
    }
  }

  function takeAction(action: "fold" | "check" | "call" | "raise") {
    if (handEnded) return;

    if (action === "fold") {
      setActionText("你已弃牌，正在旁观本手");
      setHandEnded(true);
      notify("已弃牌");
      return;
    }

    if (action === "check") {
      setActionText("你已过牌，等待林墨行动…");
      setRiverVisible(true);
      setRound(11);
      notify("过牌");
      return;
    }

    const amount = action === "call" ? 240 : raiseAmount;
    setPot((value) => value + amount);
    setMyChips((value) => value - amount);
    setRiverVisible(true);
    setRound(9);
    setActionText(
      action === "call"
        ? "你已跟注 240，等待林墨行动…"
        : `你已加注到 ${amount.toLocaleString()}，漂亮的压力`
    );
    notify(action === "call" ? "跟注 240" : `加注 ${amount.toLocaleString()}`);
  }

  function nextHand() {
    setPot(60);
    setRiverVisible(false);
    setHandEnded(false);
    setActionText("新的一手 · 等待发牌");
    setRound(18);
    notify("第 13 手开始");
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessages((items) => [
      ...items,
      {
        id: Date.now(),
        name: "你",
        text,
        time: new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        color: "#ef7658",
      },
    ]);
    setMessage("");
  }

  function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("room-name") || "新牌局").trim();
    const code = `TONG-${Math.floor(1000 + Math.random() * 9000)}`;
    setRoomName(name || "新牌局");
    setRoomCode(code);
    setShowCreate(false);
    notify("新房间已创建");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" aria-label="回到牌桌首页">
          <span className="brand-mark" aria-hidden="true">
            ♠
          </span>
          <span className="brand-word">同桌</span>
          <span className="brand-note">POKER NIGHT</span>
        </button>

        <nav className="main-nav" aria-label="主导航">
          <button className="nav-item active" type="button">
            牌桌
          </button>
          <button className="nav-item" type="button" onClick={() => setShowCreate(true)}>
            新房间
          </button>
          <button className="nav-item" type="button" onClick={() => setShowRules(true)}>
            快速规则
          </button>
        </nav>

        <div className="topbar-actions">
          <span className="live-pill">
            <i /> 5 人在线
          </span>
          <button className="icon-button" type="button" onClick={() => setSoundOn(!soundOn)} aria-label={soundOn ? "关闭声音" : "开启声音"}>
            {soundOn ? "♪" : "×"}
          </button>
          <button className="invite-button" type="button" onClick={copyInvite}>
            <span aria-hidden="true">＋</span> 邀请同学
          </button>
          <span className="my-avatar">AY</span>
        </div>
      </header>

      <section className="game-heading">
        <div>
          <div className="eyebrow-row">
            <span className="eyebrow">私密房间</span>
            <button className="room-code" type="button" onClick={copyInvite} title="复制房间码">
              {roomCode} <span aria-hidden="true">⧉</span>
            </button>
          </div>
          <h1>{roomName}</h1>
          <p>第 12 手 · 德州扑克 · 盲注 20 / 40</p>
        </div>
        <div className="room-tools">
          <span className="safe-play">非现金 · 只记分</span>
          <button className="more-button" type="button" aria-label="房间更多设置">
            •••
          </button>
        </div>
      </section>

      <div className="game-layout">
        <section className="table-panel" aria-label="德州扑克牌桌">
          <div className="turn-banner">
            <div>
              <span className="turn-label">{actionText}</span>
              <span className="turn-hint">当前需跟注 240</span>
            </div>
            <span className="timer">00:{String(round).padStart(2, "0")}</span>
            <div className="timer-track" aria-hidden="true">
              <span style={{ width: progress }} />
            </div>
          </div>

          <div className="poker-room">
            <div className="ambient-copy ambient-left">GOOD HANDS</div>
            <div className="ambient-copy ambient-right">GOOD FRIENDS</div>

            <div className="table-shadow" />
            <div className="poker-table">
              <div className="table-rail" />
              <div className="felt-texture" />
              <div className="table-brand">
                <span>同桌</span>
                <small>EST. 2026</small>
              </div>

              <div className="board-area">
                <div className="pot-label">底池</div>
                <strong>{pot.toLocaleString()}</strong>
                <div className="chip-stack" aria-hidden="true">
                  <i className="chip chip-coral" />
                  <i className="chip chip-cream" />
                  <i className="chip chip-dark" />
                </div>
                <div className="community-cards">
                  <Card rank="J" suit="♥" delay={0} />
                  <Card rank="8" suit="♣" delay={70} />
                  <Card rank="4" suit="♦" delay={140} />
                  <Card rank="A" suit="♠" delay={210} />
                  {riverVisible ? (
                    <Card rank="10" suit="♥" delay={280} />
                  ) : (
                    <div className="card-placeholder" aria-label="尚未发出的河牌" />
                  )}
                </div>
              </div>

              {tablePlayers.map((player) => (
                <PlayerSeat key={player.name} {...player} />
              ))}
              <PlayerSeat
                name=""
                initials=""
                chips={0}
                color=""
                position="seat-bottom-left"
                empty
              />

              <div className={`hero-seat ${handEnded ? "hero-folded" : ""}`}>
                <div className="hero-cards">
                  <Card rank="A" suit="♥" small />
                  <Card rank="Q" suit="♥" small delay={90} />
                </div>
                <div className="hero-profile">
                  <span className="hero-avatar">AY</span>
                  <span>
                    <b>你</b>
                    <small>{myChips.toLocaleString()} 筹码</small>
                  </span>
                </div>
                <span className="hand-strength">一对 A · 12 张出牌</span>
              </div>
            </div>
          </div>

          <div className="action-dock">
            <div className="hand-summary">
              <span>你的手牌</span>
              <b>{handEnded ? "本手已弃牌" : "一对 A"}</b>
              <small>{handEnded ? "等待下一手" : "当前胜率参考 68%"}</small>
            </div>

            {handEnded ? (
              <button className="primary-action next-hand" type="button" onClick={nextHand}>
                下一手
              </button>
            ) : (
              <div className="action-buttons">
                <button className="action-button fold-action" type="button" onClick={() => takeAction("fold")}>
                  <span>弃牌</span>
                  <kbd>F</kbd>
                </button>
                <button className="action-button check-action" type="button" onClick={() => takeAction("check")}>
                  <span>过牌</span>
                  <kbd>K</kbd>
                </button>
                <button className="action-button call-action" type="button" onClick={() => takeAction("call")}>
                  <span>跟注</span>
                  <b>240</b>
                </button>
                <button className="action-button raise-action" type="button" onClick={() => takeAction("raise")}>
                  <span>加注</span>
                  <b>{raiseAmount.toLocaleString()}</b>
                </button>
              </div>
            )}

            {!handEnded && (
              <div className="raise-control">
                <button type="button" onClick={() => setRaiseAmount(480)}>
                  最小
                </button>
                <input
                  type="range"
                  min="480"
                  max="2000"
                  step="40"
                  value={raiseAmount}
                  onChange={(event) => setRaiseAmount(Number(event.target.value))}
                  aria-label="加注筹码数量"
                />
                <button type="button" onClick={() => setRaiseAmount(Math.min(myChips, 2000))}>
                  全下
                </button>
              </div>
            )}
          </div>
        </section>

        <aside className={`side-panel ${showMobilePanel ? "mobile-panel-open" : ""}`}>
          <div className="side-tabs" role="tablist" aria-label="房间信息">
            <button className="active" type="button" role="tab" aria-selected="true">
              房间动态
            </button>
            <button type="button" role="tab" aria-selected="false">
              牌局记录
            </button>
          </div>

          <div className="players-card">
            <div className="section-title">
              <span>本桌玩家</span>
              <small>5 / 6</small>
            </div>
            <div className="mini-player-list">
              {[...tablePlayers, { name: "你", initials: "AY", color: "#ef7658", chips: myChips }].map(
                (player, index) => (
                  <div className="mini-player" key={player.name}>
                    <span className="mini-avatar" style={{ background: player.color }}>
                      {player.initials}
                    </span>
                    <span>
                      <b>{player.name}</b>
                      <small>{player.chips.toLocaleString()} 筹码</small>
                    </span>
                    <i className={index === 2 ? "away-dot" : "online-dot"} />
                  </div>
                )
              )}
            </div>
          </div>

          <div className="chat-card">
            <div className="section-title">
              <span>牌桌聊天</span>
              <button type="button" aria-label="聊天设置">
                •••
              </button>
            </div>
            <div className="chat-messages" aria-live="polite">
              {messages.map((item) => (
                <div className="chat-message" key={item.id}>
                  <span className="chat-avatar" style={{ background: item.color }}>
                    {item.name.slice(0, 1)}
                  </span>
                  <div>
                    <span className="chat-meta">
                      <b>{item.name}</b>
                      <time>{item.time}</time>
                    </span>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <form className="chat-form" onSubmit={sendMessage}>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="说点什么…"
                aria-label="聊天消息"
                maxLength={80}
              />
              <button type="submit" aria-label="发送消息">
                ↗
              </button>
            </form>
          </div>

          <button className="leave-room" type="button" onClick={() => notify("你仍在房间中")}>退出房间</button>
        </aside>
      </div>

      <button className="mobile-panel-toggle" type="button" onClick={() => setShowMobilePanel(!showMobilePanel)}>
        {showMobilePanel ? "收起动态" : "房间动态 · 3 条新消息"}
      </button>

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowCreate(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setShowCreate(false)} aria-label="关闭">
              ×
            </button>
            <span className="modal-kicker">只差一张桌</span>
            <h2 id="create-title">开一个新牌局</h2>
            <p>设置好后，把房间码发到班级群就能集合。</p>
            <form className="create-form" onSubmit={createRoom}>
              <label>
                房间名字
                <input name="room-name" defaultValue="宿舍友谊赛" maxLength={20} required />
              </label>
              <div className="form-row">
                <label>
                  座位数
                  <select name="seats" defaultValue="6">
                    <option value="4">4 人桌</option>
                    <option value="6">6 人桌</option>
                    <option value="8">8 人桌</option>
                  </select>
                </label>
                <label>
                  初始筹码
                  <select name="chips" defaultValue="5000">
                    <option value="3000">3,000</option>
                    <option value="5000">5,000</option>
                    <option value="10000">10,000</option>
                  </select>
                </label>
              </div>
              <label className="toggle-row">
                <span>
                  <b>私密房间</b>
                  <small>只有拿到房间码的同学能加入</small>
                </span>
                <input type="checkbox" defaultChecked aria-label="开启私密房间" />
              </label>
              <button className="primary-action" type="submit">
                创建并入座
              </button>
            </form>
          </section>
        </div>
      )}

      {showRules && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowRules(false)}>
          <section className="modal-card rules-card" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setShowRules(false)} aria-label="关闭">
              ×
            </button>
            <span className="modal-kicker">60 秒上手</span>
            <h2 id="rules-title">德州扑克牌桌规则</h2>
            <div className="rule-list">
              <div><b>01</b><span><strong>每人两张底牌</strong><small>只有自己能看见，别截图剧透。</small></span></div>
              <div><b>02</b><span><strong>桌面发五张公共牌</strong><small>依次经历翻牌、转牌和河牌。</small></span></div>
              <div><b>03</b><span><strong>组合最佳五张牌</strong><small>与同学比大小，或下注让对手弃牌。</small></span></div>
            </div>
            <button className="primary-action" type="button" onClick={() => setShowRules(false)}>懂了，回到牌桌</button>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
