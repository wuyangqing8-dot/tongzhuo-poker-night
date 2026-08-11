"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthenticatedUser } from "../../lib/poker-types";
import type { PlayerProfile } from "../../lib/profile-types";

function initials(name: string) {
  return [...name.trim()].slice(0, 2).join("").toUpperCase() || "牌";
}

function chips(value: number, signed = false) {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${Math.round(value).toLocaleString("zh-CN")}`;
}

function shortDate(value: number) {
  return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ProfileClient({ user }: { user: AuthenticatedUser }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/profile", { credentials: "same-origin" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = "/signin-with-chatgpt?return_to=%2Fprofile";
          return null;
        }
        const data = await response.json() as { profile?: PlayerProfile; error?: string };
        if (!response.ok) throw new Error(data.error || "读取战绩失败");
        return data.profile ?? null;
      })
      .then((data) => { if (active && data) setProfile(data); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "读取战绩失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const chartHands = useMemo(() => [...(profile?.recentHands ?? [])].reverse().slice(-18), [profile]);
  const chartMax = Math.max(1, ...chartHands.map((hand) => Math.abs(hand.net)));

  if (loading) return <main className="profile-loading"><span>♠</span><b>正在整理你的牌局记录</b><i /></main>;

  return (
    <main className="profile-page">
      <header className="profile-topbar">
        <a className="profile-brand" href="/"><span>♠</span><b>同桌</b><small>PLAYER PROFILE</small></a>
        <nav><a href="/">返回牌桌</a><a href="/lucky">娱乐转盘</a><a href="/signout-with-chatgpt?return_to=/">退出账号</a></nav>
      </header>

      <section className="profile-shell">
        <div className="profile-identity">
          <div className="profile-avatar">{initials(user.displayName)}</div>
          <div><span className="profile-kicker">YOUR POKER STORY</span><h1>{user.displayName} 的牌局主页</h1><p>{user.email} · 每个登录账号拥有独立战绩</p></div>
          <span className="profile-account-badge"><i /> 邮箱账号已验证</span>
        </div>

        {error && <div className="profile-error">{error}<button type="button" onClick={() => window.location.reload()}>重新加载</button></div>}

        {profile && <>
          <section className="profile-metrics" aria-label="战绩概览">
            <article className={profile.summary.totalNet >= 0 ? "metric-positive" : "metric-negative"}><small>累计输赢</small><strong>{chips(profile.summary.totalNet, true)}</strong><span>娱乐筹码</span></article>
            <article><small>完成手牌</small><strong>{profile.summary.totalHands}</strong><span>{profile.summary.rooms} 个牌局</span></article>
            <article><small>赢池率</small><strong>{profile.summary.winRate}%</strong><span>{profile.summary.wins} 次赢池</span></article>
            <article><small>最佳一手</small><strong>{chips(profile.summary.bestHand, true)}</strong><span>最大结束筹码 {chips(profile.summary.biggestEndingStack)}</span></article>
          </section>

          <div className="profile-dashboard-grid">
            <section className="profile-panel performance-panel">
              <div className="profile-panel-title"><div><span>近期走势</span><small>最近 {chartHands.length} 手净输赢</small></div><b className={profile.summary.currentWinStreak ? "streak-active" : ""}>连胜 {profile.summary.currentWinStreak}</b></div>
              {chartHands.length ? <div className="profile-chart" aria-label="近期每手输赢柱状图"><div className="chart-zero" />{chartHands.map((hand) => <div className="chart-column" key={hand.id} title={`Hand #${hand.handNumber}：${chips(hand.net, true)}`}><span className={hand.net >= 0 ? "win" : "loss"} style={{ height: `${Math.max(7, Math.round((Math.abs(hand.net) / chartMax) * 72))}px` }} /><small>H{hand.handNumber}</small></div>)}</div> : <div className="profile-empty-mini"><span>♤</span><p>完成第一手牌后，这里会出现输赢走势。</p></div>}
              <div className="performance-footer"><span><i className="win-dot" />盈利手牌</span><span><i className="loss-dot" />亏损手牌</span><strong>最差一手 {chips(profile.summary.worstHand, true)}</strong></div>
            </section>

            <section className="profile-panel rooms-panel">
              <div className="profile-panel-title"><div><span>最近牌局</span><small>按房间汇总</small></div><a href="/">加入新牌局 →</a></div>
              <div className="profile-room-list">{profile.rooms.length ? profile.rooms.slice(0, 6).map((room) => <article key={room.roomId}><span className={`room-mode-icon ${room.roomMode}`}>{room.roomMode === "party" ? "🎡" : "♠"}</span><div><b>{room.roomName}</b><small>{room.roomCode} · {room.hands} 手 · {shortDate(room.lastPlayedAt)}</small></div><strong className={room.net > 0 ? "net-win" : room.net < 0 ? "net-loss" : "net-even"}>{chips(room.net, true)}</strong></article>) : <div className="profile-empty-mini"><span>◇</span><p>还没有已结算的牌局。</p></div>}</div>
            </section>
          </div>

          <section className="profile-panel history-panel">
            <div className="profile-panel-title"><div><span>手牌历史</span><small>仅显示你自己的结果</small></div><em>刷新页面可同步最新结算</em></div>
            {profile.recentHands.length ? <div className="profile-history-table"><div className="history-head"><span>牌局</span><span>手牌</span><span>结果</span><span>结束筹码</span><span>时间</span></div>{profile.recentHands.map((hand) => <article key={hand.id}><span><b>{hand.roomName}</b><small>{hand.roomMode === "party" ? "娱乐德州" : "常规德州"} · {hand.roomCode}</small></span><span>Hand #{hand.handNumber}</span><strong className={hand.net > 0 ? "net-win" : hand.net < 0 ? "net-loss" : "net-even"}>{chips(hand.net, true)}</strong><span>{chips(hand.endingChips)}</span><time>{shortDate(hand.completedAt)}</time><p>{hand.resultText}</p></article>)}</div> : <div className="profile-empty"><span>♠</span><h2>你的牌局故事还没开始</h2><p>创建或加入一个房间，完成结算后，输赢、胜率和历史会自动记录到当前邮箱账号。</p><a href="/">去牌桌玩一手</a></div>}
          </section>
        </>}
        <footer className="profile-footer">所有筹码仅用于朋友娱乐，不包含充值、提现或真实货币结算。</footer>
      </section>
    </main>
  );
}
