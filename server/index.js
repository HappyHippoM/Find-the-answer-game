import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());

const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || "*";
const PORT = process.env.PORT || 10000;
const GROUPS = Math.max(1, Math.min(10, parseInt(process.env.GROUPS || "1")));

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL === "*" ? "*" : CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const ROLES = ["A", "B", "C", "D", "E", "F"];
const playerData = {}; // { socketId: { name, role, group } }

function assignRoleForGroup(group) {
  const taken = Object.values(playerData)
    .filter((p) => p.group === group)
    .map((p) => p.role);
  for (const r of ROLES) {
    if (!taken.includes(r)) return r;
  }
  return null;
}

function getSocketByRoleAndGroup(role, group) {
  for (const [id, p] of Object.entries(playerData)) {
    if (p.group === group && p.role === role) return id;
  }
  return null;
}

io.on("connection", (socket) => {
  console.log("🔗 New connection:", socket.id);
  socket.emit("group_count", GROUPS);

  // ---------- 🔹 РЕЄСТРАЦІЯ ----------
  socket.on("register", ({ name, group }, callback) => {
    group = parseInt(group) || 1;
    if (group < 1 || group > GROUPS) group = 1;

    const role = assignRoleForGroup(group);
    if (!role) return callback({ ok: false, error: "Усі ролі в цій групі зайняті" });

    playerData[socket.id] = { name, role, group };
    console.log(`✅ User ${name} joined group ${group} as ${role}`);

    socket.emit("registered", { ok: true, role, name, group });
    socket.emit("card", { role, image: `/cards/${role}.jpg` });

    io.emit(
      "players_update",
      Object.values(playerData).map((p) => ({ name: p.name, role: p.role, group: p.group }))
    );

    return callback({ ok: true, role, name, group });
  });

  // ---------- 🔹 RECONNECT ----------
  socket.on("reconnect_user", ({ name, role, group }, callback) => {
    if (!name || !role || !group) return callback({ ok: false, error: "Некоректні дані" });

    // Перевіримо, чи вже хтось із цією роллю в групі
    const existing = Object.values(playerData).find(
      (p) => p.role === role && p.group === group
    );

    if (existing) {
      console.log(`⚠️ Role ${role} у групі ${group} вже зайнята, не можна відновити ${name}`);
      return callback({ ok: false, error: "Роль уже зайнята" });
    }

    // Відновлюємо користувача
    playerData[socket.id] = { name, role, group };
    console.log(`🔄 Reconnected user ${name} (${role}) group ${group}`);

    socket.emit("registered", { ok: true, role, name, group });
    socket.emit("card", { role, image: `/cards/${role}.jpg` });

    io.emit(
      "players_update",
      Object.values(playerData).map((p) => ({ name: p.name, role: p.role, group: p.group }))
    );

    return callback({ ok: true, role, name, group });
  });

  // ---------- 🔹 ПРИВАТНІ ПОВІДОМЛЕННЯ ----------
  socket.on("send_message", ({ toRole, text }, callback) => {
    const from = playerData[socket.id];
    if (!from) return callback({ ok: false, error: "Неавторизований" });

    const allowed =
      from.role === "B"
        ? ROLES.includes(toRole) && toRole !== "B"
        : toRole === "B";

    if (!allowed) return callback({ ok: false, error: "Напрямок заборонено" });

    const toSocketId = getSocketByRoleAndGroup(toRole, from.group);
    if (!toSocketId)
      return callback({ ok: false, error: `Користувач ${toRole} не знайдений у групі` });

    io.to(toSocketId).emit("private_message", {
      fromRole: from.role,
      fromName: from.name,
      text,
      timestamp: Date.now(),
    });

    callback({ ok: true });
  });

  // ---------- 🔹 ФІНАЛЬНА ВІДПОВІДЬ (C) ----------
  socket.on("submit_answer", ({ answer }, callback) => {
    const from = playerData[socket.id];
    if (!from) return callback({ ok: false, error: "Неавторизований" });
    if (from.role !== "C")
      return callback({ ok: false, error: "Тільки C може надсилати фінальну відповідь" });

    for (const [id, p] of Object.entries(playerData)) {
      if (p.group === from.group) {
        io.to(id).emit("game_result", {
          message: `Гравець ${from.name} (${from.role}) надіслав відповідь: ${answer}`,
        });
      }
    }
    callback({ ok: true });
  });

  // ---------- 🔹 ВІДКЛЮЧЕННЯ ----------
  socket.on("disconnect", () => {
    const p = playerData[socket.id];
    if (p) {
      console.log(`🔌 Disconnect ${p.name} (${p.role})`);
      delete playerData[socket.id];
      io.emit(
        "players_update",
        Object.values(playerData).map((x) => ({
          name: x.name,
          role: x.role,
          group: x.group,
        }))
      );
    } else {
      console.log("🔌 Disconnect unknown socket", socket.id);
    }
  });
});

// ---------- 🔹 HEALTH ----------
app.get("/", (req, res) => res.send("Find-the-answer-game server running ✅"));

server.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}, GROUPS=${GROUPS}`)
);
