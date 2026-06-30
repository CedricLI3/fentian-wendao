/* ============================================================
 * 焚天问道 · 文字修仙引擎 (engine.js)
 * 与剧情内容无关，负责：状态 / 数值 / 分支 / 渲染 / 存档
 * 剧情数据见 story.js (window.STORY)
 * ============================================================ */

const REALMS = ["凝气境", "筑基境", "金丹境", "元婴境", "化神境", "炼虚境", "合体境", "大乘境", "渡劫境"];
const LV_CN = ["一重", "二重", "三重", "四重", "五重", "六重", "七重", "八重", "九重"];
const SAVE_KEY = "fentian_save_v1";

/* ---------- 初始玩家状态 ---------- */
function newPlayer() {
  return {
    name: "林夜",
    realmTier: 0,        // 索引 REALMS
    realmLevel: 3,       // 1..9 (开局凝气三重·废物)
    exp: 0,              // 当前重的玄气，满 100 突破一重
    attrs: { 根骨: 3, 悟性: 7, 神识: 5, 气运: 6 },
    dao: 0,              // 道心 -100(魔) .. +100(正)
    stones: 0,           // 灵石
    inventory: [],       // [{name, desc, qty}]
    flags: {},           // 剧情标记
    rel: {},             // 人际好感度
    node: "start",
    log: [],             // 近期事件记录
  };
}

let player = newPlayer();

/* ---------- 工具 ---------- */
function realmName(p) { return REALMS[p.realmTier] + LV_CN[p.realmLevel - 1]; }

function expToLevel(p, gain) {
  p.exp += gain;
  while (p.exp >= 100) {
    p.exp -= 100;
    if (p.realmLevel < 9) {
      p.realmLevel++;
      pushLog(`修为精进，突破至 ${realmName(p)}！`);
    } else if (p.realmTier < REALMS.length - 1) {
      p.realmTier++; p.realmLevel = 1;
      pushLog(`境界突破！踏入 ${REALMS[p.realmTier]}！`);
    } else {
      p.exp = 100; break;
    }
  }
}

function pushLog(text) {
  player.log.unshift(text);
  if (player.log.length > 6) player.log.pop();
}

function hasItem(name) { return player.inventory.some(i => i.name === name); }
function addItem(name, desc, qty = 1) {
  const it = player.inventory.find(i => i.name === name);
  if (it) it.qty += qty; else player.inventory.push({ name, desc, qty });
}

/* ---------- 应用效果 ---------- */
// effects: { exp, dao, stones, attrs:{根骨:+1}, flag:{key:val}, rel:{name:+5}, item:["名|描述|数量"], removeItem:[名] }
function applyEffects(fx) {
  if (!fx) return;
  if (fx.exp) { expToLevel(player, fx.exp); pushLog(`玄气 +${fx.exp}`); }
  if (fx.dao) { player.dao = Math.max(-100, Math.min(100, player.dao + fx.dao)); }
  if (fx.stones) { player.stones += fx.stones; }
  if (fx.attrs) for (const k in fx.attrs) {
    player.attrs[k] = (player.attrs[k] || 0) + fx.attrs[k];
    pushLog(`${k} ${fx.attrs[k] > 0 ? "+" : ""}${fx.attrs[k]}`);
  }
  if (fx.flag) for (const k in fx.flag) player.flags[k] = fx.flag[k];
  if (fx.rel) for (const k in fx.rel) player.rel[k] = (player.rel[k] || 0) + fx.rel[k];
  if (fx.item) fx.item.forEach(s => { const [n, d, q] = s.split("|"); addItem(n, d || "", +(q || 1)); pushLog(`获得 ${n}`); });
  if (fx.removeItem) fx.removeItem.forEach(n => {
    const it = player.inventory.find(i => i.name === n);
    if (it) { it.qty--; if (it.qty <= 0) player.inventory = player.inventory.filter(i => i.name !== n); }
  });
}

/* ---------- 条件判定 ---------- */
// require: { attr:{根骨:5}, flag:{key:val}, item:"名", dao:[min,max], notFlag:"key" }
function meetsRequire(req) {
  if (!req) return true;
  if (req.attr) for (const k in req.attr) if ((player.attrs[k] || 0) < req.attr[k]) return false;
  if (req.flag) for (const k in req.flag) if (player.flags[k] !== req.flag[k]) return false;
  if (req.notFlag && player.flags[req.notFlag]) return false;
  if (req.item && !hasItem(req.item)) return false;
  if (req.dao && (player.dao < req.dao[0] || player.dao > req.dao[1])) return false;
  return true;
}

/* ---------- 存档 ---------- */
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(player)); flash("已保存"); } catch (e) {} }
function load() {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) { player = Object.assign(newPlayer(), JSON.parse(s)); render(); flash("读档成功"); return true; }
  } catch (e) {}
  flash("没有存档"); return false;
}
function reset() {
  if (!confirm("确定重开？当前进度将被覆盖。")) return;
  player = newPlayer(); localStorage.removeItem(SAVE_KEY); render();
}

/* ---------- 渲染 ---------- */
function fmtText(t) {
  const daoMap = { 魔: "魔（已近魔道）", 邪: "邪（偏离正途）", 中: "中（尚在歧路）", 正: "正（持身守正）", 侠: "侠（侠义昭彰）" };
  return t.replace(/\{name\}/g, player.name)
          .replace(/\{flagFunc\}/g, player.flags.功法 || "无名心法")
          .replace(/\{daoText\}/g, daoMap[daoLabel()] || daoLabel())
          .replace(/\*\*(.+?)\*\*/g, "<b class='hl'>$1</b>")
          .replace(/\n/g, "<br>");
}

function daoLabel() {
  const d = player.dao;
  if (d <= -50) return "魔";
  if (d < -15) return "邪";
  if (d <= 15) return "中";
  if (d < 50) return "正";
  return "侠";
}

function render() {
  const node = STORY[player.node];
  if (!node) { document.getElementById("scene").innerHTML = "（剧情待续…）"; return; }

  // 进入节点的自动效果（仅首次）
  const seenKey = "_seen_" + player.node;
  if (node.onEnter && !player.flags[seenKey]) {
    applyEffects(node.onEnter);
    player.flags[seenKey] = true;
  }

  // 状态栏
  const a = player.attrs;
  document.getElementById("statusbar").innerHTML = `
    <div class="srow">
      <span class="name">${player.name}</span>
      <span class="realm">${realmName(player)}</span>
      <span class="dao dao-${daoLabel()}">道心·${daoLabel()}</span>
    </div>
    <div class="expbar"><div class="expfill" style="width:${player.exp}%"></div></div>
    <div class="attrs">
      <span>根骨 ${a.根骨}</span><span>悟性 ${a.悟性}</span>
      <span>神识 ${a.神识}</span><span>气运 ${a.气运}</span>
      <span>灵石 ${player.stones}</span>
    </div>`;

  // 正文
  const sc = document.getElementById("scene");
  let html = "";
  if (node.title) html += `<h2 class="ch-title">${node.title}</h2>`;
  html += `<div class="prose">${fmtText(node.text)}</div>`;

  // 选项
  html += `<div class="choices">`;
  const choices = (node.choices || []).filter(c => meetsRequire(c.require));
  if (choices.length === 0) {
    html += `<button class="choice end" onclick="restart()">— 此路终结 · 重新开始 —</button>`;
  } else {
    choices.forEach((c, i) => {
      const locked = c.showLocked && !meetsRequire(c.require);
      html += `<button class="choice" onclick="choose(${i})">
        <span class="cdot">◈</span>${c.text}${c.tag ? `<em class="ctag">${c.tag}</em>` : ""}
      </button>`;
    });
  }
  html += `</div>`;
  sc.innerHTML = html;
  sc.scrollTop = 0;

  // 事件记录
  document.getElementById("log").innerHTML =
    player.log.length ? player.log.map(l => `<div>· ${l}</div>`).join("") : "<div class='muted'>—</div>";

  renderBag();
  save(); // 自动存档
}

function renderBag() {
  const bag = document.getElementById("bag");
  if (!player.inventory.length) { bag.innerHTML = "<div class='muted'>囊中空空</div>"; return; }
  bag.innerHTML = player.inventory.map(i =>
    `<div class="item" title="${i.desc}"><b>${i.name}</b>${i.qty > 1 ? " ×" + i.qty : ""}<small>${i.desc}</small></div>`
  ).join("");
}

/* ---------- 交互 ---------- */
function choose(i) {
  const node = STORY[player.node];
  const choices = (node.choices || []).filter(c => meetsRequire(c.require));
  const c = choices[i];
  if (!c) return;
  applyEffects(c.effects);
  if (typeof c.to === "function") player.node = c.to(player);
  else player.node = c.to;
  render();
}
function restart() { reset(); }

/* ---------- 提示 ---------- */
let flashTimer;
function flash(msg) {
  const el = document.getElementById("flash");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove("show"), 1200);
}

/* ---------- 名字设定 + 启动 ---------- */
function startGame() {
  const inp = document.getElementById("nameInput").value.trim();
  if (inp) player.name = inp.slice(0, 6);
  document.getElementById("cover").style.display = "none";
  render();
}

window.addEventListener("DOMContentLoaded", () => {
  // 若有存档，封面提供"继续"
  if (localStorage.getItem(SAVE_KEY)) {
    document.getElementById("continueBtn").style.display = "inline-block";
  }
});
function continueGame() {
  document.getElementById("cover").style.display = "none";
  load();
}
