"use client";

import { ONLINE_PARTY_EFFECTS, ONLINE_PARTY_TRIGGERS } from "../lib/online-party";
import type { PartyTriggerId, PokerRoomMode } from "../lib/poker-types";

export default function PokerRulesModal({ mode, enabledTriggers, onClose }: {
  mode: PokerRoomMode;
  enabledTriggers: PartyTriggerId[];
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card rules-card party-rules-card" role="dialog" aria-modal="true" aria-label="牌桌规则">
        <button className="modal-close" type="button" onClick={onClose}>×</button>
        <span className="modal-kicker">{mode === "party" ? "ONLINE PARTY RULES" : "STANDARD HOLDEM RULES"}</span>
        <h2>{mode === "party" ? "娱乐德州规则" : "常规德州规则"}</h2>
        <div className="rule-list"><div><b>01</b><span><strong>服务器安全洗牌</strong><small>每手使用加密随机数重新洗 52 张牌，客户端无法取得牌堆或修改结果。</small></span></div><div><b>02</b><span><strong>严格轮流行动</strong><small>过牌、跟注、加注、全下和超时均由服务器验证；边池和七选五牌型自动结算。</small></span></div><div><b>03</b><span><strong>无真实货币</strong><small>筹码仅用于同学娱乐，没有充值、提现、支付或兑换功能。</small></span></div><div><b>04</b><span><strong>房主暂停牌局</strong><small>房主暂停后，自动发牌、机器人行动、玩家操作和所有倒计时同时冻结；恢复后从原剩余时间继续。</small></span></div></div>
        {mode === "party" && <><section className="rules-section"><h3>本桌自动触发条件</h3><p>只有房主启用的条件会生效。服务器在底池结算后读取真实底牌、公共牌、All-in 与筹码结果；满足条件的玩家自动获得 1 次转盘，每人最多储存 3 次。</p><div className="rules-trigger-grid">{ONLINE_PARTY_TRIGGERS.map((trigger) => <article className={enabledTriggers.includes(trigger.id) ? "enabled" : "disabled"} key={trigger.id}><span>{enabledTriggers.includes(trigger.id) ? "✓" : "—"}</span><div><b>{trigger.name}</b><small>{trigger.description}</small></div></article>)}</div></section><section className="rules-section"><h3>抽中以后怎么使用</h3><div className="party-use-rules"><div><b>1</b><span><strong>先进入技能栏</strong><small>主动技能不会立刻消失，会显示持有者、限定 Hand 和可使用时机。</small></span></div><div><b>2</b><span><strong>在窗口内点击</strong><small>例如换底牌只能在下一手翻牌前；Turn/River 重铸必须在对应公共牌发出前激活。</small></span></div><div><b>3</b><span><strong>服务器真实执行</strong><small>换牌、传牌、公开底牌、移交 Button 与公共牌重发都直接改变服务器牌局，不能由客户端伪造。</small></span></div><div><b>4</b><span><strong>全桌看到演出</strong><small>获得、激活、执行与过期均同步到牌桌中央；私密看牌只向技能持有者显示牌面。</small></span></div></div></section><section className="rules-section"><h3>转盘效果、时限与执行方式</h3><p>抽取结果由服务器按权重预先决定，动画不参与随机。主动技能由玩家选时机；自动效果和惩罚由服务器强制执行。</p><div className="rules-effect-grid">{ONLINE_PARTY_EFFECTS.map((effect) => <article key={effect.id}><span>{effect.emoji}</span><div><b>{effect.name}</b><small>{effect.description}</small></div><em className={effect.control}>{effect.control === "manual" ? "主动" : effect.control === "automatic" ? "自动" : "立即"}<small>{effect.useWindowLabel}</small></em></article>)}</div></section><section className="party-rule-warning"><b>时限、冲突与结算限制</b><p>除“免大盲”持续到下次坐大盲外，技能只在标明的下一手有效，错过按钮窗口会自动过期。同一手最多执行一个改变 Turn/River 的效果；第一张重铸公共牌永久作废，第二张必须接受。已经结算的底池绝不回滚。</p></section></>}
        <button className="primary-action" type="button" onClick={onClose}>我知道了</button>
      </section>
    </div>
  );
}
