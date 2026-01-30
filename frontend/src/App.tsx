import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as anchor from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router-dom";

import * as api from "./lib/api";
import {
  decodeBase64,
  decryptMessage,
  encodeBase64,
  encryptMessage,
  generateKeypair,
  keypairFromSecretKey,
} from "./lib/crypto";
import idl from "./idl/solana_demo.json";

const PROGRAM_ID =
  import.meta.env.VITE_PROGRAM_ID ??
  "D4vno1rrteswpFM3SSfzvJwyPzSkQKCiN6WfEuK7qGyS";

const LOCAL_SK_KEY = "enc_sk_b64";

function loadSecretKey(): Uint8Array | null {
  const stored = localStorage.getItem(LOCAL_SK_KEY);
  return stored ? decodeBase64(stored) : null;
}

type StatusSetter = (value: string | null) => void;
type HandleSetter = (value: string) => void;
type CheckHandleFn = (target: string, setStatusText: StatusSetter) => void;

function Gate() {
  return (
    <div className="gate gate--inline">
      <div className="gate-card">
        <div className="badge">WHISPER</div>
        <h1>悄悄话 · 加密收件箱</h1>
        <p>连接钱包进入控制台，创建 Profile 并管理你的匿名收件箱。</p>
        <div className="gate-actions">
          <WalletMultiButton />
          <span className="hint">建议切换到 Devnet 进行测试</span>
        </div>
        <div className="gate-grid">
          <div className="gate-item">
            <strong>端到端加密</strong>
            <span>消息加密存储，私钥本地掌控</span>
          </div>
          <div className="gate-item">
            <strong>钱包授权</strong>
            <span>签名验证后才能查看收件箱</span>
          </div>
          <div className="gate-item">
            <strong>链上身份</strong>
            <span>Profile 上链，公开可验证</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RequireWallet({
  isConnected,
  children,
}: {
  isConnected: boolean;
  children: ReactNode;
}) {
  if (!isConnected) {
    return <Gate />;
  }
  return <>{children}</>;
}

type ConfigPanelProps = {
  configHandle: string;
  setConfigHandle: HandleSetter;
  configHandleStatus: string | null;
  setConfigHandleStatus: StatusSetter;
  checkHandle: CheckHandleFn;
  ownerProfiles: api.ProfileSummary[];
  ownerProfilesLoading: boolean;
  refreshOwnerProfiles: () => void;
  secretKey: Uint8Array | null;
  localPublicKey: Uint8Array | null;
  handleGenerateKey: () => void;
  creating: boolean;
  handleCreateProfile: () => void;
  programId: string;
};

function ConfigPanel({
  configHandle,
  setConfigHandle,
  configHandleStatus,
  setConfigHandleStatus,
  checkHandle,
  ownerProfiles,
  ownerProfilesLoading,
  refreshOwnerProfiles,
  secretKey,
  localPublicKey,
  handleGenerateKey,
  creating,
  handleCreateProfile,
  programId,
}: ConfigPanelProps) {
  const hasBoundHandle = ownerProfiles.length > 0;
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>身份与配置</h2>
        <p>设置 handle、密钥与链上 Profile。</p>
      </div>
      {hasBoundHandle ? (
        <div className="field">
          <label>已绑定 Handle</label>
          <select
            value={configHandle}
            onChange={(e) => {
              setConfigHandle(e.target.value);
              setConfigHandleStatus(null);
            }}
          >
            {ownerProfiles.map((item) => (
              <option key={item.pda} value={item.handle}>
                {item.handle}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="field">
            <label>Handle</label>
            <input
              value={configHandle}
              onChange={(e) => {
                setConfigHandle(e.target.value.trim());
                setConfigHandleStatus(null);
              }}
              placeholder="例如 alice / bob"
            />
          </div>
          <div className="actions">
            <button
              type="button"
              onClick={() => checkHandle(configHandle, setConfigHandleStatus)}
            >
              检查 handle
            </button>
            {configHandleStatus && (
              <span
                className={`pill ${
                  configHandleStatus.includes("可用") ? "pill--ok" : "pill--warn"
                }`}
              >
                {configHandleStatus}
              </span>
            )}
          </div>
        </>
      )}

      <div className="card card--mini">
        <div className="card-head">
          <h3>本地密钥</h3>
          <span className="muted">仅本地保存</span>
        </div>
        <p className="muted">用于解密收件箱内容，建议离线备份。</p>
        <button onClick={handleGenerateKey}>生成/更新密钥</button>
        <div className="keybox">
          <div>密钥状态：{secretKey ? "已存在" : "未生成"}</div>
          <div className="mono">公钥：{localPublicKey ? encodeBase64(localPublicKey) : "-"}</div>
        </div>
      </div>

      <div className="card card--mini">
        <div className="card-head">
          <h3>已绑定 Handle</h3>
          <button className="ghost" onClick={refreshOwnerProfiles}>
            {ownerProfilesLoading ? "加载中..." : "刷新"}
          </button>
        </div>
        {ownerProfiles.length === 0 ? (
          <p className="muted">当前钱包暂无绑定 handle。</p>
        ) : (
          <div className="chip-list">
            {ownerProfiles.map((item) => (
              <div key={item.pda} className="chip">
                {item.handle}
              </div>
            ))}
          </div>
        )}
      </div>

      {!ownerProfilesLoading && !hasBoundHandle && (
        <div className="card card--mini">
          <div className="card-head">
            <h3>创建 Profile</h3>
            <span className="muted">链上绑定</span>
          </div>
          <p className="muted">使用当前 handle 创建链上 Profile。</p>
          <button disabled={creating} onClick={handleCreateProfile}>
            {creating ? "创建中..." : "创建 Profile"}
          </button>
          <div className="muted mono program-id">Program ID: {programId}</div>
        </div>
      )}

      {/* {!ownerProfilesLoading && hasBoundHandle && (
        <div className="muted">已绑定 handle，当前钱包不可重复创建。</div>
      )} */}
    </section>
  );
}

type SendPanelProps = {
  sendHandle: string;
  setSendHandle: HandleSetter;
  sendHandleStatus: string | null;
  setSendHandleStatus: StatusSetter;
  checkSendHandle: CheckHandleFn;
  nickname: string;
  setNickname: HandleSetter;
  message: string;
  setMessage: HandleSetter;
  sending: boolean;
  handleSend: () => void;
};

function SendPanel({
  sendHandle,
  setSendHandle,
  sendHandleStatus,
  setSendHandleStatus,
  checkSendHandle,
  nickname,
  setNickname,
  message,
  setMessage,
  sending,
  handleSend,
}: SendPanelProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>匿名发送</h2>
        <p>无需连接钱包即可发送消息。</p>
      </div>
      <div className="columns">
        <div className="card">
          <div className="card-head">
            <h3>发送消息</h3>
            <span className="muted">对 {sendHandle || "目标"}</span>
          </div>
          <div className="field">
            <label>Handle</label>
            <input
              value={sendHandle}
              onChange={(e) => {
                setSendHandle(e.target.value.trim());
                setSendHandleStatus(null);
              }}
              placeholder="例如 alice / bob"
            />
          </div>
          <div className="actions">
            <button
              type="button"
              onClick={() => checkSendHandle(sendHandle, setSendHandleStatus)}
            >
              检查 handle
            </button>
            {sendHandleStatus && (
              <span
                className={`pill ${
                  sendHandleStatus.includes("可用") ? "pill--ok" : "pill--warn"
                }`}
              >
                {sendHandleStatus}
              </span>
            )}
          </div>
          <div className="field">
            <label>昵称（可选）</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="匿名 / 昵称"
            />
          </div>
          <div className="field">
            <label>消息内容</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="说点悄悄话..."
            />
          </div>
          <button disabled={sending} onClick={handleSend}>
            {sending ? "发送中..." : "发送"}
          </button>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>发送提示</h3>
            <span className="muted">无需钱包</span>
          </div>
          <div className="info-stack">
            <div className="info-item">
              <strong>端到端加密</strong>
              <p>消息会用收件人的 enc_pk 加密后存储。</p>
            </div>
            <div className="info-item">
              <strong>匿名可选昵称</strong>
              <p>昵称只是展示用途，不上链。</p>
            </div>
            <div className="info-item">
              <strong>传播链接</strong>
              <p>分享你的 handle 页面即可收集消息。</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type InboxPanelProps = {
  inbox: api.MessageOut[];
  loadingInbox: boolean;
  handleLoadInbox: () => void;
  secretKey: Uint8Array | null;
  localPublicKey: Uint8Array | null;
  configHandle: string;
  walletLabel: string;
  ownerProfiles: api.ProfileSummary[];
  setConfigHandle: HandleSetter;
  shareUrl: string;
  onCopyShare: () => void;
};

function InboxPanel({
  inbox,
  loadingInbox,
  handleLoadInbox,
  secretKey,
  localPublicKey,
  configHandle,
  walletLabel,
  ownerProfiles,
  setConfigHandle,
  shareUrl,
  onCopyShare,
}: InboxPanelProps) {
  const hasBoundHandle = ownerProfiles.length > 0;
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>收件箱</h2>
        <p>钱包签名后查看你的加密消息。</p>
      </div>
      {hasBoundHandle && (
        <div className="field">
          <label>当前查看的 Handle</label>
          <select
            value={configHandle}
            onChange={(e) => setConfigHandle(e.target.value)}
          >
            {ownerProfiles.map((item) => (
              <option key={item.pda} value={item.handle}>
                {item.handle}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="columns">
        <div className="card">
          <div className="card-head">
            <h3>消息列表</h3>
            <div className="card-actions">
              <button className="ghost" onClick={onCopyShare}>
                复制分享链接
              </button>
              <button className="ghost" disabled={loadingInbox} onClick={handleLoadInbox}>
                {loadingInbox ? "加载中..." : "刷新"}
              </button>
            </div>
          </div>
          <div className="inbox">
            {inbox.length === 0 && <div className="muted">暂无消息</div>}
            {inbox.map((msg) => {
              const plaintext =
                secretKey && decryptMessage(msg.ciphertext, msg.nonce, msg.epk, secretKey);
              return (
                <div key={msg.id} className="message">
                  <div className="meta">
                    <span>{msg.nickname || "匿名"}</span>
                    <span>{msg.created_at}</span>
                  </div>
                  <div className="content">{plaintext ?? "(无法解密，请检查本地密钥)"}</div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h3>解密状态</h3>
            <span className="muted">本地密钥</span>
          </div>
          <p className="muted">
            {hasBoundHandle
              ? `当前钱包 ${walletLabel} 正在查看 ${configHandle} 的收件箱。`
              : "当前钱包尚未绑定 handle，请先在身份与配置中创建。"}
          </p>
          <div className="keybox">
            <div>密钥状态：{secretKey ? "已存在" : "未生成"}</div>
            <div className="mono">公钥：{localPublicKey ? encodeBase64(localPublicKey) : "-"}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const isConnected = !!wallet.publicKey;
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [configHandle, setConfigHandle] = useState("alice");
  const [sendHandle, setSendHandle] = useState("alice");
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [configHandleStatus, setConfigHandleStatus] = useState<string | null>(null);
  const [sendHandleStatus, setSendHandleStatus] = useState<string | null>(null);
  const [ownerProfiles, setOwnerProfiles] = useState<api.ProfileSummary[]>([]);
  const [ownerProfilesLoading, setOwnerProfilesLoading] = useState(false);
  const [inbox, setInbox] = useState<api.MessageOut[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(() => loadSecretKey());

  const localPublicKey = useMemo(() => {
    if (!secretKey) {
      return null;
    }
    return keypairFromSecretKey(secretKey).publicKey;
  }, [secretKey]);

  const walletLabel = useMemo(() => {
    if (!wallet.publicKey) {
      return "";
    }
    const base58 = wallet.publicKey.toBase58();
    return `${base58.slice(0, 4)}...${base58.slice(-4)}`;
  }, [wallet.publicKey]);

  const handleGenerateKey = () => {
    const kp = generateKeypair();
    localStorage.setItem(LOCAL_SK_KEY, encodeBase64(kp.secretKey));
    setSecretKey(kp.secretKey);
    setStatus("已生成本地解密密钥，请妥善备份");
  };

  const checkHandle = async (
    target: string,
    setStatusText: (value: string | null) => void
  ) => {
    if (!target) {
      setStatusText("请输入 handle");
      return;
    }
    try {
      const exists = await api.profileExists(target);
      setStatusText(exists ? "该 handle 已被占用" : "该 handle 可用");
    } catch (err) {
      setStatusText((err as Error).message);
    }
  };

  const checkSendHandle = async (
    target: string,
    setStatusText: (value: string | null) => void
  ) => {
    if (!target) {
      setStatusText("请输入 handle");
      return;
    }
    try {
      const exists = await api.profileExists(target);
      setStatusText(exists ? "该 handle 可发送" : "该 handle 不存在，无法发送");
    } catch (err) {
      setStatusText((err as Error).message);
    }
  };

  const handleCreateProfile = async () => {
    if (!configHandle) {
      setStatus("请输入 handle");
      return;
    }
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      setStatus("请连接支持签名的 Solana 钱包");
      return;
    }
    setCreating(true);
    setStatus(null);
    try {
      const exists = await api.profileExists(configHandle);
      if (exists) {
        setStatus("该 handle 已被占用，请更换");
        return;
      }
      let sk = secretKey;
      if (!sk) {
        const kp = generateKeypair();
        localStorage.setItem(LOCAL_SK_KEY, encodeBase64(kp.secretKey));
        setSecretKey(kp.secretKey);
        sk = kp.secretKey;
      }
      const encPk = keypairFromSecretKey(sk).publicKey;
      const provider = new anchor.AnchorProvider(
        connection,
        wallet as unknown as anchor.Wallet,
        { commitment: "confirmed" }
      );
      const idlWithAddress = { ...(idl as anchor.Idl), address: PROGRAM_ID };
      const program = new anchor.Program(idlWithAddress, provider);
      const programId = program.programId;
      const encoder = new TextEncoder();
      const [profilePda] = PublicKey.findProgramAddressSync(
        [encoder.encode("profile"), encoder.encode(configHandle)],
        programId
      );
      await program.methods
        .initializeProfile(configHandle, Array.from(encPk), [wallet.publicKey])
        .accounts({
          profile: profilePda,
          owner: wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      setStatus("Profile 已创建并绑定钱包");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async () => {
    if (!sendHandle || !message.trim()) {
      setStatus("请填写 handle 和消息内容");
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const profile = await api.getProfile(sendHandle);
      const encPk = decodeBase64(profile.enc_pk);
      const encrypted = encryptMessage(message, encPk);
      await api.postMessage({
        handle: sendHandle,
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        epk: encrypted.epk,
        nickname: nickname || undefined,
      });
      setMessage("");
      setStatus("已发送，收件人可签名查看");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleLoadInbox = async () => {
    if (!configHandle) {
      setStatus("钱包尚未绑定 handle");
      return;
    }
    if (
      ownerProfiles.length > 0 &&
      !ownerProfiles.some((item) => item.handle === configHandle)
    ) {
      setStatus("当前钱包未绑定该 handle");
      return;
    }
    if (!wallet.publicKey || !wallet.signMessage) {
      setStatus("请连接支持 signMessage 的钱包");
      return;
    }
    setLoadingInbox(true);
    setStatus(null);
    try {
      const challenge = await api.getChallenge(configHandle);
      let signatureBytes: Uint8Array;
      try {
        signatureBytes = await wallet.signMessage(
          new TextEncoder().encode(challenge.message)
        );
      } catch (err) {
        const anyErr = err as { message?: string; name?: string; error?: { message?: string } };
        const detail = anyErr?.error?.message || anyErr?.message || "签名失败";
        const hint =
          anyErr?.name === "WalletSignMessageError"
            ? "当前钱包可能不支持 signMessage（例如观察钱包或硬件钱包）。"
            : "";
        setStatus(`${detail}${hint ? `：${hint}` : ""}`);
        return;
      }
      const inboxData = await api.getInbox({
        handle: configHandle,
        pubkey: wallet.publicKey.toBase58(),
        signature: bs58.encode(signatureBytes),
        nonce: challenge.nonce,
      });
      setInbox(inboxData.messages);
      setStatus("收件箱已更新");
    } catch (err) {
      const anyErr = err as { message?: string; error?: { message?: string } };
      setStatus(anyErr?.error?.message || anyErr?.message || "操作失败");
    } finally {
      setLoadingInbox(false);
    }
  };

  const refreshOwnerProfiles = async () => {
    if (!wallet.publicKey) {
      setOwnerProfiles([]);
      return;
    }
    setOwnerProfilesLoading(true);
    try {
      const data = await api.getProfilesByOwner(wallet.publicKey.toBase58());
      setOwnerProfiles(data.profiles);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setOwnerProfilesLoading(false);
    }
  };

  useEffect(() => {
    if (wallet.publicKey) {
      refreshOwnerProfiles();
    } else {
      setOwnerProfiles([]);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    if (location.pathname !== "/send") {
      return;
    }
    const handleParam = searchParams.get("handle");
    if (handleParam) {
      const normalized = handleParam.trim().slice(0, 32);
      if (normalized) {
        setSendHandle((prev) => (prev === normalized ? prev : normalized));
        setSendHandleStatus(null);
      }
    }
  }, [location.pathname, searchParams]);

  useEffect(() => {
    if (ownerProfiles.length === 0) {
      return;
    }
    const exists = ownerProfiles.some((item) => item.handle === configHandle);
    if (!exists) {
      setConfigHandle(ownerProfiles[0].handle);
    }
  }, [ownerProfiles, configHandle]);

  useEffect(() => {
    if (!status) {
      return;
    }
    const timer = window.setTimeout(() => {
      setStatus(null);
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const shareUrl = useMemo(() => {
    if (!configHandle) {
      return "";
    }
    const base = window.location.origin;
    return `${base}/send?handle=${encodeURIComponent(configHandle)}`;
  }, [configHandle]);

  const handleCopyShare = async () => {
    if (!shareUrl) {
      setStatus("请先绑定 handle");
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("已复制分享链接");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setStatus("已复制分享链接");
    }
  };

  return (
    <div className="app">
      <div className="ambient" />
      <header className="topbar">
        <div className="brand">
          <div className="badge">WHISPER</div>
          <div>
            <h1>悄悄话控制台</h1>
            <p>匿名发送 · 钱包授权 · 端到端加密</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="pill">{walletLabel}</span>
          <WalletMultiButton />
        </div>
      </header>

      <nav className="nav">
        <NavLink
          to="/config"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          身份与配置
        </NavLink>
        <NavLink
          to="/send"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          匿名发送
        </NavLink>
        <NavLink
          to="/inbox"
          className={({ isActive }) =>
            isActive ? "nav-link active" : "nav-link"
          }
        >
          收件箱
        </NavLink>
      </nav>

      <main className="route">
        <Routes>
          <Route path="/" element={<Navigate to="/send" replace />} />
          <Route
            path="/config"
            element={
              <RequireWallet isConnected={isConnected}>
                <ConfigPanel
                  configHandle={configHandle}
                  setConfigHandle={setConfigHandle}
                  configHandleStatus={configHandleStatus}
                  setConfigHandleStatus={setConfigHandleStatus}
                  checkHandle={checkHandle}
                  ownerProfiles={ownerProfiles}
                  ownerProfilesLoading={ownerProfilesLoading}
                  refreshOwnerProfiles={refreshOwnerProfiles}
                  secretKey={secretKey}
                  localPublicKey={localPublicKey}
                  handleGenerateKey={handleGenerateKey}
                  creating={creating}
                  handleCreateProfile={handleCreateProfile}
                  programId={PROGRAM_ID}
                />
              </RequireWallet>
            }
          />
          <Route
            path="/send"
            element={
              <SendPanel
                sendHandle={sendHandle}
                setSendHandle={setSendHandle}
                sendHandleStatus={sendHandleStatus}
                setSendHandleStatus={setSendHandleStatus}
                checkSendHandle={checkSendHandle}
                nickname={nickname}
                setNickname={setNickname}
                message={message}
                setMessage={setMessage}
                sending={sending}
                handleSend={handleSend}
              />
            }
          />
          <Route
            path="/inbox"
            element={
              <RequireWallet isConnected={isConnected}>
                <InboxPanel
                  inbox={inbox}
                  loadingInbox={loadingInbox}
                  handleLoadInbox={handleLoadInbox}
                  secretKey={secretKey}
                  localPublicKey={localPublicKey}
                  configHandle={configHandle}
                  walletLabel={walletLabel}
                  ownerProfiles={ownerProfiles}
                  setConfigHandle={setConfigHandle}
                  shareUrl={shareUrl}
                  onCopyShare={handleCopyShare}
                />
              </RequireWallet>
            }
          />
          <Route path="*" element={<Navigate to="/send" replace />} />
        </Routes>
      </main>

      {status && <div className="toast">{status}</div>}
    </div>
  );
}
