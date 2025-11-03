import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import "./styles.css";

const SERVER = import.meta.env.VITE_SERVER || "https://teamcommunicationgame.onrender.com";
const socket = io(SERVER, { transports: ["websocket", "polling"] });

const ROLES = ["A", "B", "C", "D", "E", "F"];

export default function App() {
  const [connected, setConnected] = useState(false);
  const [groupCount, setGroupCount] = useState(1);
  const [name, setName] = useState(localStorage.getItem("fta_name") || "");
  const [role, setRole] = useState(localStorage.getItem("fta_role") || "");
  const [group, setGroup] = useState(Number(localStorage.getItem("fta_group")) || 1);
  const [cardImage, setCardImage] = useState(localStorage.getItem("fta_card") || "");
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
      localStorage.setItem("fta_name", nm);
      localStorage.setItem("fta_role", r);
      localStorage.setItem("fta_group", g);
      localStorage.setItem("fta_card", card);
    });

    socket.on("card", ({ role: r, image }) => setCardImage(image));

    socket.on("private_message", ({ fromRole, fromName, text }) => {
      setMessages((m) => {
        const prev = m[fromRole] || [];
        return { ...m, [fromRole]: [...prev, { fromName, text, fromRole }] };
      });
    });

    socket.on("game_result", ({ message }) => alert(message));

    if (!role && localStorage.getItem("fta_name")) {
      socket.emit(
        "reconnect_user",
        {
          name: localStorage.getItem("fta_name"),
          role: localStorage.getItem("fta_role"),
          group: Number(localStorage.getItem("fta_group")),
        },
        (res) => {
          if (res.ok) {
            setRole(res.role);
            setCardImage(`/cards/${res.role}.jpg`);
          } else {
            localStorage.removeItem("fta_name");
            localStorage.removeItem("fta_role");
            localStorage.removeItem("fta_group");
            localStorage.removeItem("fta_card");
          }
        }
      );
    }

    return () => {
      socket.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    Object.keys(scrollRefs.current).forEach((k) => {
      const el = scrollRefs.current[k];
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  const register = () => {
    if (!name.trim()) return alert("Введіть ім'я");
    socket.emit("register", { name, group }, (res) => {
      if (!res.ok) return alert(res.error || "Помилка реєстрації");
      const card = `/cards/${res.role}.jpg`;
      setRole(res.role);
      setCardImage(card);
      localStorage.setItem("fta_name", name);
      localStorage.setItem("fta_role", res.role);
      localStorage.setItem("fta_group", group);
      localStorage.setItem("fta_card", card);
    });
  };

  const sendMessage = (toRole) => {
    const text = (reply[toRole] || "").trim();
    if (!text) return;
    socket.emit("send_message", { toRole, text }, (res) => {
      if (!res.ok) return alert(res.error || "Помилка при відправці");
      setMessages((m) => {
        const prev = m[toRole] || [];
        return { ...m, [toRole]: [...prev, { fromName: name, text, fromRole: "me" }] };
      });
      setReply((r) => ({ ...r, [toRole]: "" }));
    });
  };

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
            className="input"
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

          <div style={{ marginTop: 12 }}>
            <button
              onClick={register}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#4f8ef7",
                color: "#fff",
                border: "none",
                width: "100%",
              }}
            >
              Зареєструватися
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="card">
        <div className="header" style={{ flexDirection: "column", alignItems: "center" }}>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <h3>Вітаємо, {name}!</h3>
            <div className="small">
              Ваша роль: <strong>{role}</strong> — група {group}
            </div>
          </div>

          <img
            src={cardImage}
            alt={`card ${role}`}
            style={{
              width: "100%",
              maxWidth: 400,
              borderRadius: 12,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              objectFit: "cover",
              marginBottom: 16,
            }}
          />
        </div>

        {role !== "B" ? (
          <ChatPanel
            targetRole="B"
            messages={messages}
            reply={reply}
            setReply={setReply}
            sendMessage={sendMessage}
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
            {ROLES.filter((r) => r !== "B").map((r) => (
              <ChatPanel
                key={r}
                targetRole={r}
                messages={messages}
                reply={reply}
                setReply={setReply}
                sendMessage={sendMessage}
                compact={true} // компактний вигляд для B
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- ChatPanel ----------
const ChatPanel = ({ targetRole, messages, reply, setReply, sendMessage, compact }) => {
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages[targetRole]]);

  return (
    <div style={{ marginBottom: compact ? 8 : 12 }}>
      <div style={{ fontWeight: "bold", marginBottom: compact ? 4 : 6 }}>{targetRole}</div>

      <div
        ref={scrollRef}
        style={{
          maxHeight: compact ? 140 : 180,
          overflowY: "auto",
          padding: 6,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#fff",
        }}
      >
        {(messages[targetRole] || []).map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: m.fromRole === "me" ? "flex-end" : "flex-start",
              marginBottom: 4,
            }}
          >
            <div
              style={{
                background: m.fromRole === "me" ? "#4f8ef7" : "#f1f5f9",
                color: m.fromRole === "me" ? "#fff" : "#111827",
                padding: "4px 8px",
                borderRadius: 8,
                fontSize: 12,
                maxWidth: "80%",
                wordBreak: "break-word",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      <textarea
        rows={2}
        placeholder={`Відповідь ${targetRole}`}
        value={reply[targetRole] || ""}
        onChange={(e) => setReply({ ...reply, [targetRole]: e.target.value })}
        style={{
          width: "100%",
          padding: 6,
          borderRadius: 8,
          resize: "vertical",
          marginTop: 4,
          fontSize: 12,
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <button
          onClick={() => sendMessage(targetRole)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            background: "#4f8ef7",
            color: "#fff",
            border: "none",
            fontSize: 12,
          }}
        >
          Надіслати
        </button>
      </div>
    </div>
  );
};
