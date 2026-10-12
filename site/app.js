"use strict";

const $ = (sel) => document.querySelector(sel);
const LINE_COLORS = { heart: "--heart", head: "--head", life: "--life", fate: "--fate" };
const SECTION_ICONS = { personality: "✦", love: "♥", money: "◈", career: "▲", energy: "☀" };

const state = { rules: null, ai: false, photo: null, answers: {}, uncertain: new Set(), result: null };

// ---------- 화면 전환 ----------
function show(name) {
  document.querySelectorAll(".screen").forEach((s) => s.toggleAttribute("data-active", s.id === `screen-${name}`));
  window.scrollTo({ top: 0 });
}
document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => show(b.dataset.go)));

async function api(path, body) {
  const res = await fetch(path, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "요청에 실패했어요.");
  return data;
}

// ---------- 1. 사진 ----------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("사진을 열 수 없어요.")); };
    img.src = url;
  });
}

// 업로드 용량을 줄이려고 긴 변 1280px JPEG로 줄인다
function resize(img, max = 1280) {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), width: canvas.width, height: canvas.height, canvas };
}

// 밝기·대비로 손금이 보일 만한 사진인지 기기 안에서 먼저 확인한다
function checkQuality({ canvas, width, height }) {
  const size = 64;
  const small = document.createElement("canvas");
  small.width = small.height = size;
  const ctx = small.getContext("2d");
  ctx.drawImage(canvas, 0, 0, size, size);
  const px = ctx.getImageData(0, 0, size, size).data;
  let sum = 0, sumSq = 0;
  for (let i = 0; i < px.length; i += 4) {
    const y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    sum += y; sumSq += y * y;
  }
  const n = px.length / 4, mean = sum / n, sd = Math.sqrt(sumSq / n - mean * mean);
  if (Math.min(width, height) < 400) return { ok: false, msg: "사진이 너무 작아요. 손바닥을 더 가까이 찍어 주세요." };
  if (mean < 70) return { ok: false, msg: "사진이 어두워요. 밝은 곳에서 다시 찍으면 손금이 더 잘 보여요." };
  if (mean > 225) return { ok: false, msg: "사진이 너무 밝아요. 플래시를 끄고 다시 찍어 주세요." };
  if (sd < 18) return { ok: false, msg: "대비가 낮아 선이 흐려 보여요. 조명을 바꿔 다시 찍어 보세요." };
  return { ok: true, msg: "사진 상태가 좋아요. 다음으로 넘어가 주세요." };
}

$("#file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const quality = $("#quality");
  try {
    const img = await loadImage(file);
    const shot = resize(img);
    state.photo = shot.dataUrl;
    $("#preview").src = shot.dataUrl;
    $("#preview").hidden = false;
    $("#dz-empty").hidden = true;
    const q = checkQuality(shot);
    quality.textContent = q.ok ? q.msg : `${q.msg} 그래도 계속할 수 있어요.`;
    quality.classList.toggle("ok", q.ok);
    quality.hidden = false;
    $("#to-check").disabled = false;
  } catch (err) {
    quality.textContent = err.message;
    quality.hidden = false;
  }
});

$("#to-check").addEventListener("click", () => startCheck(true));
$("#skip-photo").addEventListener("click", () => { state.photo = null; startCheck(false); });

// ---------- 2. 손금 확인 ----------
function startCheck(withPhoto) {
  state.answers = {};
  state.uncertain = new Set();
  const wrap = $("#photo-wrap");
  const photo = $("#check-photo");
  $("#overlay").innerHTML = "";
  // 범례는 그림이나 AI가 그린 선이 있을 때만 보여 준다
  $(".legend").hidden = Boolean(withPhoto && state.photo);
  if (withPhoto && state.photo) {
    photo.src = state.photo;
    photo.hidden = false;
    wrap.classList.remove("no-photo");
    wrap.querySelector(".hero-palm")?.remove();
  } else {
    photo.hidden = true;
    wrap.classList.add("no-photo");
    if (!wrap.querySelector(".hero-palm")) wrap.prepend($(".hero-palm").cloneNode(true));
  }
  buildForm();
  show("check");
  if (withPhoto && state.photo && state.ai) runAI();
  else setStatus(withPhoto ? "사진을 보며 직접 골라 주세요." : "왼쪽 그림에서 선 위치를 확인하며 골라 주세요.");
}

function setStatus(text) {
  const el = $("#ai-status");
  el.textContent = text;
  el.hidden = !text;
}

async function runAI() {
  setStatus("AI가 손금을 읽고 있어요… (10~30초)");
  $("#q-form").setAttribute("aria-busy", "true");
  try {
    const r = await api("api/analyze", { image: state.photo });
    if (!r.photo_ok) {
      setStatus(`${r.photo_issue || "손바닥이 잘 보이지 않아요."} 다시 찍거나 직접 골라 주세요.`);
      return;
    }
    state.answers = { ...r.answers };
    state.uncertain = new Set(r.uncertain || []);
    drawLines(r.lines || {}, r.answers.simian === "yes");
    buildForm();
    const n = state.uncertain.size;
    setStatus(n ? `AI가 미리 골라 뒀어요. 표시된 ${n}개 항목은 꼭 확인해 주세요.` : "AI가 미리 골라 뒀어요. 맞는지 확인만 해 주세요.");
    $("#q-intro").textContent = "AI가 고른 답이 내 손과 다르면 바꿔 주세요.";
  } catch (err) {
    setStatus(err.message);
  } finally {
    $("#q-form").removeAttribute("aria-busy");
  }
}

function drawLines(lines, simian) {
  const svg = $("#overlay");
  svg.setAttribute("viewBox", "0 0 100 100");
  const css = getComputedStyle(document.documentElement);
  svg.innerHTML = "";
  for (const [name, pts] of Object.entries(lines)) {
    if (!pts || pts.length < 2 || (simian && name === "head")) continue;
    const pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    pl.setAttribute("points", pts.map((p) => `${(p.x * 100).toFixed(1)},${(p.y * 100).toFixed(1)}`).join(" "));
    pl.setAttribute("stroke", css.getPropertyValue(LINE_COLORS[name]).trim());
    svg.appendChild(pl);
  }
  $(".legend").hidden = !svg.childElementCount;
}

function isSkipped(q) {
  return Object.entries(q.skip_if || {}).some(([k, v]) => state.answers[k] === v);
}

function buildForm() {
  const form = $("#q-form");
  form.innerHTML = "";
  let group = null;
  for (const q of state.rules.questions) {
    if (q.group !== group) {
      group = q.group;
      const h = document.createElement("p");
      h.className = "q-group";
      h.textContent = group;
      h.dataset.group = group;
      form.appendChild(h);
    }
    const fs = document.createElement("fieldset");
    fs.className = "q" + (state.uncertain.has(q.id) ? " uncertain" : "");
    fs.dataset.id = q.id;
    fs.dataset.group = q.group;
    const legend = document.createElement("legend");
    legend.textContent = q.title;
    if (state.uncertain.has(q.id)) {
      const flag = document.createElement("span");
      flag.className = "flag";
      flag.textContent = "확인 필요";
      legend.appendChild(flag);
    }
    fs.appendChild(legend);
    if (q.hint) {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.textContent = q.hint;
      fs.appendChild(hint);
    }
    const opts = document.createElement("div");
    opts.className = "opts";
    for (const o of q.options) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.id;
      input.value = o.value;
      input.checked = state.answers[q.id] === o.value;
      input.addEventListener("change", () => {
        state.answers[q.id] = o.value;
        state.uncertain.delete(q.id);
        fs.classList.remove("uncertain");
        fs.querySelector(".flag")?.remove();
        refreshForm();
      });
      const span = document.createElement("span");
      span.textContent = o.label;
      label.append(input, span);
      opts.appendChild(label);
    }
    fs.appendChild(opts);
    form.appendChild(fs);
  }
  refreshForm();
}

// 막쥔손금이면 감정선·두뇌선 질문을 숨기고, 진행률과 버튼 상태를 갱신한다
function refreshForm() {
  const active = PalmEngine.activeQuestions(state.rules, state.answers);
  const activeIds = new Set(active.map((q) => q.id));
  document.querySelectorAll("#q-form fieldset").forEach((fs) => { fs.hidden = !activeIds.has(fs.dataset.id); });
  document.querySelectorAll("#q-form .q-group").forEach((h) => {
    h.hidden = !active.some((q) => q.group === h.dataset.group);
  });
  const done = active.filter((q) => state.answers[q.id]).length;
  $("#progress-fill").style.width = `${(done / active.length) * 100}%`;
  $("#to-result").disabled = done < active.length;
  $("#to-result").textContent = done < active.length ? `결과 보기 (${done}/${active.length})` : "결과 보기";
}

$("#to-result").addEventListener("click", () => {
  const err = $("#form-error");
  err.hidden = true;
  try {
    state.result = PalmEngine.interpret(state.rules, state.answers);
    renderResult(state.result);
    show("result");
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
});

// ---------- 3. 결과 ----------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function renderResult(r) {
  $("#r-hand").textContent = r.hand_type.label;
  $("#r-nickname").textContent = r.hand_type.nickname;
  $("#r-summary").textContent = r.hand_type.summary;
  $("#r-tags").replaceChildren(...r.tags.map((t) => el("li", null, `#${t}`)));

  $("#r-indices").replaceChildren(...r.indices.map((i) => {
    const row = el("div", "index-row index");
    const left = el("span", i.score < 50 ? "strong" : null, i.left);
    const track = el("div", "index-track");
    const dot = el("div", "index-dot");
    dot.style.left = `${i.score}%`;
    dot.title = `${i.label} ${i.score}`;
    track.appendChild(dot);
    const right = el("span", i.score >= 50 ? "strong" : null, i.label);
    row.append(left, track, right);
    return row;
  }));

  $("#r-sections").replaceChildren(...r.sections.map((s) => {
    const card = el("div", "card");
    const h = el("h3");
    h.append(el("span", "sec-icon", SECTION_ICONS[s.id] || "•"), s.label);
    card.appendChild(h);
    s.texts.forEach((t) => card.appendChild(el("p", null, t)));
    return card;
  }));

  $("#r-observe").replaceChildren(...r.observations.map((o) => el("li", null, o)));
  $("#r-daily").textContent = r.daily_word;
  $("#premium-note").hidden = true;
}

$("#premium").addEventListener("click", () => { $("#premium-note").hidden = false; });
$("#restart").addEventListener("click", () => {
  state.photo = null;
  $("#file").value = "";
  $("#preview").hidden = true;
  $("#dz-empty").hidden = false;
  $("#quality").hidden = true;
  $("#to-check").disabled = true;
  show("capture");
});

// ---------- 공유 카드 ----------
// 띄어쓰기 단위로 줄을 나눠 단어 중간에서 끊기지 않게 한다
function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(r) {
  const W = 1080, H = 1350, pad = 96;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#f3e6dc"); g.addColorStop(1, "#fbf8f4");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const serif = '"Noto Serif KR", serif', sans = '"Noto Sans KR", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = "#8a4b2f";
  ctx.font = `700 40px ${sans}`;
  ctx.fillText(r.hand_type.label, W / 2, 210);
  ctx.fillStyle = "#2a2420";
  ctx.font = `700 84px ${serif}`;
  ctx.fillText(r.hand_type.nickname, W / 2, 320);
  ctx.font = `500 36px ${sans}`;
  ctx.fillStyle = "#6f655d";
  ctx.fillText(r.tags.map((t) => `#${t}`).join("  "), W / 2, 395);

  ctx.textAlign = "left";
  let y = 520;
  for (const s of r.sections.slice(0, 3)) {
    ctx.fillStyle = "#8a4b2f";
    ctx.font = `700 34px ${sans}`;
    ctx.fillText(s.label, pad, y);
    y += 54;
    ctx.fillStyle = "#2a2420";
    ctx.font = `400 36px ${sans}`;
    for (const ln of wrapText(ctx, s.texts[0], W - pad * 2).slice(0, 2)) { ctx.fillText(ln, pad, y); y += 52; }
    y += 40;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#2a2420";
  ctx.font = `600 38px ${serif}`;
  wrapText(ctx, `“${r.daily_word}”`, W - pad * 2).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, W / 2, H - 230 + i * 54));
  ctx.fillStyle = "#6f655d";
  ctx.font = `400 28px ${sans}`;
  ctx.fillText("손금AI · 재미로 보는 손금", W / 2, H - 80);
  return c;
}

$("#share").addEventListener("click", async () => {
  if (!state.result) return;
  await document.fonts.ready;
  const canvas = drawCard(state.result);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const file = new File([blob], "my-palm.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "나의 손금" }); return; } catch { /* 취소하면 저장으로 */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- 시작 ----------
(async () => {
  try {
    state.rules = await (await fetch("rules.json")).json();
    document.querySelectorAll("[data-disclaimer]").forEach((p) => { p.textContent = state.rules.meta.disclaimer; });
  } catch {
    document.querySelector("#screen-home .lead").textContent = "해석 데이터를 불러오지 못했어요. 새로고침해 주세요.";
    return;
  }
  // AI 분석은 server.py로 실행할 때만 켜진다 (GitHub Pages에서는 꺼짐)
  try {
    state.ai = Boolean((await api("api/config")).ai);
  } catch {
    state.ai = false;
  }
})();
