/* RoomBudget standalone interactive prototype.
   No framework, API keys or backend. Projects are stored in localStorage. */
(function () {
  "use strict";

  var STORAGE_KEY = "roombudget-demo-v1";
  var CATALOG = [
    { type: "sofa", name: "Диван", emoji: "🛋️", w: 200, h: 90, price: 42900, color: "#b0d6bd" },
    { type: "bed", name: "Кровать", emoji: "🛏️", w: 200, h: 160, price: 39700, color: "#c6c9e9" },
    { type: "desk", name: "Рабочий стол", emoji: "🖥️", w: 140, h: 70, price: 16400, color: "#e7c59a" },
    { type: "wardrobe", name: "Шкаф", emoji: "🚪", w: 150, h: 60, price: 28700, color: "#dbcab5" },
    { type: "chair", name: "Кресло", emoji: "🪑", w: 80, h: 80, price: 9900, color: "#ecc5b7" },
    { type: "table", name: "Стол", emoji: "🍽️", w: 130, h: 80, price: 15400, color: "#d9b483" },
    { type: "plant", name: "Растение", emoji: "🪴", w: 50, h: 50, price: 3900, color: "#c4dfab" },
    { type: "dresser", name: "Комод", emoji: "🗄️", w: 120, h: 55, price: 14500, color: "#e3cfad" }
  ];

  function byType(type) { return CATALOG.find(function (t) { return t.type === type; }); }
  function el(id) { return document.getElementById(id); }
  function money(n) { return Math.round(n).toLocaleString("ru-RU") + " ₽"; }
  function metres(cm) { return (cm / 100).toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 2 }); }
  function escapeHtml(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }
  function number(n, fallback) { var v = Number(n); return Number.isFinite(v) ? v : fallback; }
  function initial() {
    return {
      roomW: 420, roomH: 320, budget: 130000, snap: true, selectedId: 1, nextId: 4,
      items: [
        { id: 1, type: "sofa", name: "Диван", x: 16, y: 18, w: 200, h: 90, price: 42900 },
        { id: 2, type: "desk", name: "Рабочий стол", x: 262, y: 195, w: 140, h: 70, price: 16400 },
        { id: 3, type: "plant", name: "Растение", x: 352, y: 15, w: 50, h: 50, price: 3900 }
      ]
    };
  }
  function validate(v) {
    if (!v || typeof v !== "object" || !Array.isArray(v.items) || v.items.length > 120) throw Error("Некорректный формат проекта");
    var s = initial();
    s.roomW = clamp(Math.round(number(v.roomW, 420)), 150, 1500);
    s.roomH = clamp(Math.round(number(v.roomH, 320)), 150, 1500);
    s.budget = clamp(Math.round(number(v.budget, 130000)), 1000, 100000000);
    s.snap = Boolean(v.snap);
    s.items = v.items.map(function (o, idx) {
      var def = byType(o.type);
      if (!def) throw Error("Неизвестный тип мебели в файле");
      return {
        id: idx + 1, type: def.type,
        name: String(o.name == null ? def.name : o.name).slice(0, 70),
        x: clamp(number(o.x, 0), 0, 1500),
        y: clamp(number(o.y, 0), 0, 1500),
        w: clamp(number(o.w, def.w), 20, 700),
        h: clamp(number(o.h, def.h), 20, 700),
        price: clamp(Math.round(number(o.price, def.price)), 0, 100000000)
      };
    });
    s.selectedId = s.items.length ? s.items[0].id : null;
    s.nextId = s.items.length;
    return s;
  }
  var state = initial();
  try {
    var saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) state = validate(JSON.parse(saved));
  } catch (err) { state = initial(); }

  var undoStack = [], redoStack = [], pointer = null, toastTimer = null;
  var room = el("room"), layer = el("furniture-layer");
  var selection = function () { return state.items.find(function (o) { return o.id === state.selectedId; }); };
  function total() { return state.items.reduce(function (sum, item) { return sum + item.price; }, 0); }
  function snapshot() { return JSON.stringify(state); }
  function record() { undoStack.push(snapshot()); if (undoStack.length > 50) undoStack.shift(); redoStack = []; }
  function persist() { try { window.localStorage.setItem(STORAGE_KEY, snapshot()); } catch (_) { } }
  function notify(msg) {
    var t = el("toast"); t.textContent = msg; t.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { t.classList.remove("show"); }, 2400);
  }
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function problems() {
    var result = new Set();
    state.items.forEach(function (a, i) {
      if (a.x < 0 || a.y < 0 || a.x + a.w > state.roomW + 0.01 || a.y + a.h > state.roomH + 0.01) result.add(a.id);
      for (var j = i + 1; j < state.items.length; j++) {
        var b = state.items[j];
        if (overlaps(a, b)) { result.add(a.id); result.add(b.id); }
      }
    });
    return result;
  }
  function drawStats() {
    var amount = total(), rem = state.budget - amount;
    el("stat-area").textContent = (state.roomW * state.roomH / 10000).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " м²";
    el("stat-size").textContent = metres(state.roomW) + " × " + metres(state.roomH) + " м";
    el("stat-total").textContent = money(amount);
    el("stat-count").textContent = "Предметов: " + state.items.length;
    el("stat-remaining").textContent = money(rem);
    el("stat-percent").textContent = amount > state.budget ? "Выше запланированной суммы" : "Использовано " + Math.round(amount / state.budget * 100) + "%";
    el("stat-remaining").parentElement.classList.toggle("over", rem < 0);
  }
  function drawBoard() {
    room.style.aspectRatio = state.roomW + "/" + state.roomH;
    room.style.backgroundSize = (1000 / state.roomW) + "% " + (1000 / state.roomH) + "%";
    el("ruler-width").textContent = metres(state.roomW) + " м";
    el("ruler-height").textContent = "Длина " + metres(state.roomH) + " м";
    el("room-width").value = String(state.roomW / 100);
    el("room-height").value = String(state.roomH / 100);
    el("snap-toggle").classList.toggle("active", state.snap);
    el("snap-toggle").setAttribute("aria-pressed", state.snap ? "true" : "false");
    var issues = problems();
    layer.innerHTML = state.items.map(function (o) {
      var def = byType(o.type);
      return '<div class="furniture' +
        (o.id === state.selectedId ? " is-selected" : "") +
        (issues.has(o.id) ? " is-overlap" : "") +
        '" data-fid="' + o.id + '" tabindex="0" role="button" aria-label="' + escapeHtml(o.name) + ', ' + o.w + ' на ' + o.h + ' сантиметров" ' +
        'style="left:' + o.x / state.roomW * 100 + '%;top:' + o.y / state.roomH * 100 +
        '%;width:' + o.w / state.roomW * 100 + '%;height:' + o.h / state.roomH * 100 +
        '%;background:' + def.color + '"><span class="emoji">' + def.emoji +
        '</span><span class="item-label">' + escapeHtml(o.name) +
        '</span><span class="dimensions">' + Math.round(o.w) + " × " + Math.round(o.h) + "</span></div>";
    }).join("");
    var status = el("collision-status");
    status.className = "board-status " + (issues.size ? "problem" : "success");
    status.textContent = issues.size ? "⚠ Проблема с размещением: " + issues.size + " предмет(ов) пересекаются или выходят за границы" : "✓ Пересечений нет. Мебель размещена внутри комнаты.";
  }
  function drawCatalog() {
    el("catalog").innerHTML = CATALOG.map(function (c) {
      return '<button class="catalog-item" data-add="' + c.type + '" type="button" aria-label="Добавить ' + escapeHtml(c.name) + '"><span class="item-emoji">' + c.emoji +
        '</span><b>' + escapeHtml(c.name) + '</b><small>' + c.w + " × " + c.h +
        ' см</small><span class="catalog-price">' + money(c.price) + "</span></button>";
    }).join("");
  }
  function drawInspector() {
    var selected = selection();
    if (!selected) {
      el("inspector").innerHTML = '<div class="inspector-empty">👆<br>Выберите мебель на плане<br>или добавьте предмет из каталога.</div>';
      return;
    }
    var def = byType(selected.type);
    el("inspector").innerHTML =
      '<div class="selected-card"><span class="large">' + def.emoji + '</span><span><strong>' + escapeHtml(selected.name) +
      '</strong><small>' + def.name + " · " + money(selected.price) + "</small></span></div>" +
      '<div class="input-grid">' +
      '<label class="field-label" style="grid-column:1/-1">Название<input class="text-input" data-field="name" maxlength="70" value="' + escapeHtml(selected.name) + '"></label>' +
      '<label class="field-label">Ширина, см<input class="text-input" type="number" inputmode="numeric" min="20" max="700" data-field="w" value="' + Math.round(selected.w) + '"></label>' +
      '<label class="field-label">Глубина, см<input class="text-input" type="number" inputmode="numeric" min="20" max="700" data-field="h" value="' + Math.round(selected.h) + '"></label>' +
      '<label class="field-label">X от левой стены, см<input class="text-input" type="number" inputmode="numeric" min="0" data-field="x" value="' + Math.round(selected.x) + '"></label>' +
      '<label class="field-label">Y от верхней стены, см<input class="text-input" type="number" inputmode="numeric" min="0" data-field="y" value="' + Math.round(selected.y) + '"></label>' +
      '<label class="field-label" style="grid-column:1/-1">Цена, ₽<input class="text-input" type="number" inputmode="numeric" min="0" max="100000000" data-field="price" value="' + selected.price + '"></label></div>' +
      '<div class="inspector-actions"><button class="btn btn-dark" type="button" data-action="rotate">↻ Повернуть</button>' +
      '<button class="btn btn-outline" type="button" data-action="duplicate">▢ Копия</button>' +
      '<button class="btn btn-outline delete" type="button" data-action="delete">✕ Удалить</button></div>';
  }
  function drawBudget() {
    var spent = total(), rem = state.budget - spent;
    el("budget").value = state.budget;
    el("budget-spent").textContent = money(spent);
    el("budget-left").textContent = money(rem);
    var bar = el("budget-bar"); bar.style.width = Math.min(100, spent / state.budget * 100) + "%"; bar.classList.toggle("over", rem < 0);
    var message = el("budget-message");
    message.classList.toggle("over", rem < 0);
    message.textContent = rem >= 0 ? "✓ Вы укладываетесь в бюджет. Осталось " + money(rem) + "." : "⚠ Бюджет превышен на " + money(-rem) + ".";
    el("list-count").textContent = "(" + state.items.length + ")";
    el("furniture-list").innerHTML = state.items.length ? state.items.map(function (o) {
      var def = byType(o.type);
      return '<div class="furniture-row' + (o.id === state.selectedId ? " selected" : "") +
        '" data-select="' + o.id + '" role="button" tabindex="0"><div class="row-left"><span class="row-icon">' +
        def.emoji + '</span><div><b>' + escapeHtml(o.name) + '</b><small>' + Math.round(o.w) + " × " +
        Math.round(o.h) + '</small></div></div><strong>' + money(o.price) + "</strong></div>";
    }).join("") : '<p class="inspector-empty">Пока пусто. Добавьте мебель из каталога.</p>';
  }
  function updateHistoryButtons() {
    el("undo").disabled = !undoStack.length; el("redo").disabled = !redoStack.length;
  }
  function render() {
    drawStats(); drawBoard(); drawInspector(); drawBudget(); updateHistoryButtons(); persist();
  }
  function select(id) { if (!state.items.some(function (o) { return o.id === id; })) return; state.selectedId = id; render(); }
  function addFurniture(type) {
    var def = byType(type); if (!def) return;
    record();
    var item = { id: ++state.nextId, type: def.type, name: def.name, w: def.w, h: def.h, x: 0, y: 0, price: def.price };
    var step = 10, found = false;
    for (var y = 10; y + item.h <= state.roomH && !found; y += step) {
      for (var x = 10; x + item.w <= state.roomW; x += step) {
        item.x = x; item.y = y;
        if (!state.items.some(function (other) { return overlaps(item, other); })) { found = true; break; }
      }
    }
    if (!found) {
      item.x = Math.max(0, Math.round((state.roomW - item.w) / 20) * 10);
      item.y = Math.max(0, Math.round((state.roomH - item.h) / 20) * 10);
      notify("Нет свободного места: переместите новый предмет.");
    }
    state.items.push(item); state.selectedId = item.id; render();
  }
  function modifySelected(kind) {
    var o = selection(); if (!o) return;
    record();
    if (kind === "rotate") {
      var width = o.w; o.w = o.h; o.h = width;
      o.x = Math.max(0, Math.min(o.x, state.roomW - o.w));
      o.y = Math.max(0, Math.min(o.y, state.roomH - o.h));
    }
    if (kind === "delete") {
      state.items = state.items.filter(function (x) { return x.id !== o.id; });
      state.selectedId = state.items.length ? state.items[0].id : null;
    }
    if (kind === "duplicate") {
      var copy = Object.assign({}, o, { id: ++state.nextId, name: o.name + " — копия" });
      copy.x = Math.max(0, Math.min(o.x + 20, state.roomW - copy.w));
      copy.y = Math.max(0, Math.min(o.y + 20, state.roomH - copy.h));
      state.items.push(copy); state.selectedId = copy.id;
      notify("Копия добавлена. Переместите её на свободное место.");
    }
    render();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    state = JSON.parse(undoStack.pop());
    render();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    state = JSON.parse(redoStack.pop());
    render();
  }
  function downloadFile(name, data, type) {
    var file = new Blob([data], { type: type }), url = URL.createObjectURL(file), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  document.addEventListener("click", function (e) {
    var button = e.target.closest("button");
    if (button && button.dataset.add) { addFurniture(button.dataset.add); return; }
    if (button && button.dataset.action) { modifySelected(button.dataset.action); return; }
    var selectedRow = e.target.closest("[data-select]");
    if (selectedRow) { select(Number(selectedRow.dataset.select)); return; }
    if (!button) return;
    if (button.id === "undo") undo();
    if (button.id === "redo") redo();
    if (button.id === "snap-toggle") { record(); state.snap = !state.snap; render(); }
    if (button.id === "reset") { record(); state = initial(); render(); notify("Пример планировки восстановлен."); }
    if (button.id === "clear") {
      if (!state.items.length) return;
      if (window.confirm("Удалить всю мебель из комнаты?")) { record(); state.items = []; state.selectedId = null; render(); }
    }
    if (button.id === "export") {
      downloadFile("roombudget-project.json", JSON.stringify(state, null, 2), "application/json");
      notify("Проект скачан в формате JSON.");
    }
    if (button.id === "print") window.print();
  });

  document.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && (t.matches("input,textarea,select") || t.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    var o = selection(); if (!o) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); modifySelected("delete"); return; }
    var dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    var dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!dx && !dy) return;
    e.preventDefault(); record();
    var step = e.shiftKey ? 1 : state.snap ? 10 : 1;
    o.x = clamp(o.x + dx * step, 0, Math.max(0, state.roomW - o.w));
    o.y = clamp(o.y + dy * step, 0, Math.max(0, state.roomH - o.h));
    render();
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "budget") {
      var amount = number(t.value, state.budget);
      if (amount < 1000 || amount > 100000000) { notify("Допустимый бюджет: от 1 000 до 100 000 000 ₽."); render(); return; }
      record(); state.budget = Math.round(amount); render(); return;
    }
    if (t.id === "room-width" || t.id === "room-height") {
      var w = number(el("room-width").value, state.roomW / 100) * 100;
      var h = number(el("room-height").value, state.roomH / 100) * 100;
      if (w < 150 || w > 1500 || h < 150 || h > 1500) { notify("Укажите размеры от 1,5 до 15 метров."); render(); return; }
      record();
      state.roomW = Math.round(w); state.roomH = Math.round(h);
      state.items.forEach(function (o) {
        o.x = clamp(o.x, 0, Math.max(0, state.roomW - o.w));
        o.y = clamp(o.y, 0, Math.max(0, state.roomH - o.h));
      });
      render(); return;
    }
    if (t.dataset.field) {
      var o = selection(); if (!o) return;
      var property = t.dataset.field;
      var v = property === "name" ? String(t.value).trim().slice(0, 70) : number(t.value, o[property]);
      if (property === "name" && !v) v = byType(o.type).name;
      if (property === "w" || property === "h") v = clamp(Math.round(v), 20, 700);
      if (property === "price") v = clamp(Math.round(v), 0, 100000000);
      if (property === "x") v = clamp(Math.round(v), 0, Math.max(0, state.roomW - o.w));
      if (property === "y") v = clamp(Math.round(v), 0, Math.max(0, state.roomH - o.h));
      if (o[property] !== v) { record(); o[property] = v; }
      render();
    }
  });

  el("import-json").addEventListener("change", function (e) {
    var input = e.target, file = input.files && input.files[0]; if (!file) return;
    if (file.size > 1024 * 1024) { notify("Файл слишком большой."); input.value = ""; return; }
    file.text().then(function (text) {
      var incoming = validate(JSON.parse(text));
      record(); state = incoming; render(); notify("Проект успешно загружен.");
    }).catch(function (err) { notify("Не удалось открыть проект: " + err.message); })
      .finally(function () { input.value = ""; });
  });

  room.addEventListener("pointerdown", function (e) {
    var node = e.target.closest("[data-fid]");
    if (!node) return;
    var o = state.items.find(function (x) { return x.id === Number(node.dataset.fid); });
    if (!o) return;
    state.selectedId = o.id;
    pointer = {
      id: e.pointerId, itemId: o.id, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y,
      rect: room.getBoundingClientRect(), moved: false
    };
    node.setPointerCapture(e.pointerId);
    room.querySelectorAll(".furniture").forEach(function (n) { n.classList.toggle("is-selected", n === node); });
    e.preventDefault();
  });
  room.addEventListener("pointermove", function (e) {
    if (!pointer || pointer.id !== e.pointerId) return;
    var o = state.items.find(function (x) { return x.id === pointer.itemId; });
    var node = layer.querySelector('[data-fid="' + pointer.itemId + '"]');
    if (!o || !node) return;
    var dx = (e.clientX - pointer.sx) / pointer.rect.width * state.roomW;
    var dy = (e.clientY - pointer.sy) / pointer.rect.height * state.roomH;
    var step = state.snap ? 10 : 1;
    var xx = clamp(Math.round((pointer.ox + dx) / step) * step, 0, Math.max(0, state.roomW - o.w));
    var yy = clamp(Math.round((pointer.oy + dy) / step) * step, 0, Math.max(0, state.roomH - o.h));
    if (xx === o.x && yy === o.y) return;
    if (!pointer.moved) { record(); pointer.moved = true; }
    o.x = xx; o.y = yy;
    node.style.left = o.x / state.roomW * 100 + "%";
    node.style.top = o.y / state.roomH * 100 + "%";
    node.classList.toggle("is-overlap", problems().has(o.id));
    e.preventDefault();
  });
  function finishPointer(e) {
    if (!pointer || (e.pointerId !== undefined && pointer.id !== e.pointerId)) return;
    pointer = null; render();
  }
  room.addEventListener("pointerup", finishPointer);
  room.addEventListener("pointercancel", finishPointer);
  room.addEventListener("lostpointercapture", function (e) { finishPointer(e); });

  drawCatalog(); render();
})();