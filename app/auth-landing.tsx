import type { ChatGPTUser } from "./chatgpt-auth";

type AuthLandingProps = {
  user: ChatGPTUser | null;
  tablePath: string;
  signInPath: string;
  signUpPath?: string;
  roomCode?: string;
};

const demoSeats = [
  { label: "UTG", name: "阿清", className: "entry-seat-utg" },
  { label: "HJ", name: "小林", className: "entry-seat-hj" },
  { label: "CO", name: "小周", className: "entry-seat-co" },
  { label: "BTN", name: "房主", className: "entry-seat-btn" },
  { label: "SB", name: "小王", className: "entry-seat-sb" },
  { label: "BB", name: "你", className: "entry-seat-bb" },
];

export default function AuthLanding({ user, tablePath, signInPath, signUpPath, roomCode }: AuthLandingProps) {
  return (
    <main className="entry-page">
      <header className="entry-header">
        <a className="entry-brand" href="/" aria-label="同桌 Poker Night 首页"><span>♠</span><b>同桌</b><small>POKER NIGHT</small></a>
        <nav aria-label="首页导航"><a href="/lucky">线下娱乐转盘</a>{user && <a href="/profile">个人战绩</a>}<span>仅供朋友娱乐</span></nav>
      </header>

      <section className="entry-hero">
        <div className="entry-copy">
          <span className="entry-kicker">REAL-TIME PRIVATE TABLE</span>
          {roomCode && <div className="entry-invite"><i /> 同学邀请你加入房间 <b>{roomCode}</b></div>}
          <h1>先登录，<br />再和同学坐到同一桌。</h1>
          <p>每个邮箱对应独立账号。服务器随机洗牌、实时同步行动并自动结算，换设备登录后仍能找回自己的座位与牌局战绩。</p>

          {user ? (
            <>
              <div className="entry-signed-card">
                <span>{[...user.displayName].slice(0, 2).join("").toUpperCase()}</span>
                <div><small>当前已登录</small><b>{user.displayName}</b><em>{user.email}</em></div>
                <i>✓</i>
              </div>
              <div className="entry-account-guide"><b>要邀请同学一起玩？</b><span>把房间邀请链接发给同学，他们会用自己的邮箱注册 / 登录，不会进入你的账号。</span></div>
            </>
          ) : (
            <div className="entry-auth-note"><span>✦</span><p><b>本站独立账号</b><small>用邮箱 + 密码在本站注册专属账号，密码经单向加密存储，服务器不以明文保存或传输。</small></p></div>
          )}

          <div className="entry-actions">
            {user ? <>
              <a className="entry-primary" href={tablePath}>{roomCode ? `进入房间 ${roomCode}` : "进入牌桌大厅"}<span>→</span></a>
              <a className="entry-secondary" href="/profile">查看我的战绩</a>
            </> : <>
              <a className="entry-primary" href={signInPath}>登录已有账号<span>→</span></a>
              <a className="entry-secondary" href={signUpPath ?? signInPath}>注册新账号</a>
            </>}
          </div>
          {!user && <small className="entry-auth-help">两个入口都指向本站登录页；首次使用请选择“注册”，用邮箱 + 密码创建账号，完成后会自动返回同桌。</small>}

          <div className="entry-trust-row"><span><i>01</i><b>邮箱身份</b><small>一人一份独立资料</small></span><span><i>02</i><b>服务器发牌</b><small>设备间实时同步</small></span><span><i>03</i><b>长期战绩</b><small>逐手记录输赢</small></span></div>
        </div>

        <div className="entry-table-stage" aria-label="牌桌位置示意图">
          <div className="entry-table-glow" />
          <div className="entry-demo-table">
            <div className="entry-felt"><span>同桌</span><small>POSITIONS CLEARLY MARKED</small><div className="entry-board"><i>♠</i><i className="red">♥</i><i>♣</i></div><b>底池 240</b></div>
            {demoSeats.map((seat) => <div className={`entry-demo-seat ${seat.className}`} key={seat.label}><em>{seat.label}</em><span>{seat.name.slice(0, 1)}</span><b>{seat.name}</b><small>5,000</small></div>)}
          </div>
          <div className="entry-position-legend"><b>位置一眼看清</b><span>BTN 庄家</span><span>SB 小盲</span><span>BB 大盲</span><span>UTG 枪口位</span></div>
        </div>
      </section>

      <section className="entry-how">
        <div><span>HOW IT WORKS</span><h2>三步开始今晚的牌局</h2></div>
        <ol><li><i>1</i><span><b>登录或注册</b><small>使用自己的邮箱账号完成身份验证。</small></span></li><li><i>2</i><span><b>创建或加入房间</b><small>把房间码发给同学，不同设备都能进入。</small></span></li><li><i>3</i><span><b>坐下开始游戏</b><small>位置、行动、筹码和战绩由服务器统一同步。</small></span></li></ol>
      </section>

      <footer className="entry-footer"><span>♠ 同桌 Poker Night</span><p>娱乐筹码，无真实货币、充值、提现或支付功能。</p></footer>
    </main>
  );
}
