import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import "./styles.css";

const SERVER = import.meta.env.VITE_SERVER || "https://teamcommunicationgame.onrender.com";
const socket = io(SERVER, { transports: ["websocket", "polling"] });

const ROLES = ["A", "B", "C", "D", "E", "F"];
const LS_PREFIX = "fta_";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [groupCount, setGroupCount] = useState(1);

  const [name, setName] = useState(localStorage.getItem(LS_PREFIX + "name") || "");
  const [role, setRole] = useState(localStorage.getItem(LS_PREFIX + "role") || "");
  const [group, setGroup] = useState(Number(localStorage.getItem(LS_PREFIX + "group")) || 1);
  const [cardImage, setCardImage] = useState(localStorage.getItem(LS_PREFIX + "card") || "");

  const [messages, setMessages] = useState({});
  const [reply, setReply] = useState({});
  const scrollRefs = useRef({});

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("group_count", (c) => setGroupCount(c));

    socket.on("registered", ({ role: r, name: nm, group: g }) => {
      const card = `/cards/${r}.jpg`;
      setRole(r);
      setGroup(g);
      setCardImage(card);
      saveToLocal(nm, r, g, card);
    });

    socket.on("private_message", ({ fromRole, fromName, text }) => {
      setMessages((m) => {
        const prev = m[fromRole] || [];
        return { ...m, [fromRole]: [...prev, { fromName, text, fromRole }] };
      });
    });

    socket.on("game_result", ({ message }) => alert(message));

    if (!role && localStorage.getItem(LS_PREFIX + "name")) {
      const savedName = localStorage.getItem(LS_PREFIX + "name");
      const savedRole = localStorage.getItem(LS_PREFIX + "role");
      const savedGroup = Number(localStorage.getItem(LS_PREFIX + "group") || 1);
      socket.emit("reconnect_user", { name: savedName, role: savedRole, group: savedGroup }, (res) => {
        if (res?.ok) {
          setRole(res.role || savedRole);
          setCardImage(`/cards/${res.role || savedRole}.jpg`);
        } else {
          clearLocal();
        }
      });
    }

    return () => socket.removeAllListeners();
  }, []);

  useEffect(() => {
    Object.keys(scrollRefs.current).forEach((k) => {
      const el = scrollRefs.current[k];
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  const saveToLocal = (nm, r, g, card) => {
    localStorage.setItem(LS_PREFIX + "name", nm);
    localStorage.setItem(LS_PREFIX + "role", r);
    localStorage.setItem(LS_PREFIX + "group", String(g));
    localStorage.setItem(LS_PREFIX + "card", card);
  };
  const clearLocal = () => {
    localStorage.clear();
    setName("");
    setRole("");
    setGroup(1);
    setCardImage("");
  };

  const canSendTo = (fromRole, toRole) => {
    if (!fromRole || !toRole) return false;
    if (fromRole === "B") return ROLES.includes(toRole) && toRole !== "B";
    return toRole === "B";
  };

  const register = () => {
    if (!name.trim()) return alert("Введіть ім'я");
    socket.emit("register", { name: name.trim(), group }, (res) => {
      if (!res?.ok) return alert(res?.error || "Помилка реєстрації");
      const card = `/cards/${res.role}.jpg`;
      setRole(res.role);
      setCardImage(card);
      saveToLocal(name.trim(), res.role, group, card);
    });
  };

  const sendMessage = (toRole) => {
    const text = (reply[toRole] || "").trim();
    if (!text) return;
    if (!canSendTo(role, toRole)) return alert("Цей напрямок заборонено");
    socket.emit("send_message", { toRole, text }, (res) => {
      if (!res?.ok) return alert(res?.error || "Помилка при відправці");
      setMessages((m) => {
        const prev = m[toRole] || [];
        return { ...m, [toRole]: [...prev, { fromName: name, text, fromRole: "me" }] };
      });
      setReply((r) => ({ ...r, [toRole]: "" }));
    });
  };

  const logout = () => {
    clearLocal();
    socket.emit("logout");
    window.location.reload();
  };

  if (!role) {
    return (
      <div className="app">
        <div className="card">
          <h2>Find-the-answer-game — реєстрація</h2>
          <label>Ваше ім'я</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ім'я..."
            style={{ width: "100%", padding: 10, borderRadius: 8, marginBottom: 8 }}
          />
          <label>Оберіть групу</label>
          <select
            value={group}
            onChange={(e) => setGroup(Number(e.target.value))}
            style={{ padding: 10, borderRadius: 8, width: "100%" }}
          >
            {Array.from({ length: groupCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>Група {i + 1}</option>
            ))}
          </select>
          <button onClick={register} style={{ marginTop: 12, width: "100%", background: "#3b82f6", color: "#fff", border: "none", padding: 10, borderRadius: 8 }}>
            Зареєструватися
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="card">
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <h3>Вітаємо, {name}!</h3>
          <div className="small">Ваша роль: <strong>{role}</strong> — група {group}</div>
          <button onClick={logout} style={{ marginTop: 8, background: "#ef4444", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 8 }}>
            Вийти
          </button>
        </div>

        <img
          src={cardImage}
          alt={`card ${role}`}
          style={{
            display: "block",
            width: "100%",
            maxWidth: 600,
            margin: "0 auto 16px auto",
            borderRadius: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            objectFit: "cover",
          }}
        />

        {role === "B" ? (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {ROLES.filter((r) => r !== "B").map((r) => (
              <ChatCard
                key={r}
                meRole={role}
                targetRole={r}
                messages={messages[r] || []}
                value={reply[r] || ""}
                onChange={(val) => setReply((s) => ({ ...s, [r]: val }))}
                onSend={() => sendMessage(r)}
                compact
              />
            ))}
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <ChatCard
              meRole={role}
              targetRole="B"
              messages={messages["B"] || []}
              value={reply["B"] || ""}
              onChange={(val) => setReply((s) => ({ ...s, B: val }))}
              onSend={() => sendMessage("B")}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatCard({ meRole, targetRole, messages, value, onChange, onSend, compact }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const canSend = canSendToClient(meRole, targetRole);

  return (
    <div style={{ padding: compact ? 6 : 12, background: "#fff", borderRadius: 12, boxShadow: "0 2px 6px rgba(15,23,42,0.06)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, textAlign: "center" }}>Чат з {targetRole}</div>
      <div
        ref={scrollRef}
        style={{
          background: "#f8fafc",
          borderRadius: 10,
          padding: 6,
          maxHeight: compact ? 140 : 300,
          overflowY: "auto",
        }}
      >
        {messages.map((m, i) => {
          const isMe = m.fromRole === "me";
          return (
            <div key={i} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 4 }}>
              <div style={{
                background: isMe ? "#3b82f6" : "#e5e7eb",
                color: isMe ? "#fff" : "#111827",
                padding: "5px 9px",
                borderRadius: 14,
                fontSize: 12,
                lineHeight: "1.3",
                maxWidth: "75%",
                wordBreak: "break-word"
              }}>
                {!isMe && <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>{m.fromName}</div>}
                {m.text}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <textarea
          rows={compact ? 2 : 3}
          disabled={!canSend}
          placeholder={canSend ? `Написати ${targetRole}...` : "Надсилання заборонено"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            padding: 6,
            borderRadius: 10,
            fontSize: 12,
            resize: "vertical",
            minHeight: compact ? 36 : 56,
          }}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          style={{
            padding: "6px 9px",
            borderRadius: 10,
            border: "none",
            background: canSend ? "#3b82f6" : "#cbd5e1",
            color: "#fff",
            fontSize: 12,
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

function canSendToClient(fromRole, toRole) {
  if (!fromRole || !toRole) return false;
  if (fromRole === "B") return ROLES.includes(toRole) && toRole !== "B";
  return toRole === "B";
}
