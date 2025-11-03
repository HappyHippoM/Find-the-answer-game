import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import "./styles.css";

const SERVER = import.meta.env.VITE_SERVER || "https://teamcommunicationgame.onrender.com";
const socket = io(SERVER, { transports: ["websocket", "polling"] });

const ROLES = ["A", "B", "C", "D", "E", "F"];

export default function App() {
  const [connected, setConnected] = useState(false);
  const [groupCount, setGroupCount] = useState(1);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [group, setGroup] = useState(1);
  const [cardImage, setCardImage] = useState("");
  const [messages, setMessages] = useState({}); // { role: [{fromName, text, fromRole}] }
  const [reply, setReply] = useState({});
  const [finalAnswer, setFinalAnswer] = useState("");
  const scrollRefs = useRef({});

  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("group_count", (c) => setGroupCount(c));
    socket.on("registered", ({ role: r, name: nm, group: g }) => {
      setRole(r);
      setGroup(g);
    });
    socket.on("card", ({ role: r, image }) => {
      // image = /cards/A.jpg
      setCardImage(image);
    });

    socket.on("private_message", ({ fromRole, fromName, text }) => {
      setMessages((m) => {
        const prev = m[fromRole] || [];
        return { ...m, [fromRole]: [...prev, { fromName, text, fromRole }] };
      });
    });

    socket.on("game_result", ({ message }) => {
      alert(message);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("group_count");
      socket.off("registered");
      socket.off("card");
      socket.off("private_message");
      socket.off("game_result");
    };
  }, []);

  useEffect(() => {
    // автоскрол кожного чату якщо нові повідомлення
    Object.keys(scrollRefs.current).forEach((k) => {
      const el = scrollRefs.current[k];
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  const register = () => {
    if (!name.trim()) return alert("Введіть ім'я");
    socket.emit("register", { name, group }, (res) => {
      if (!res.ok) return alert(res.error || "Помилка реєстрації");
      setRole(res.role);
      setCardImage(`/cards/${res.role}.jpg`);
    });
  };

  const canSendTo = (fromRole, toRole) => {
    if (!fromRole || !toRole) return false;
    if (fromRole === "B") return ROLES.includes(toRole) && toRole !== "B";
    return toRole === "B";
  };

  const sendMessage = (toRole) => {
    const text = (reply[toRole] || "").trim();
    if (!text) return;
    socket.emit("send_message", { toRole, text }, (res) => {
      if (!res.ok) return alert(res.error || "Помилка при відправці");
      // показати локально як відправлене
      setMessages((m) => {
        const prev = m[toRole] || [];
        return { ...m, [toRole]: [...prev, { fromName: name, text, fromRole: "me" }] };
      });
      setReply((r) => ({ ...r, [toRole]: "" }));
    });
  };

  const submitFinal = () => {
    if (!finalAnswer.trim()) return alert("Введіть відповідь");
    socket.emit("submit_answer", { answer: finalAnswer }, (res) => {
      if (!res.ok) return alert(res.error || "Помилка при відправці відповіді");
      alert("Відповідь відправлена");
      setFinalAnswer("");
    });
  };

  // UI -------------------------------------------------
  if (!role) {
    return (
      <div className="app">
        <div className="card">
          <div className="header">
            <h2>Find-the-answer-game — реєстрація</h2>
            <div className="small">Сервер: {SERVER}</div>
          </div>

          <div>
            <label className="small">Ваше ім'я</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ім'я..."
              style={{ width: "100%", padding: 8, borderRadius: 8, marginBottom: 8 }}
            />
          </div>

          <div>
            <label className="small">Оберіть групу</label>
            <select value={group} onChange={(e) => setGroup(Number(e.target.value))} style={{ padding: 8, borderRadius: 8, width: "100%" }}>
              {Array.from({ length: groupCount }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Група {i + 1}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 12 }}>
            <button onClick={register} style={{ padding: "10px 14px", borderRadius: 8, background: "#4f8ef7", color: "#fff", border: "none" }}>
              Зареєструватися
            </button>
          </div>
        </div>
      </div>
    );
  }

  // after registration view
  return (
    <div className="app">
      <div className="card">
        <div className="header">
          <div>
            <h3>Вітаємо, {name}!</h3>
            <div className="small">Ваша роль: <strong>{role}</strong> — група {group}</div>
          </div>
          <div>
            <img src={cardImage} alt={`card ${role}`} style={{ width: 96, height: 96, borderRadius: 8, objectFit: "cover" }} />
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          {role !== "B" ? (
            <div>
              <h4>Чат з B</h4>

              <div ref={(el) => (scrollRefs.current["B"] = el)} style={{ maxHeight: 200, overflowY: "auto", padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff" }}>
                {(messages["B"] || []).map((m, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{m.fromRole === "me" ? "Ви" : m.fromName}</div>
                    <div style={{ background: m.fromRole === "me" ? "#4f8ef7" : "#f1f5f9", color: m.fromRole === "me" ? "#fff" : "#111827", display: "inline-block", padding: "6px 10px", borderRadius: 8, maxWidth: "80%" }}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 8 }}>
                <textarea rows={3} placeholder="Напишіть повідомлення..." value={reply["B"] || ""} onChange={(e) => setReply({ ...reply, B: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8 }} />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <button onClick={() => sendMessage("B")} style={{ padding: "8px 12px", borderRadius: 8, background: "#4f8ef7", color: "#fff", border: "none" }}>
                    Надіслати
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h4>Чати з учасниками</h4>
              {ROLES.filter((r) => r !== "B").map((r) => (
                <div key={r} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><strong>{r}</strong></div>
                    {/* optional: show last sender name */}
                  </div>

                  <div ref={(el) => (scrollRefs.current[r] = el)} style={{ maxHeight: 160, overflowY: "auto", padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", marginTop: 6 }}>
                    {(messages[r] || []).map((m, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{m.fromRole === "me" ? "Ви" : m.fromName}</div>
                        <div style={{ background: m.fromRole === "me" ? "#4f8ef7" : "#f1f5f9", color: m.fromRole === "me" ? "#fff" : "#111827", display: "inline-block", padding: "6px 10px", borderRadius: 8, maxWidth: "80%" }}>
                          {m.text}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <textarea rows={3} placeholder={`Відповідь ${r}`} value={reply[r] || ""} onChange={(e) => setReply({ ...reply, [r]: e.target.value })} style={{ width: "100%", padding: 8, borderRadius: 8 }} />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                      <button onClick={() => sendMessage(r)} style={{ padding: "8px 12px", borderRadius: 8, background: "#4f8ef7", color: "#fff", border: "none" }}>
                        Надіслати
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {role === "C" && (
          <div style={{ marginTop: 12 }}>
            <h4>Відправити фінальну відповідь</h4>
            <input value={finalAnswer} onChange={(e) => setFinalAnswer(e.target.value)} placeholder="Спільна фігура..." style={{ width: "100%", padding: 8, borderRadius: 8 }} />
            <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={submitFinal} style={{ padding: "8px 12px", borderRadius: 8, background: "#10b981", color: "#fff", border: "none" }}>
                Надіслати
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
