import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors()); // додатково дозволяє CORS для простого тесту; Render production: обмежити CLIENT_URL

const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || "*"; // в Render вкажіть свій Vercel URL
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
// Структура збереження: { socketId: { name, role, group } }
const playerData = {};

// Повернути роль для заданої групи (по порядку A..F, перший вільний)
function assignRoleForGroup(group) {
  const taken = Object.values(playerData)
    .filter((p) => p.group === group)
    .map((p) => p.role);
  for (const r of ROLES) {
    if (!taken.includes(r)) return r;
  }
  return null; // усі ролі зайняті
}

function getSocketByRoleAndGroup(role, group) {
  for (const [id, p] of Object.entries(playerData)) {
    if (p.group === group && p.role === role) return id;
  }
  return null;
}

io.on("connection", (socket) => {
  console.log("🔗 New connection:", socket.id);

  // надсилаємо поточну кількість груп при підключенні
  socket.emit("group_count", GROUPS);

  // реєстрація: { name, group }
  socket.on("register", ({ name, group }, callback) => {
    group = parseInt(group) || 1;
    if (group < 1 || group > GROUPS) group = 1;

    const role = assignRoleForGroup(group);
    if (!role) {
      return callback({ ok: false, error: "Усі ролі в цій групі зайняті" });
    }

    playerData[socket.id] = { name, role, group };
    console.log(`User ${name} joined group ${group} as ${role}`);

    // відправляємо користувачу його роль і (назву картки)
    socket.emit("registered", { ok: true, role, name, group });
    socket.emit("card", { role, image: `/cards/${role}.jpg` });

    // оновити список гравців у групі (не показуємо іншим картки)
    const playersInGroup = Object.values(playerData)
      .filter((p) => p.group === group)
      .map((p) => ({ name: p.name, role: p.role }));
    // емінт для всіх клієнтів, можна фільтрувати по групі, але простіше — клієнт сам фільтрує
    io.emit("players_update", playersInGroup);

    return callback({ ok: true, role, name, group });
  });

  // відправка приватного повідомлення
  // payload: { toRole, text }
  socket.on("send_message", ({ toRole, text }, callback) => {
    const from = playerData[socket.id];
    if (!from) return callback({ ok: false, error: "Неавторизований" });

    // перевірити дозволи:
    // B -> всім (A,C,D,E,F)
    // інші -> тільки B
    const allowed =
      from.role === "B"
        ? ROLES.includes(toRole) && toRole !== "B"
        : toRole === "B";

    if (!allowed) return callback({ ok: false, error: "Напрямок заборонено" });

    const toSocketId = getSocketByRoleAndGroup(toRole, from.group);
    if (!toSocketId) return callback({ ok: false, error: `Користувач ${toRole} не знайдений у групі` });

    // надсилаємо на конкретний сокет (отримувачу)
    io.to(toSocketId).emit("private_message", {
      fromRole: from.role,
      fromName: from.name,
      text,
      timestamp: Date.now(),
    });

    // також емметься відправнику щоб винести в локальний лог
    callback({ ok: true });
  });

  // C надсилає фінальну відповідь: { answer }
  socket.on("submit_answer", ({ answer }, callback) => {
    const from = playerData[socket.id];
    if (!from) return callback({ ok: false, error: "Неавторизований" });
    if (from.role !== "C") return callback({ ok: false, error: "Тільки C може надсилати фінальну відповідь" });

    // Розсилаємо повідомлення тільки гравцям тієї ж групи (без карток)
    for (const [id, p] of Object.entries(playerData)) {
      if (p.group === from.group) {
        io.to(id).emit("game_result", {
          message: `Гравець ${from.name} (${from.role}) надіслав відповідь: ${answer}`,
        });
      }
    }
    callback({ ok: true });
  });

  socket.on("disconnect", () => {
    const p = playerData[socket.id];
    if (p) {
      console.log(`🔌 Disconnect ${p.name} (${p.role})`);
      delete playerData[socket.id];
      // оновлення гравців
      io.emit("players_update", Object.values(playerData).map((x) => ({ name: x.name, role: x.role, group: x.group })));
    } else {
      console.log("🔌 Disconnect unknown socket", socket.id);
    }
  });
});

// health
app.get("/", (req, res) => res.send("Find-the-answer-game server running"));

server.listen(PORT, () => console.log(`Server on port ${PORT}, GROUPS=${GROUPS}`));
