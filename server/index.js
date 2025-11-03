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

const ROLES = ["A","B","C","D","E","F"];
const playerData = {};

function assignRoleForGroup(group){
  const taken = Object.values(playerData).filter(p=>p.group===group).map(p=>p.role);
  for(const r of ROLES) if(!taken.includes(r)) return r;
  return null;
}
function getSocketByRoleAndGroup(role, group){
  for(const [id,p] of Object.entries(playerData)){
    if(p.group===group && p.role===role) return id;
  }
  return null;
}

io.on("connection", socket => {
  console.log("🔗 New connection", socket.id);
  socket.emit("group_count", GROUPS);

  socket.on("register", ({name, group}, callback) => {
    group = parseInt(group) || 1;
    if(group < 1 || group > GROUPS) group = 1;
    const role = assignRoleForGroup(group);
    if(!role) return callback({ok:false, error:"All roles in this group are taken"});
    playerData[socket.id] = { name, role, group };
    console.log(`User ${name} joined group ${group} as ${role}`);
    socket.emit("registered", { ok:true, role, name, group });
    socket.emit("card", { role, image: `/cards/${role}.jpg` });
    const playersInGroup = Object.values(playerData).filter(p=>p.group===group).map(p=>({name:p.name, role:p.role}));
    io.emit("players_update", playersInGroup);
    return callback({ok:true, role, name, group});
  });

  socket.on("send_message", ({toRole,text}, callback) => {
    const from = playerData[socket.id];
    if(!from) return callback({ok:false, error:"Not authorized"});
    const allowed = from.role === "B" ? (ROLES.includes(toRole) && toRole!=="B") : (toRole === "B");
    if(!allowed) return callback({ok:false, error:"Direction not allowed"});
    const toSocketId = getSocketByRoleAndGroup(toRole, from.group);
    if(!toSocketId) return callback({ok:false, error:`Player ${toRole} not found in your group`});
    io.to(toSocketId).emit("private_message", { fromRole: from.role, fromName: from.name, text, timestamp: Date.now() });
    callback({ok:true});
  });

  socket.on("submit_answer", ({answer}, callback) => {
    const from = playerData[socket.id];
    if(!from) return callback({ok:false, error:"Not authorized"});
    if(from.role !== "C") return callback({ok:false, error:"Only C can submit the final answer"});
    for(const [id,p] of Object.entries(playerData)){
      if(p.group === from.group) {
        io.to(id).emit("game_result", { message: `Player ${from.name} (${from.role}) submitted: ${answer}` });
      }
    }
    callback({ok:true});
  });

  socket.on("disconnect", () => {
    const p = playerData[socket.id];
    if(p){
      console.log("🔌 Disconnect", p.name, p.role);
      delete playerData[socket.id];
      io.emit("players_update", Object.values(playerData).map(x=>({name:x.name, role:x.role, group:x.group})));
    }
  });
});

app.get("/", (req,res)=> res.send("Find-the-answer-game server running"));

server.listen(PORT, ()=> console.log(`Server listening on ${PORT}, GROUPS=${GROUPS}`));
