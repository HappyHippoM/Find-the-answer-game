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

  const [messages, setMessages] = useState({}); // { role: [{ fromName, text, fromRole }] }
  const [reply, setReply] = useState({}); // { targetRole: text }
  const scrollRefs = useRef({});

  // Socket events
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

    socket.on("card", ({ role: r, image }) => {
      // optional: server may send card info
      setCardImage(image || `/cards/${r}.jpg`);
    });

    socket.on("private_message", ({ fromRole, fromName, text }) => {
      setMessages((m) => {
        const prev = m[fromRole] || [];
        return { ...m, [fromRole]: [...prev, { fromName, text, fromRole }] };
      });
    });

    socket.on("game_result", ({ message }) => {
      // show server message
      alert(message);
    });

    // attempt auto-reconnect if local data exists and no current role
    if (!role && localStorage.getItem(LS_PREFIX + "name")) {
      const savedName = localStorage.getItem(LS_PREFIX + "name");
      const savedRole = localStorage.getItem(LS_PREFIX + "role");
      const savedGroup = Number(localStorage.getItem(LS_PREFIX + "group") || 1);
      socket.emit("reconnect_user", { name: savedName, role: savedRole, group: savedGroup }, (res) => {
        if (res?.ok) {
          // server accepted and restored
          setRole(res.role || savedRole);
          setCardImage(`/cards/${res.role || savedRole}.jpg`);
        } else {
          // server didn't accept — clear local data
          clearLocal();
        }
      });
    }

    return () => {
      socket.removeAllListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll each chat on new messages
  useEffect(() => {
    Object.keys(scrollRefs.current).forEach((k) => {
      const el = scrollRefs.current[k];
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  // helpers for localStorage
  const saveToLocal = (nm, r, g, card) => {
    localStorage.setItem(LS_PREFIX + "name", nm);
    localStorage.setItem(LS_PREFIX + "role", r);
    localStorage.setItem(LS_PREFIX + "group", String(g));
    localStorage.setItem(LS_PREFIX + "card", card);
  };
  const clearLocal = () => {
    localStorage.removeItem(LS_PREFIX + "name");
    localStorage.removeItem(LS_PREFIX + "role");
    localStorage.removeItem(LS_PREFIX + "group");
    localStorage.removeItem(LS_PREFIX + "card");
    setName("");
    setRole("");
    setGroup(1);
    setCardImage("");
  };

  // client-side permission check (also enforced on server)
  const canSendTo = (fromRole, toRole) => {
    if (!fromRole || !toRole) return false;
    if (fromRole === "B") return ROLES.includes(toRole) && toRole !== "B";
    return toRole === "B";
  };

  // register new user
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

  // send message
  const sendMessage = (toRole) => {
    const text = (reply[toRole] || "").trim();
    if (!text) return;
    if (!canSendTo(role, toRole)) return alert("Цей напрямок заборонено");
    socket.emit("send_message", { toRole, text }, (res) => {
      if (!res?.ok) return alert(res?.error || "Помилка при відправці");
      // locally append as 'me'
      setMessages((m) => {
        const prev = m[toRole] || [];
        return { ...m, [toRole]: [...prev, { fromName: name, text, fromRole: "me" }] };
      });
      setReply((r) => ({ ...r, [toRole]: "" }));
    });
  };

  // logout (clear localStorage)
  const logout = () => {
    clearLocal();
    socket.emit("logout"); // optional server side cleanup
  };

  // ---------- UI ----------
  if (!role) {
    return (
      <div className="app">
        <div className="card">
          <div className="header">
            <h2>Find-the-answer-game — реєстрація</h2>
            <div className="small">Сервер: {SERVER}</div>
          </div>

          <label className="small">Ваше ім'я</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ім'я..."
            style={{ width: "100%", padding: 10, borderRadius: 8, marginBottom: 8 }}
          />

          <label className="small">Оберіть групу</label>
          <select
            value={group}
            onChange={(e) => setGroup(Number(e.target.value))}
            style={{ padding: 10, borderRadius: 8, width: "100%" }}
          >
            {Array.from({ length: groupCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Група {i + 1}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={register}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 8,
                background: "#4f8ef7",
                color: "#fff",
                border: "none",
              }}
            >
              Зареєструватися
            </button>
            <button
              onClick={() => {
                clearLocal();
                setName("");
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#eee",
                color: "#222",
                border: "none",
              }}
            >
              Очистити
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main view for registered user
  return (
    <div className="app">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Вітаємо, {name}!</h3>
            <div className="small">Ваша роль: <strong>{role}</strong> — група {group}</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <img
              src={cardImage}
              alt={`card ${role}`}
              style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 10, boxShadow: "0 4px 10px rgba(0,0,0,0.12)" }}
            />
            <div style={{ marginTop: 8 }}>
              <button onClick={logout} style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: "#f3f4f6" }}>
                Вийти
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          {role === "B" ? (
            // compact grid for B: show all chats
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
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
            // regular: single chat with B
            <div style={{ maxWidth: 760, marginTop: 8 }}>
              <ChatCard
                meRole={role}
                targetRole={"B"}
                messages={messages["B"] || []}
                value={reply["B"] || ""}
                onChange={(val) => setReply((s) => ({ ...s, B: val }))}
                onSend={() => sendMessage("B")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- ChatCard component (bubble layout like Telegram) ----------
function ChatCard({ meRole, targetRole, messages, value, onChange, onSend, compact }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const canSend = canSendToClient(meRole, targetRole);

  return (
    <div style={{ padding: compact ? 8 : 12, background: "#fff", borderRadius: 12, boxShadow: "0 2px 6px rgba(15,23,42,0.04)" }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, textAlign: "center" }}>Чат з {targetRole}</div>

      <div
        ref={scrollRef}
        style={{
          background: "#f8fafc",
          borderRadius: 10,
          padding: 8,
          maxHeight: compact ? 160 : 320,
          overflowY: "auto",
        }}
      >
        {messages.map((m, i) => {
          const isMe = m.fromRole === "me";
          return (
            <div key={i} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", marginBottom: 6 }}>
              <div style={{
                background: isMe ? "#3b82f6" : "#e6e9ee",
                color: isMe ? "#fff" : "#111827",
                padding: "6px 10px",
                borderRadius: 14,
                fontSize: 13,
                lineHeight: "1.2",
                maxWidth: "75%",
                wordBreak: "break-word",
                boxShadow: isMe ? "0 2px 8px rgba(59,130,246,0.12)" : "none"
              }}>
                {/* optionally show small name for non-me messages */}
                {!isMe && <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{m.fromName}</div>}
                <div style={{ fontSize: 13 }}>{m.text}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <textarea
          rows={compact ? 2 : 3}
          disabled={!canSend}
          placeholder={canSend ? `Написати ${targetRole}...` : "Надсилання заборонено"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            flex: 1,
            padding: 8,
            borderRadius: 10,
            fontSize: 13,
            resize: "vertical",
            minHeight: compact ? 40 : 60,
          }}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "none",
            background: canSend ? "#3b82f6" : "#cbd5e1",
            color: "#fff",
            fontSize: 13,
            cursor: canSend ? "pointer" : "not-allowed"
          }}
        >
          Надіслати
        </button>
      </div>
    </div>
  );
}

// client-side permission util (same logic as server)
function canSendToClient(fromRole, toRole) {
  if (!fromRole || !toRole) return false;
  if (fromRole === "B") return ROLES.includes(toRole) && toRole !== "B";
  return toRole === "B";
}
