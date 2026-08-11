"use client";

import { FormEvent, useState } from "react";

type Mode = "login" | "register";

type ClientProps = {
  initialMode: Mode;
  returnTo: string;
  roomCode?: string;
};

export default function LoginClient({ initialMode, returnTo, roomCode }: ClientProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const body =
      mode === "register"
        ? { email, password, displayName }
        : { email, password };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string; user?: { id: string; email: string; displayName: string } };
      if (!response.ok || !data.user) {
        setError(data.error || "操作失败，请重试");
        setBusy(false);
        return;
      }
      window.location.href = returnTo;
    } catch {
      setError("网络异常，请稍后重试");
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <a className="login-brand" href="/" aria-label="同桌 Poker Night 首页">
          <span>♠</span>
          <b>同桌</b>
          <small>POKER NIGHT</small>
        </a>

        {roomCode ? (
          <div className="login-invite">
            <i />
            同学邀请你加入房间 <b>{roomCode}</b>
          </div>
        ) : null}

        <div className="login-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "login-tab active" : "login-tab"}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "login-tab active" : "login-tab"}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            注册
          </button>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <label className="login-field">
              <span>昵称（可选）</span>
              <input
                type="text"
                value={displayName}
                maxLength={28}
                placeholder="同学都怎么称呼你"
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="nickname"
              />
            </label>
          ) : null}

          <label className="login-field">
            <span>邮箱</span>
            <input
              type="email"
              required
              value={email}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="login-field">
            <span>密码</span>
            <input
              type="password"
              required
              value={password}
              placeholder={mode === "register" ? "至少 6 位" : "输入你的密码"}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>

          {error ? <p className="login-error" role="alert">{error}</p> : null}

          <button type="submit" className="login-submit" disabled={busy}>
            {busy ? "处理中…" : mode === "register" ? "注册并进入" : "登录"}
          </button>
        </form>

        <p className="login-hint">
          {mode === "register"
            ? "注册即创建本站专属账号，密码经单向加密存储，服务器不会以明文保存或传输。"
            : "使用你注册的邮箱与密码登录；登录后把房间码发给同学，大家就能坐到同一桌。"}
        </p>
      </div>
    </main>
  );
}
