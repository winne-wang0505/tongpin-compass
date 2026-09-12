import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BRAND,
  dimensions,
  keys,
  defaultPref,
  match,
  type Key,
  type Snapshot,
} from "../shared/domain";
import "./style.css";
const locale = {
  "zh-CN": {
    dashboard: "我的工作台",
    profile: "我的资料",
    preferences: "择偶偏好",
    settings: "设置与数据",
  },
};
const t = locale["zh-CN"];
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || data.message || "操作未完成，请重试");
  return data;
}
const go = (path: string) => location.assign(path);
const statusNames: Record<string, string> = {
  pending: "待接受",
  accepted: "已接受 · 待双方同意",
  awaiting_consent: "待另一方同意",
  ready: "双方已同意",
  complete: "已完成",
  revoked: "已撤销",
  expired: "已过期",
};
const importanceNames: Record<string, string> = {
  must: "必须满足",
  prefer: "偏好",
  flexible: "可以协商",
  unsure: "尚未确定",
};
function useData(path: string) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  const reload = () =>
    api(path)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => {
        setData(null);
        setError(e.message);
      });
  useEffect(() => {
    reload();
  }, [path]);
  return { data, error, reload };
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice" role="status">
      {children}
    </div>
  );
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
function Action({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => Promise<unknown>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onClick();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "处理中…" : children}
      </button>
      <ErrorBox message={error} />
    </>
  );
}
function App() {
  const config = useData("/config"),
    me = useData("/me");
  const path = location.pathname;
  useEffect(() => {
    document.title = BRAND.name;
  }, []);
  return (
    <>
      <header>
        <a className="brand" href="/">
          <img src="/favicon.svg" alt="" />
          {BRAND.short}
          <span>COMPASS</span>
        </a>
        <nav aria-label="主导航">
          {me.data ? (
            <>
              <a href="/dashboard">{t.dashboard}</a>
              <a href="/profile">{t.profile}</a>
              <a href="/preferences">{t.preferences}</a>
              <a href="/settings">设置</a>
            </>
          ) : (
            <a href="/login">登录</a>
          )}
        </nav>
      </header>
      {config.data?.mode === "demo" && (
        <div className="mode-banner">
          独立 Demo · 虚构成人资料 · 模拟 AI · 不用于真实关系判断
        </div>
      )}
      <main>
        {path === "/" ? (
          <Home />
        ) : path === "/login" ||
          path === "/register" ||
          path === "/forgot" ||
          path === "/reset" ? (
          <AuthPage path={path} config={config.data} />
        ) : path === "/privacy" || path === "/terms" ? (
          <Legal terms={path === "/terms"} config={config.data} />
        ) : path === "/example" ? (
          <Example />
        ) : !me.data ? (
          <section className="card narrow">
            <h1>{me.error ? "请先登录" : "正在加载…"}</h1>
            {me.error && (
              <>
                <p>个人资料和邀请仅登录后可见。</p>
                <a
                  className="button"
                  href={`/login?next=${encodeURIComponent(path + location.search + location.hash)}`}
                >
                  登录或注册
                </a>
              </>
            )}
          </section>
        ) : path === "/dashboard" ? (
          <Dashboard me={me.data} />
        ) : path === "/profile" || path === "/preferences" ? (
          <Editor
            key={path}
            me={me.data}
            preference={path === "/preferences"}
          />
        ) : path.startsWith("/invite/") ? (
          <Invitation
            id={path.split("/")[2]}
            me={me.data}
            config={config.data}
          />
        ) : path === "/join" ? (
          <Join />
        ) : path.startsWith("/report/") ? (
          <Report id={path.split("/")[2]} config={config.data} />
        ) : path === "/settings" ? (
          <Settings me={me.data} config={config.data} />
        ) : (
          <section>
            <h1>页面不存在</h1>
            <a href="/dashboard">回到工作台</a>
          </section>
        )}
      </main>
      <footer>
        <span>{BRAND.name} · 了解差异，尊重选择</span>
        <div>
          <a href="/privacy">隐私说明</a>
          <a href="/terms">使用条款</a>
          {config.data?.contact ? (
            <a href={`mailto:${config.data.contact}`}>联系产品方</a>
          ) : (
            <span>产品联系入口待上线前配置</span>
          )}
        </div>
      </footer>
    </>
  );
}
function Home() {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">一份邀请 · 两个视角</p>
          <h1>
            先了解自己，
            <br />
            再认真了解彼此。
          </h1>
          <p className="lead">
            梳理真正重要的期待，把相处中的差异，变成可以坦诚讨论的问题。
          </p>
          <div className="actions">
            <a className="button" href="/register">
              开始梳理我的期待
            </a>
            <a href="/example">看看示例报告 ↗</a>
          </div>
          <p className="muted">
            仅限 18 岁及以上 · 资料默认私密 · 双方同意后分析
          </p>
        </div>
        <div className="hero-report">
          <div className="report-top">
            <span>一次对话的起点</span>
            <span className="pill">示例</span>
          </div>
          <h2>
            有相同的期待，
            <br />
            也留出不同的空间。
          </h2>
          <div className="insight">
            <span className="symbol">≈</span>
            <div>
              <strong>关系目标有共识</strong>
              <p>都希望认真地了解一段关系</p>
            </div>
          </div>
          <div className="insight">
            <span className="symbol amber">↔</span>
            <div>
              <strong>联系频率值得聊聊</strong>
              <p>怎样兼顾陪伴与各自的空间？</p>
            </div>
          </div>
          <div className="insight">
            <span className="symbol gray">?</span>
            <div>
              <strong>未知不代表不合适</strong>
              <p>没有填写的事情，留给下一次对话</p>
            </div>
          </div>
          <a href="/example">打开完整示例 →</a>
        </div>
      </section>
      <section className="steps">
        <article>
          <span>01 / 自己</span>
          <h3>分清期待的轻重</h3>
          <p>必须满足、偏好、可协商，或还没有答案，都可以。</p>
        </article>
        <article>
          <span>02 / 彼此</span>
          <h3>发出一份私密邀请</h3>
          <p>分别填写，分别选择分享内容。邀请链接不能查看资料。</p>
        </article>
        <article>
          <span>03 / 对话</span>
          <h3>带着具体问题交流</h3>
          <p>看到两个方向的满足情况、差异与未知，不给人排名。</p>
        </article>
      </section>
      <Notice>
        这里不预测恋爱或婚姻成功率，也不判断一个人的价值。你始终可以撤回分享授权。
      </Notice>
    </>
  );
}
function AuthPage({ path, config }: { path: string; config: any }) {
  const register = path === "/register",
    forgot = path === "/forgot",
    reset = path === "/reset";
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const next = new URLSearchParams(location.search).get("next") || "/dashboard";
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return (
    <section className="card narrow">
      <p className="eyebrow">留一点时间，认真认识彼此</p>
      <h1>
        {register
          ? "创建自己的账号"
          : forgot
            ? "找回密码"
            : reset
              ? "设置新密码"
              : "欢迎回来"}
      </h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            if (forgot) {
              await api("/auth/request-password-reset", "POST", {
                email: f.get("email"),
                redirectTo: location.origin + "/reset",
              });
              setMessage(
                "请求已提交。若账号存在且邮件投递成功，你将收到重置链接。",
              );
            } else if (reset) {
              await api("/auth/reset-password", "POST", {
                newPassword: f.get("password"),
                token: new URLSearchParams(location.search).get("token"),
              });
              setMessage("密码已更新，请重新登录。");
            } else {
              const out = await api(
                register ? "/auth/sign-up/email" : "/auth/sign-in/email",
                "POST",
                {
                  email: f.get("email"),
                  password: f.get("password"),
                  ...(register
                    ? {
                        name: f.get("name") || "同频用户",
                        adultDeclared: f.get("adult") === "on",
                      }
                    : {}),
                },
              );
              if (register && !out.token) {
                setMessage("注册请求已提交，请查收邮箱验证链接，然后登录。");
              } else go(safeNext);
            }
          } catch (err: any) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {register && (
          <label>
            昵称（不必使用真实姓名）
            <input
              name="name"
              maxLength={40}
              required
              autoComplete="nickname"
            />
          </label>
        )}
        {!reset && (
          <label>
            邮箱
            <input name="email" type="email" required autoComplete="email" />
          </label>
        )}
        {!forgot && (
          <label>
            {reset ? "新密码" : "密码"}
            <input
              name="password"
              aria-label={reset ? "新密码" : "密码"}
              type="password"
              minLength={12}
              maxLength={128}
              required
              autoComplete={
                register || reset ? "new-password" : "current-password"
              }
            />
            <small>至少 12 个字符，建议使用独立的长密码。</small>
          </label>
        )}
        {register && (
          <label className="check">
            <input type="checkbox" name="adult" required />
            <span>
              我声明已满 18 岁，并同意
              <a href="/terms" target="_blank">
                使用条款
              </a>
              与
              <a href="/privacy" target="_blank">
                隐私说明
              </a>
              。这不代表身份核验。
            </span>
          </label>
        )}
        <ErrorBox message={error} />
        {message && <Notice>{message}</Notice>}
        <button disabled={busy || (forgot && !config?.mailReady)}>
          {busy
            ? "正在处理…"
            : forgot
              ? "请求重置链接"
              : reset
                ? "更新密码"
                : register
                  ? "创建账号"
                  : "登录"}
        </button>
        {forgot && !config?.mailReady && (
          <Notice>
            当前环境未配置邮件服务，无法发送恢复邮件。不会显示“已发送”。
          </Notice>
        )}
      </form>
      <div className="auth-links">
        <a
          href={
            register
              ? `/login?next=${encodeURIComponent(safeNext)}`
              : `/register?next=${encodeURIComponent(safeNext)}`
          }
        >
          {register ? "已有账号？登录" : "还没有账号？注册"}
        </a>
        <a href="/forgot">忘记密码</a>
        {reset && <a href="/login">返回登录</a>}
      </div>
    </section>
  );
}
function Dashboard({ me }: { me: any }) {
  const filled = Object.values(me.profile.values).filter(
    (v) => v !== null && v !== "" && (!Array.isArray(v) || v.length),
  ).length;
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">只在你准备好时，分享</p>
          <h1>你好，{me.user.name}</h1>
          <p>从自己的期待出发，开启一次认真了解。</p>
        </div>
        <span className="pill">私人工作台</span>
      </div>
      <div className="grid two">
        <section className="card">
          <div className="card-heading">
            <h2>先整理我的想法</h2>
            <span>
              {filled}/{keys.length}
            </span>
          </div>
          <progress value={filled} max={keys.length} />
          <p>资料可以跳过。不填写的部分会标为未知，而不是不匹配。</p>
          <div className="actions">
            <a className="button" href="/profile">
              {filled ? "继续填写资料" : "填写我的资料"}
            </a>
            <a href="/preferences">整理择偶偏好 →</a>
          </div>
        </section>
        <section className="card tinted">
          <h2>邀请一个你想了解的人</h2>
          <p>邀请有效期 7 天。对方注册并接受后，你们再分别选择分享的内容。</p>
          <p className="muted">
            此时对方看不到你的资料、偏好或邮箱；之后仅看到双方授权字段的匹配结果。
          </p>
          <Action
            onClick={async () => {
              const x = await api("/invitations", "POST", {});
              sessionStorage.setItem(
                `invite-${x.id}`,
                `${location.origin}/join#${x.token}`,
              );
              go(`/invite/${x.id}`);
            }}
          >
            创建私密邀请
          </Action>
        </section>
      </div>
      <div className="section-heading">
        <h2>邀请与报告</h2>
        <span>每一次授权，单独记录</span>
      </div>
      {!me.invitations.length ? (
        <section className="empty">
          <span className="empty-icon">↗</span>
          <h3>还没有发出邀请</h3>
          <p>可以先填资料，也可以先创建邀请，之后再决定分享什么。</p>
        </section>
      ) : (
        <div className="invite-list">
          {me.invitations.map((i: any) => (
            <a className="invite-row" key={i.id} href={`/invite/${i.id}`}>
              <div>
                <strong>
                  {i.role === "owner" ? "我发起的邀请" : "我接受的邀请"}
                </strong>
                <small>
                  {new Date(i.createdAt).toLocaleDateString("zh-CN")} ·{" "}
                  {i.id.slice(0, 8)}
                </small>
              </div>
              <span className="pill">{statusNames[i.status]}</span>
              <span>查看 →</span>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
function Editor({ me, preference }: { me: any; preference: boolean }) {
  const [values, setValues] = useState<any>(
    structuredClone(preference ? me.preferences.values : me.profile.values),
  );
  const [step, setStep] = useState(0),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  const version = useRef(preference ? me.preferenceVersion : me.profileVersion);
  const serial = useRef(0),
    lock = useRef(false);
  const groups = [
    dimensions.slice(0, 3),
    dimensions.slice(3, 5),
    dimensions.slice(5),
  ];
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    const seq = serial.current;
    try {
      const x = await api(preference ? "/preferences" : "/profile", "PUT", {
        version: version.current,
        data: preference ? { values } : { adult: true, values },
      });
      version.current = x.version;
      setSaved("已保存到账号");
      setError("");
      if (seq === serial.current) setDirty(false);
    } catch (e: any) {
      setError(e.message);
      setSaved("");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!dirty || error) return;
    const timer = setTimeout(save, 800);
    return () => clearTimeout(timer);
  }, [values, dirty, saving, error]);
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  const update = (k: Key, v: any) => {
    serial.current++;
    setError("");
    setValues({ ...values, [k]: v });
    setDirty(true);
    setSaved("等待保存…");
  };
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">
            {preference ? "对伴侣的期待" : "关于我自己的情况"}
          </p>
          <h1>{preference ? "什么对我很重要？" : "让彼此了解真实的你"}</h1>
          <p>
            {preference
              ? "这页填写对方可以是什么样，而不是你自己是什么样。"
              : "每一项都可以跳过。未知会减少报告覆盖率，但不计为不满足。"}
          </p>
        </div>
        <span className="save-state" aria-live="polite">
          {saving ? "保存中…" : saved || "资料默认私密"}
        </span>
      </div>
      <div className="editor-layout">
        <aside>
          <div className="step-nav">
            {["基本期待", "生活与沟通", "共同生活"].map((g, i) => (
              <button
                className={step === i ? "selected" : ""}
                key={g}
                onClick={() => setStep(i)}
              >
                <span>0{i + 1}</span>
                {g}
              </button>
            ))}
          </div>
          <p className="muted">
            填写不等于分享。
            <br />
            在每一份邀请中，你还可以单独选择授权字段。
          </p>
        </aside>
        <section className="card editor">
          <p className="eyebrow">{step + 1} / 3</p>
          {groups[step].map((d) => (
            <div className="dimension" key={d.key}>
              <h2>{d.label}</h2>
              {"help" in d && <p className="muted">{d.help}</p>}
              {preference ? (
                <PreferenceField
                  d={d}
                  value={values[d.key] || defaultPref()}
                  onChange={(v) => update(d.key, v)}
                />
              ) : (
                <ValueField
                  d={d}
                  value={values[d.key]}
                  onChange={(v) => update(d.key, v)}
                />
              )}
            </div>
          ))}
          <ErrorBox message={error} />
          <div className="actions">
            <button disabled={saving} onClick={save}>
              {saving ? "保存中…" : "保存这一页"}
            </button>
            {step < 2 ? (
              <button className="secondary" onClick={() => setStep(step + 1)}>
                下一步 →
              </button>
            ) : (
              <a href={preference ? "/dashboard" : "/preferences"}>
                {preference ? "返回工作台" : "继续填写择偶偏好 →"}
              </a>
            )}
          </div>
          <p className="muted">更改后自动保存；提示“已保存到账号”后可离开。</p>
        </section>
      </div>
    </>
  );
}
function ValueField({
  d,
  value,
  onChange,
}: {
  d: any;
  value: any;
  onChange: (v: any) => void;
}) {
  if (d.kind === "number" || d.kind === "scale")
    return (
      <label>
        {d.kind === "number" ? "我的年龄" : "我的联系频率"}
        <input
          type="number"
          min={d.min}
          max={d.max}
          value={value ?? ""}
          placeholder="暂不填写"
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      </label>
    );
  if (d.kind === "text")
    return (
      <label>
        我的城市
        <input
          value={value || ""}
          placeholder="例如：杭州；也可以留空"
          maxLength={80}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  if (d.kind === "set")
    return (
      <div className="choices">
        {d.options.map((o: string) => (
          <label className="chip" key={o}>
            <input
              type="checkbox"
              checked={(value || []).includes(o)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...(value || []), o]
                    : (value || []).filter((x: string) => x !== o),
                )
              }
            />
            {o}
          </label>
        ))}
      </div>
    );
  return (
    <label>
      我的情况
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">尚不确定 / 暂不透露</option>
        {d.options.map((o: string) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function PreferenceField({
  d,
  value: p,
  onChange,
}: {
  d: any;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <>
      <label>
        对我有多重要
        <select
          value={p.importance}
          onChange={(e) => onChange({ ...p, importance: e.target.value })}
        >
          {Object.entries(importanceNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      {p.importance !== "unsure" && (
        <>
          <div className="preference-range">
            {d.kind === "number" || d.kind === "scale" ? (
              <div className="grid two">
                <label>
                  可接受的最低值
                  <input
                    type="number"
                    min={d.min}
                    max={d.max}
                    value={p.min ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...p,
                        min:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  可接受的最高值
                  <input
                    type="number"
                    min={d.min}
                    max={d.max}
                    value={p.max ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...p,
                        max:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
            ) : d.kind === "text" ? (
              <label>
                可接受城市（用顿号分开）
                <input
                  value={p.accepted.join("、")}
                  maxLength={160}
                  onChange={(e) =>
                    onChange({
                      ...p,
                      accepted: e.target.value
                        .split(/[、,，]/)
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            ) : (
              <>
                <p>
                  可以接受的情况
                  {d.kind === "set" ? "（至少一个共同兴趣即可）" : ""}
                </p>
                <div className="choices">
                  {d.options.map((o: string) => (
                    <label className="chip" key={o}>
                      <input
                        type="checkbox"
                        checked={p.accepted.includes(o)}
                        onChange={(e) =>
                          onChange({
                            ...p,
                            accepted: e.target.checked
                              ? [...p.accepted, o]
                              : p.accepted.filter((x: string) => x !== o),
                          })
                        }
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="grid two">
            <label>
              关注程度
              <select
                value={p.weight}
                onChange={(e) =>
                  onChange({ ...p, weight: Number(e.target.value) })
                }
              >
                <option value={1}>一般关注</option>
                <option value={2}>比较关注</option>
                <option value={3}>重点关注</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={p.allowUnknown}
                onChange={(e) =>
                  onChange({ ...p, allowUnknown: e.target.checked })
                }
              />
              <span>可以暂时不了解对方这一项</span>
            </label>
          </div>
          {p.importance === "must" && (
            <small>已知的不满足会单独标为边界冲突，不被其他符合项抵消。</small>
          )}
        </>
      )}
    </>
  );
}
function Join() {
  const [token, setToken] = useState(() => location.hash.slice(1));
  return (
    <section className="card narrow">
      <p className="eyebrow">一份邀请，一个新的视角</p>
      <h1>接受私密邀请</h1>
      <p>接受只建立邀请关系，不会分享资料。你可以先填资料，然后单独授权。</p>
      <label>
        邀请令牌
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
      </label>
      <Action
        onClick={async () => {
          const x = await api("/invitations/accept", "POST", { token });
          history.replaceState(null, "", "/join");
          go(`/invite/${x.id}`);
        }}
      >
        接受邀请
      </Action>
    </section>
  );
}
function describe(v: any) {
  return v == null || v === "" || (Array.isArray(v) && !v.length)
    ? "未填写"
    : Array.isArray(v)
      ? v.join("、")
      : String(v);
}
function describePref(p: any) {
  if (!p || p.importance === "unsure") return "尚未确定";
  return `${importanceNames[p.importance]} · ${p.min !== undefined ? `${p.min}–${p.max}` : p.accepted.join("、")} · ${["", "一般", "比较", "重点"][p.weight]}关注 · ${p.allowUnknown ? "允许未知" : "希望先了解"}`;
}
function Invitation({ id, me, config }: { id: string; me: any; config: any }) {
  const { data: i, error, reload } = useData(`/invitations/${id}`);
  const [fields, setFields] = useState<Key[]>([]),
    [ai, setAI] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    const timer = setInterval(reload, 10000);
    return () => clearInterval(timer);
  }, [id]);
  if (error) return <ErrorBox message={error} />;
  if (!i) return <p>正在加载邀请…</p>;
  const link = sessionStorage.getItem(`invite-${id}`);
  const closed = ["revoked", "expired"].includes(i.status);
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">邀请 / {id.slice(0, 8)}</p>
          <h1>分享之前，先看清楚</h1>
          <p>
            邀请有效至 {new Date(i.expiresAt).toLocaleString("zh-CN")} ·
            报告生成后，在授权撤回前可以访问。
          </p>
        </div>
        <span className="pill">{statusNames[i.status]}</span>
      </div>
      {i.role === "owner" && i.status === "pending" && (
        <section className="card">
          <h2>把邀请链接交给对方</h2>
          <Notice>
            对方将先看到接受邀请页面。链接不含你的个人信息，也不能用来查看资料。双方分别授权后，只展示授权维度的双向结果、差异、未知和讨论问题；不展示邮箱。
          </Notice>
          {link ? (
            <>
              <label>
                私密邀请链接
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <Action
                className="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? "链接已复制" : "复制邀请链接"}
              </Action>
            </>
          ) : (
            <p>
              出于安全考虑，完整令牌不会从服务器重新读取。如果已丢失链接，请撤销此邀请并重新创建。
            </p>
          )}
        </section>
      )}
      {closed ? (
        <Notice>
          此邀请已失效。对应共享报告无法继续访问。你可以从工作台创建新邀请。
        </Notice>
      ) : i.status === "complete" ? (
        <section className="card">
          <h2>双方已完成这次授权</h2>
          <p>
            这份报告对应授权时的资料快照。修改资料后，需要新邀请和新的双方授权才能重新分析。
          </p>
          <a className="button" href={`/report/${i.reportId}`}>
            查看匹配报告
          </a>
        </section>
      ) : (
        <section className="card">
          <h2>我的分享预览</h2>
          <p>
            每个勾选项同时分享“我的情况”和“我的择偶偏好”。对方会在报告中直接看到这些内容，并用于双向匹配。未勾选项不会进入共享报告，也不影响共享覆盖率。
          </p>
          {i.ownConsent ? (
            <>
              <Notice>你已同意这份快照。等待另一方完成后即可生成报告。</Notice>
              <Preview
                fields={i.ownConsent.fields}
                profile={i.ownConsent.profile}
                preferences={i.ownConsent.preferences}
              />
            </>
          ) : (
            <>
              <div className="choices">
                {dimensions.map((d) => (
                  <label className="chip" key={d.key}>
                    <input
                      type="checkbox"
                      checked={fields.includes(d.key)}
                      onChange={(e) =>
                        setFields(
                          e.target.checked
                            ? [...fields, d.key]
                            : fields.filter((x) => x !== d.key),
                        )
                      }
                    />
                    {d.label}
                  </label>
                ))}
              </div>
              <Preview
                fields={fields}
                profile={me.profile}
                preferences={me.preferences}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={ai}
                  onChange={(e) => setAI(e.target.checked)}
                />
                <span>
                  允许服务器把本次授权维度的计算结果交给 AI
                  服务生成解释和问题，不包含邮箱或未授权字段。
                  {config?.aiProvider
                    ? `服务方：${config.aiProvider}。`
                    : "服务方尚未配置。"}
                  {config?.aiPrivacyUrl && (
                    <a
                      href={config.aiPrivacyUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      查看服务方隐私政策
                    </a>
                  )}
                  {config?.aiMode === "disabled"
                    ? "当前 AI 未配置，仍可生成规则报告。"
                    : ""}
                </span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  我已核对上述内容，同意对方查看基于这些内容的报告；随时可以撤回。
                </span>
              </label>
              {i.status === "pending" ? (
                <Notice>等待对方接受邀请后，你才可以提交授权。</Notice>
              ) : (
                <Action
                  onClick={async () => {
                    if (!confirmed || !fields.length)
                      throw Error("请先勾选分享字段，并确认授权");
                    await api(`/invitations/${id}/consent`, "POST", {
                      fields,
                      ai,
                      confirmed,
                      profileVersion: me.profileVersion,
                      preferenceVersion: me.preferenceVersion,
                    });
                    reload();
                  }}
                >
                  同意本次分享
                </Action>
              )}
            </>
          )}
          {i.status === "ready" && (
            <div className="actions">
              <Action
                onClick={async () => {
                  const r = await api(`/invitations/${id}/report`, "POST", {});
                  go(`/report/${r.id}`);
                }}
              >
                生成双向匹配报告
              </Action>
            </div>
          )}
        </section>
      )}
      {!closed && (
        <section className="card danger-zone">
          <h2>保持对分享的控制</h2>
          <p>
            撤回后，双方都不能在应用中打开这份报告。对方已经保存的截图或副本无法自动收回。
          </p>
          <Action
            className="danger"
            onClick={async () => {
              if (!confirm("撤销此邀请并撤回授权？双方将无法再打开对应报告。"))
                return;
              await api(`/invitations/${id}/revoke`, "POST", {});
              sessionStorage.removeItem(`invite-${id}`);
              reload();
            }}
          >
            撤销邀请 / 撤回授权
          </Action>
        </section>
      )}
    </>
  );
}
function Preview({
  fields,
  profile,
  preferences,
}: {
  fields: Key[];
  profile: any;
  preferences: any;
}) {
  return fields.length ? (
    <div className="preview">
      {dimensions
        .filter((d) => fields.includes(d.key))
        .map((d) => (
          <div className="preview-row" key={d.key}>
            <strong>{d.label}</strong>
            <div>
              <span>我的情况：{describe(profile.values[d.key])}</span>
              <span>我的期待：{describePref(preferences.values[d.key])}</span>
            </div>
          </div>
        ))}
    </div>
  ) : (
    <Notice>尚未选择分享内容；默认全部私密。</Notice>
  );
}
function Report({ id, config }: { id: string; config: any }) {
  const { data: r, error, reload } = useData(`/reports/${id}`);
  useEffect(() => {
    const timer = setInterval(reload, 10000);
    const check = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [id]);
  if (error)
    return (
      <>
        <h1>无法访问这份报告</h1>
        <ErrorBox message={error} />
        <a href="/dashboard">回到工作台</a>
      </>
    );
  if (!r) return <p>正在加载报告…</p>;
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">一次授权 · 双向了解 · 你是 {r.role}</p>
          <h1>把差异，变成对话</h1>
          <p>
            {new Date(r.created_at).toLocaleString("zh-CN")} · 规则{" "}
            {r.data.rule.version}
          </p>
        </div>
        <span className="pill">{r.historical ? "历史版本" : "授权快照"}</span>
      </div>
      {r.historical && (
        <Notice>
          一方资料已更新。这份报告保持原样；重新匹配需创建新邀请并分别授权。
        </Notice>
      )}
      <section className="card">
        <h2>双方明确授权的资料</h2>
        <p>
          A 是邀请发起人，B
          是接受邀请的人。这里只展示各自提交授权时勾选的内容；邮箱和未授权字段不会显示。
        </p>
        <div className="grid two">
          {(["A", "B"] as const).map((side) => (
            <div className="shared-person" key={side}>
              <h3>
                {side} 的资料{r.role === side ? "（我）" : "（对方）"}
              </h3>
              {r.sharedProfiles[side].fields.map((key: Key) => {
                const dimension = dimensions.find((item) => item.key === key)!;
                return (
                  <div className="shared-row" key={key}>
                    <strong>{dimension.label}</strong>
                    <span>
                      本人情况：
                      {describe(r.sharedProfiles[side].profile.values[key])}
                    </span>
                    <span>
                      对伴侣的期待：
                      {describePref(
                        r.sharedProfiles[side].preferences.values[key],
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <ReportContent result={r.data} />
      <section className="card">
        <h2>
          AI 对话建议{" "}
          <span className="pill">
            {config?.aiMode === "mock" ? "模拟 AI" : "AI 生成"}
          </span>
        </h2>
        <p>
          AI 不计算基础结果，也不能判断对方是否爱你、是否忠诚或预测关系结果。
        </p>
        {r.ai_data ? (
          <>
            <div className="grid two">
              {[
                ["agreements", "一致点"],
                ["differences", "值得讨论"],
                ["unknowns", "信息不足"],
              ].map(([k, label]) => (
                <div key={k}>
                  <h3>{label}</h3>
                  {r.ai_data[k].length ? (
                    r.ai_data[k].map((v: any, n: number) => (
                      <p key={n}>{v.text}</p>
                    ))
                  ) : (
                    <p className="muted">没有新增说明</p>
                  )}
                </div>
              ))}
            </div>
            <ol className="questions">
              {r.ai_data.questions.map((q: string, i: number) => (
                <li key={i}>{q}</li>
              ))}
            </ol>
            <p className="muted">{r.ai_data.boundary}</p>
          </>
        ) : !r.aiAllowed ? (
          <Notice>至少一方未授权 AI；规则报告完整可用。</Notice>
        ) : (
          <>
            <Notice>
              {config?.aiMode === "disabled"
                ? "AI 服务尚未配置，以下规则结果不受影响。"
                : r.ai_state === "failed"
                  ? "上次分析未成功，规则报告已保存。"
                  : "双方已授权 AI。每份报告最多发起两次分析，重复点击不会重复创建任务。"}
            </Notice>
            <Action
              className="secondary"
              onClick={async () => {
                await api(`/reports/${id}/ai`, "POST", {});
                reload();
              }}
            >
              生成 AI 讨论问题
            </Action>
          </>
        )}
      </section>
      <details className="card">
        <summary>计算与版本说明</summary>
        <p>
          满足率仅代表本次已知偏好的满足程度，不是恋爱或婚姻成功率。权重由重要性与关注程度相乘；未知和可协商项不算不满足。至少
          3 个已知维度且覆盖率达到 60% 才显示满足率。未分享字段不参与报告。
        </p>
        <p>
          A：资料 v{r.versions.a.profile} / 偏好 v{r.versions.a.preference} /
          授权 v{r.versions.a.consent}
        </p>
        <p>
          B：资料 v{r.versions.b.profile} / 偏好 v{r.versions.b.preference} /
          授权 v{r.versions.b.consent}
        </p>
      </details>
      <div className="actions">
        <a href={`/invite/${r.invitation_id}`}>管理这次授权</a>
        <Action
          className="danger"
          onClick={async () => {
            if (!confirm("删除共享报告并关闭此邀请？双方都将无法再次查看。"))
              return;
            await api(`/reports/${id}`, "DELETE", {});
            go("/dashboard");
          }}
        >
          删除共享报告
        </Action>
      </div>
    </>
  );
}
function ReportContent({ result: r }: { result: any }) {
  return (
    <>
      <Notice>
        不为人打分，只看本次已填写且已授权的期待。未知不等于不适合，边界冲突需要单独讨论。
      </Notice>
      <div className="grid two">
        {[
          ["ab", "A 对 B 的偏好满足情况"],
          ["ba", "B 对 A 的偏好满足情况"],
        ].map(([k, label]) => (
          <section className="card" key={k}>
            <p className="eyebrow">{label}</p>
            <div className="metric">
              {r[k].score === null ? "暂不汇总" : `${r[k].score}%`}
              <span>
                {r[k].score === null
                  ? "信息不足以展示满足率"
                  : "已知偏好满足率"}
              </span>
            </div>
            <div className="coverage">
              <span>信息覆盖率 {r[k].coverage}%</span>
              <span>{r[k].known} 项已知</span>
            </div>
            <progress value={r[k].coverage} max={100} />
            {r[k].boundaries.length > 0 && (
              <div className="boundary">
                有 {r[k].boundaries.length} 项明确边界冲突，需要单独讨论。
              </div>
            )}
            {r[k].items.length ? (
              r[k].items.map((item: any) => (
                <div className="result-item" key={item.key}>
                  <div>
                    <strong>{item.label}</strong>
                    <span className={`pill ${item.status}`}>
                      {item.boundary
                        ? "边界冲突"
                        : (
                            {
                              met: "符合",
                              different: "有差异",
                              unknown: "信息不足",
                              discuss: "可协商",
                            } as any
                          )[item.status]}
                    </span>
                  </div>
                  <p>
                    期待：{item.expected} · 对方填写：{item.actual}
                  </p>
                  <p>{item.explanation}</p>
                </div>
              ))
            ) : (
              <p>没有双方共同授权且已设定的偏好项目。</p>
            )}
          </section>
        ))}
      </div>
      <section className="card">
        <h2>已经知道的一致点</h2>
        <p>
          {r.agreements.length
            ? r.agreements
                .map((k: Key) => dimensions.find((d) => d.key === k)?.label)
                .join("、")
            : "暂时没有足够信息确认双向一致项。"}
        </p>
        <h2>下一次，可以这样聊</h2>
        <p className="muted">
          以下问题来自规则结果；没有差异不代表不需要交流。
        </p>
        <ol className="questions">
          {(r.questions.length
            ? r.questions
            : [
                "你希望在这段了解中保留哪些个人空间？",
                "遇到意见不同，你希望怎样沟通？",
                "还有哪些没有填写的期待，你愿意慢慢分享？",
              ]
          ).map((q: string, i: number) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </section>
    </>
  );
}
function Example() {
  const base: Snapshot = {
    profile: {
      adult: true,
      values: {
        age: 28,
        goal: "认真交往",
        smoking: "不吸烟",
        communication: 2,
      },
    },
    preferences: {
      values: {
        age: { ...defaultPref(), importance: "prefer", min: 25, max: 35 },
        goal: { ...defaultPref(), importance: "must", accepted: ["认真交往"] },
        smoking: { ...defaultPref(), importance: "must", accepted: ["不吸烟"] },
        communication: {
          ...defaultPref(),
          importance: "prefer",
          min: 4,
          max: 5,
        },
        children: {
          ...defaultPref(),
          importance: "prefer",
          accepted: ["希望育儿"],
        },
      },
    },
    profileVersion: 1,
    preferenceVersion: 1,
    consentVersion: 1,
    fields: [...keys],
    ai: false,
  };
  const other = structuredClone(base);
  other.profile.values.age = 31;
  other.profile.values.communication = 4;
  other.preferences.values.communication = {
    ...defaultPref(),
    importance: "prefer",
    min: 1,
    max: 3,
  };
  return (
    <>
      <p className="eyebrow">公开示例 · 虚构成人 · 无真实 AI</p>
      <h1>不是一个答案，是几个好问题。</h1>
      <p>
        以下内容由虚构资料计算，与任何真实用户无关。完整 Demo
        使用独立数据库与真实账号权限流程。
      </p>
      <ReportContent result={match(base, other)} />
      <a className="button" href="/register">
        开始填写我的期待
      </a>
    </>
  );
}
function Settings({ me, config }: { me: any; config: any }) {
  const [deletion, setDeletion] = useState(""),
    [note, setNote] = useState("");
  return (
    <>
      <div className="page-title">
        <div>
          <p className="eyebrow">始终由你决定</p>
          <h1>设置与数据管理</h1>
        </div>
      </div>
      <section className="card">
        <h2>我的账号</h2>
        <p>{me.user.email}</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get("name");
            try {
              await api("/auth/update-user", "POST", { name });
              setNote("昵称已更新");
            } catch (e: any) {
              setNote(e.message);
            }
          }}
        >
          <label>
            昵称
            <input
              name="name"
              defaultValue={me.user.name}
              maxLength={40}
              required
            />
          </label>
          <button className="secondary">保存昵称</button>
        </form>
        {note && <Notice>{note}</Notice>}
        <div className="actions">
          <a href="/forgot">重置密码</a>
          <Action
            className="secondary"
            onClick={async () => {
              await api("/auth/sign-out", "POST", {});
              sessionStorage.clear();
              go("/login");
            }}
          >
            退出登录
          </Action>
        </div>
      </section>
      <section className="card">
        <h2>导出本人数据</h2>
        <p>
          导出自己的资料历史、偏好和授权快照，不包含对方资料或共享报告。共享报告请在有效授权下于应用内查看。
        </p>
        <a className="button secondary" href="/api/export" download>
          下载我的数据
        </a>
        <h3>撤回分享</h3>
        <p>
          每份邀请都可以单独撤回。撤回后后端立即拒绝访问；已打开页面定期复核并清除显示，但已保存的副本无法自动收回。
        </p>
        <a href="/dashboard">查看邀请与授权 →</a>
      </section>
      <section className="card danger-zone">
        <h2>删除账号</h2>
        <p>
          删除账号、资料历史、偏好、会话及关联共享报告；另一方的独立账号与本人资料保留。此操作不可恢复。执行前需在
          10 分钟内重新登录。
        </p>
        <p>
          数据库备份中的数据不会立即消失。上线部署须落实最长 30
          天备份轮换，恢复备份后重新执行删除记录。
        </p>
        <label>
          输入“删除我的账号”确认
          <input
            value={deletion}
            onChange={(e) => setDeletion(e.target.value)}
          />
        </label>
        <Action
          className="danger"
          onClick={async () => {
            if (deletion !== "删除我的账号") throw Error("确认文字不一致");
            if (!confirm("确认永久删除账号及关联资料、报告？")) return;
            await api("/account", "DELETE", { confirmation: deletion });
            sessionStorage.clear();
            go("/");
          }}
        >
          永久删除账号
        </Action>
      </section>
      <p className="muted">
        {config?.mode === "production" ? "生产环境" : "本地开发 / 测试环境"} ·
        年龄声明不是身份认证
      </p>
    </>
  );
}
function Legal({ terms, config }: { terms: boolean; config: any }) {
  return (
    <article className="card legal">
      <p className="eyebrow">
        {config?.operator ? "产品说明" : "上线前草案 · 运营信息待确定"}
      </p>
      <h1>{terms ? "使用条款" : "隐私与数据说明"}</h1>
      {terms ? (
        <>
          <h2>适用范围</h2>
          <p>
            仅供主动声明年满 18
            岁的成年人使用。不提供身份认证、公开人物搜索、聊天、支付或关系成功预测。不得冒用他人资料或未经允许替他人同意。
          </p>
          <h2>如何理解结果</h2>
          <p>
            报告反映自述资料和本次授权偏好的比较，不能评判人的价值，也不保证资料真实、恋爱成功或婚姻稳定。请把结果作为讨论辅助，自主决定下一步。
          </p>
          <h2>AI 与服务限制</h2>
          <p>
            AI 可能出错，规则报告仍可独立使用。本地 Demo
            明确标为虚构与模拟，不能作为真实服务验证。请勿把本服务用于羞辱、歧视、操纵或调查他人。
          </p>
        </>
      ) : (
        <>
          <h2>我们保存什么</h2>
          <p>
            邮箱、认证框架管理的密码凭证和会话；你自愿填写的资料、偏好及历史版本；邀请令牌摘要、授权快照、共享报告和不含敏感正文的操作事件。不要求真实姓名、照片、单位、精确住址或收入。
          </p>
          <h2>谁能看到什么</h2>
          <p>
            资料默认私密。邀请链接只用于登录后接受邀请，不显示个人信息。你勾选的维度同时授权该项自己的情况和对伴侣的偏好；报告仅比较双方共同授权的维度。未授权字段不进入共享报告，也不会传给模型。
          </p>
          <h2>AI 数据使用</h2>
          <p>
            只有双方都勾选 AI
            授权，才可将共同授权维度的确定性计算结果发送给配置的模型服务。输入不包含邮箱、令牌、未授权资料或自由文本。模型服务方、部署地区及其保留政策需上线前向用户披露。
          </p>
          <h2>撤回、导出与删除</h2>
          <p>
            你可以撤回授权，后端立即阻断共享报告访问。已打开页面最长约 10
            秒复核；截图和对方保存的副本不能自动收回。导出仅包含自己的资料与授权。删除账号会删除关联共享报告和邀请，对方本人的资料不受影响。
          </p>
          <h2>保留与备份边界</h2>
          <p>
            资料与版本保留到删除账号。数据库已启用删除覆盖设置，但并非对底层介质的安全擦除保证。上线运营需要配置最长
            30
            天的加密备份轮换，删除请求记录单独保存用于灾难恢复后重放。当前没有声明已运行云备份。
          </p>
          <h2>Cookie 与日志</h2>
          <p>
            使用认证所需
            Cookie，不接入广告跟踪。生产日志不记录资料正文或模型输入输出；限流仅保存标识摘要及短期计数。
          </p>
        </>
      )}
      <h2>产品联系信息</h2>
      <p>
        运营主体：{config?.operator || "尚未确定（上线阻塞项）"}
        <br />
        联系邮箱：{config?.contact || "尚未确定（上线阻塞项）"}
        <br />
        部署地区：{config?.region || "尚未确定（上线阻塞项）"}
      </p>
      <p>
        本草案不代表已经符合所有地区法规或通过专业认证。正式上线需按实际运营与服务配置补全。
      </p>
    </article>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
