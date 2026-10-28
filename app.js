/* QCM Classe – application élève et enseignant (aucune dépendance). */
(function () {
  "use strict";

  const API = (window.QCM_CONFIG && window.QCM_CONFIG.API_URL) || "";
  const LETTERS = "ABCDEFGH";
  const app = document.getElementById("app");

  /* ---------- Outils ---------- */

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
      else if (k === "checked") el.checked = !!v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* rien */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* rien */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* rien */ } },
  };

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function show(...nodes) {
    app.replaceChildren(...nodes.flat().filter((n) => n !== null && n !== undefined && n !== false));
    window.scrollTo(0, 0);
  }

  function loading(msg) {
    show(h("div", { class: "empty" }, h("div", { class: "spinner" }), h("p", { text: msg || "Chargement…" })));
  }

  function errorView(msg, retry) {
    show(h("div", { class: "card stack" },
      h("h2", { text: "Impossible de continuer" }),
      h("p", { text: msg }),
      retry ? h("div", { class: "row" }, h("button", { class: "btn primary", onclick: retry, text: "Réessayer" })) : null));
  }

  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }

  function fmtNum(n) {
    return Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }

  function uid(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function slug(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "qcm";
  }

  /* ---------- Accès au script Google ---------- */

  function apiReady() {
    return /^https?:\/\//.test(API);
  }

  async function apiGet(params) {
    const url = API + (API.includes("?") ? "&" : "?") + new URLSearchParams(params).toString();
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    return checkJson(res);
  }

  async function apiPost(body) {
    // Corps en texte brut : évite la requête préalable CORS refusée par Google Apps Script.
    const res = await fetch(API, { method: "POST", redirect: "follow", body: JSON.stringify(body) });
    return checkJson(res);
  }

  async function checkJson(res) {
    let data;
    try { data = await res.json(); } catch (e) { throw new Error("Réponse illisible du serveur. Vérifiez l'adresse du script dans config.js."); }
    if (!data.ok) throw new Error(data.error || "Erreur du serveur.");
    return data;
  }

  /* ---------- Mise en forme des documents du cas ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function inline(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<em>$2</em>");
  }
  /** Mini-markdown : ## titres, - listes, tableaux | a | b |, **gras**. */
  function renderMd(src) {
    const lines = String(src || "").replace(/\r/g, "").split("\n");
    let html = "", i = 0;
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) { i++; continue; }
      if (/^#{1,3}\s/.test(l)) { html += "<h3>" + inline(l.replace(/^#+\s*/, "")) + "</h3>"; i++; continue; }
      if (l.startsWith("|")) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i].trim()); i++; }
        const cells = rows.filter((r) => !/^\|[\s|:-]+\|?$/.test(r))
          .map((r) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
        html += '<div class="tbl"><table>' + cells.map((r, k) => "<tr>" + r.map((c) =>
          (k === 0 ? "<th>" : "<td>") + inline(c) + (k === 0 ? "</th>" : "</td>")).join("") + "</tr>").join("") + "</table></div>";
        continue;
      }
      if (/^[-*]\s/.test(l)) {
        const items = [];
        while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) { items.push(lines[i].trim().slice(2)); i++; }
        html += "<ul>" + items.map((it) => "<li>" + inline(it) + "</li>").join("") + "</ul>";
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\||[-*]\s)/.test(lines[i].trim())) { para.push(lines[i].trim()); i++; }
      html += "<p>" + inline(para.join(" ")) + "</p>";
    }
    const div = h("div", { class: "md" });
    div.innerHTML = html;
    return div;
  }

  function docsPanel(quiz) {
    const wrap = h("div", { class: "docs", role: "dialog", "aria-modal": "true", "aria-label": "Documents" });
    const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    document.addEventListener("keydown", onKey);
    wrap.append(h("div", { class: "docs-panel" },
      h("div", { class: "docs-head" }, h("h2", { text: "Documents" }),
        h("button", { class: "btn small", onclick: close, text: "Fermer" })),
      renderMd(quiz.context)));
    document.body.append(wrap);
    wrap.querySelector("button").focus();
  }

  /* ---------- Élève : liste des QCM ---------- */

  async function viewHome() {
    if (!apiReady()) return viewSetup();
    loading("Chargement des QCM…");
    let data;
    try { data = await apiGet({ action: "list" }); }
    catch (e) { return errorView(navigator.onLine ? e.message : "Vous êtes hors ligne. Connectez-vous pour voir les QCM.", viewHome); }
    const pending = store.get("pending", []);
    const list = data.quizzes || [];
    show(
      h("div", { class: "stack" },
        h("h1", { text: "QCM disponibles" }),
        h("p", { class: "muted", text: "Choisissez le QCM indiqué par votre enseignant." })),
      pending.length ? h("div", { class: "banner warn row spread" },
        h("span", { text: pending.length + " copie(s) n'ont pas encore été envoyées." }),
        h("button", { class: "btn small", onclick: sendPending, text: "Envoyer maintenant" })) : null,
      list.length ? h("div", { class: "stack" }, list.map((q) => h("article", { class: "card quiz-card" },
        h("div", { class: "row spread" },
          h("h2", { text: q.title }),
          h("span", { class: "pill" + (q.mode === "evaluation" ? " eval" : ""), text: q.mode === "evaluation" ? "Évaluation" : "Entraînement" })),
        h("div", { class: "meta" },
          h("span", { text: q.count + " questions" }),
          q.duration ? h("span", { text: "· " + q.duration + " min" }) : null),
        h("div", { class: "row" }, h("a", { class: "btn primary", href: "#qcm/" + encodeURIComponent(q.id), text: "Commencer" })))))
        : h("div", { class: "card empty" }, h("h2", { text: "Aucun QCM ouvert pour le moment" }),
          h("p", { text: "Votre enseignant ouvrira le QCM au début de la séance." }),
          h("button", { class: "btn", onclick: viewHome, text: "Actualiser" })));
  }

  function viewSetup() {
    show(h("div", { class: "card stack" },
      h("h1", { text: "Application à configurer" }),
      h("p", { text: "L'adresse du script Google n'est pas encore renseignée dans le fichier config.js." }),
      h("p", { class: "muted", text: "Suivez l'étape 3 du guide d'installation, puis rechargez la page." })));
  }

  async function sendPending() {
    const pending = store.get("pending", []);
    const left = [];
    for (const p of pending) {
      try { await apiPost(p); } catch (e) { left.push(p); }
    }
    store.set("pending", left);
    toast(left.length ? "Envoi impossible pour l'instant. Réessayez plus tard." : "Copies envoyées.");
    viewHome();
  }

  /* ---------- Types de questions ---------- */

  const TYPES = {
    single: "Une seule bonne réponse",
    multi: "Plusieurs bonnes réponses",
    number: "Réponse chiffrée",
    match: "Association (flèches à relier)",
  };
  const typeOf = (q) => q.type || "single";

  /** Lit un nombre saisi à la française : « 16 200 », « -42 400 », « 6,67 », « 72 000 € ». */
  function parseNum(s) {
    const t = String(s === undefined || s === null ? "" : s).replace(/[\s\u00a0\u202f€%]/g, "")
      .replace(/[–−]/g, "-").replace(",", ".");
    if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
    return Number(t);
  }

  function isAnswered(q, a) {
    const t = typeOf(q);
    if (a === undefined || a === null) return false;
    if (t === "multi") return Array.isArray(a) && a.length > 0;
    if (t === "match") return Array.isArray(a) && a.some((x) => x !== null && x !== undefined);
    if (t === "number") return typeof a === "number" && isFinite(a);
    return true;
  }

  function fmtAnswer(q, a) {
    const t = typeOf(q);
    if (!isAnswered(q, a)) return "";
    if (t === "single") return LETTERS[a] || "";
    if (t === "multi") return a.slice().sort().map((k) => LETTERS[k]).join("+");
    if (t === "number") return fmtNum(a);
    if (t === "match") return a.map((x, i) => (i + 1) + (x === null || x === undefined ? "-" : LETTERS[x])).join(" ");
    return "";
  }

  /* ---------- Flèches à relier ---------- */

  const SVG_NS = "http://www.w3.org/2000/svg";
  let boardSeq = 0;

  /**
   * Deux colonnes d'éléments reliés par des flèches.
   * cur[i] = index de la réponse reliée à l'élément i (ou null).
   * opts.readonly : affichage seul (correction) ; opts.status[i] : true/false pour colorer juste/faux.
   */
  function arrowBoard(q, cur, onChange, opts) {
    opts = opts || {};
    const ro = !!opts.readonly;
    const id = "ab" + (++boardSeq);
    const order = opts.rightOrder || q.choices.map((_, k) => k);
    let activeL = null, activeR = null;
    const colorOf = (i) => "var(--c" + ((i % 6) + 1) + ")";
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "arrows-svg");
    svg.setAttribute("aria-hidden", "true");
    const tip = h("p", { class: "muted small arrows-tip", "aria-live": "polite" });
    const leftBtns = q.items.map((it, i) => h("button", {
      type: "button", class: "anode left", "data-i": String(i), disabled: ro,
      onclick: () => pickLeft(i),
    }, h("span", { class: "atext", text: it.text }), h("span", { class: "dotc" })));
    const rightBtns = {};
    order.forEach((k) => {
      rightBtns[k] = h("button", { type: "button", class: "anode right", "data-k": String(k), disabled: ro, onclick: () => pickRight(k) },
        h("span", { class: "dotc" }), h("span", { class: "atext", text: q.choices[k] }));
    });
    const removeBtn = h("button", { type: "button", class: "btn small", hidden: true, onclick: () => {
      if (activeL !== null) { cur[activeL] = null; activeL = null; changed(); }
    }, text: "Retirer cette flèche" });
    const clearBtn = h("button", { type: "button", class: "btn small ghost", hidden: true, onclick: () => {
      cur.fill(null); activeL = activeR = null; changed();
    }, text: "Effacer toutes les flèches" });
    const board = h("div", { class: "arrows" + (ro ? " readonly" : "") },
      h("div", { class: "arrows-col left" }, leftBtns),
      h("div", { class: "arrows-col right" }, order.map((k) => rightBtns[k])));
    board.prepend(svg);

    function link(i, k) { cur[i] = k; activeL = activeR = null; changed(); }
    function pickLeft(i) {
      if (activeR !== null) return link(i, activeR);
      activeL = activeL === i ? null : i;
      paint();
    }
    function pickRight(k) {
      if (activeL !== null) return link(activeL, k);
      activeR = activeR === k ? null : k;
      paint();
    }
    function changed() { if (onChange) onChange(cur.slice()); paint(); }

    function paint() {
      leftBtns.forEach((b, i) => {
        const linked = cur[i] !== null && cur[i] !== undefined;
        b.classList.toggle("active", activeL === i);
        b.classList.toggle("linked", linked);
        b.style.setProperty("--lc", opts.status ? (opts.status[i] ? "var(--ok)" : "var(--bad)") : colorOf(i));
        b.setAttribute("aria-label", q.items[i].text + (linked ? " – relié à : " + q.choices[cur[i]] : " – non relié"));
        b.setAttribute("aria-pressed", String(activeL === i));
      });
      Object.entries(rightBtns).forEach(([k, b]) => {
        b.classList.toggle("active", activeR === Number(k));
        b.classList.toggle("linked", cur.includes(Number(k)));
        b.setAttribute("aria-pressed", String(activeR === Number(k)));
      });
      if (!ro) {
        if (activeL !== null) tip.textContent = "Touchez maintenant la réponse qui correspond à « " + q.items[activeL].text + " ».";
        else if (activeR !== null) tip.textContent = "Touchez maintenant l'élément de gauche qui correspond à « " + q.choices[activeR] + " ».";
        else tip.textContent = "";
        removeBtn.hidden = !(activeL !== null && cur[activeL] !== null && cur[activeL] !== undefined);
        clearBtn.hidden = !cur.some((x) => x !== null && x !== undefined);
      }
      draw();
    }

    function draw() {
      if (!board.isConnected) return;
      const box = board.getBoundingClientRect();
      if (!box.width) return;
      svg.setAttribute("viewBox", "0 0 " + box.width + " " + box.height);
      const defs = document.createElementNS(SVG_NS, "defs");
      const paths = [];
      cur.forEach((k, i) => {
        if (k === null || k === undefined || !rightBtns[k]) return;
        const L = leftBtns[i].getBoundingClientRect(), R = rightBtns[k].getBoundingClientRect();
        const x1 = L.right - box.left - 6, y1 = L.top + L.height / 2 - box.top;
        const x2 = R.left - box.left + 4, y2 = R.top + R.height / 2 - box.top;
        const dx = Math.max(16, (x2 - x1) / 2);
        const color = opts.status ? (opts.status[i] ? "var(--ok)" : "var(--bad)") : colorOf(i);
        const mid = id + "-m" + i;
        const marker = document.createElementNS(SVG_NS, "marker");
        marker.setAttribute("id", mid);
        marker.setAttribute("viewBox", "0 0 10 10");
        marker.setAttribute("refX", "9"); marker.setAttribute("refY", "5");
        marker.setAttribute("markerWidth", "7"); marker.setAttribute("markerHeight", "7");
        marker.setAttribute("orient", "auto-start-reverse");
        const head = document.createElementNS(SVG_NS, "path");
        head.setAttribute("d", "M0,0 L10,5 L0,10 z");
        head.style.fill = color;
        marker.append(head);
        defs.append(marker);
        const p = document.createElementNS(SVG_NS, "path");
        p.setAttribute("d", "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2);
        p.setAttribute("fill", "none");
        p.setAttribute("stroke-width", "2.5");
        p.setAttribute("stroke-linecap", "round");
        p.style.stroke = color;
        p.setAttribute("marker-end", "url(#" + mid + ")");
        paths.push(p);
      });
      svg.replaceChildren(defs, ...paths);
    }

    // Redessine quand la taille change ; se détache quand la question n'est plus affichée.
    let seen = false, obs = null;
    const onResize = () => {
      if (board.isConnected) { seen = true; draw(); return; }
      if (seen) { window.removeEventListener("resize", onResize); if (obs) obs.disconnect(); }
    };
    if ("ResizeObserver" in window) { obs = new ResizeObserver(onResize); obs.observe(board); }
    window.addEventListener("resize", onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    requestAnimationFrame(() => paint());
    paint();
    return h("div", { class: "stack" }, board, ro ? null : tip, ro ? null : h("div", { class: "row" }, removeBtn, clearBtn));
  }

  /* ---------- Élève : passage du QCM ---------- */

  let runCleanup = null;

  async function viewQuiz(id) {
    loading("Ouverture du QCM…");
    let quiz;
    try { quiz = (await apiGet({ action: "quiz", id })).quiz; }
    catch (e) { return errorView(e.message, () => viewQuiz(id)); }
    const key = "attempt:" + quiz.id;
    const att = store.get(key, null);
    const ids = quiz.questions.map((q) => q.id);
    const valid = att && att.student && att.order && att.order.length === ids.length && att.order.every((x) => ids.includes(x));
    if (valid) return runQuiz(quiz, att);
    store.del(key);
    viewIdentity(quiz);
  }

  function viewIdentity(quiz) {
    const who = store.get("student", { nom: "", prenom: "", classe: "" });
    const form = h("form", { class: "card stack" },
      h("h1", { text: quiz.title }),
      h("div", { class: "row" },
        h("span", { class: "pill" + (quiz.mode === "evaluation" ? " eval" : ""), text: quiz.mode === "evaluation" ? "Évaluation" : "Entraînement" }),
        h("span", { class: "muted small", text: quiz.questions.length + " questions" + (quiz.duration ? " · " + quiz.duration + " min" : "") })),
      quiz.mode === "evaluation" ? h("div", { class: "banner warn" },
        "Évaluation : vos réponses sont envoyées à votre enseignant. Si vous quittez cette page pendant le QCM (autre onglet, autre application), ce sera signalé.") : null,
      h("div", { class: "grid2" },
        h("label", { class: "field" }, h("span", { text: "Nom" }), h("input", { type: "text", id: "nom", required: true, value: who.nom, autocomplete: "family-name" })),
        h("label", { class: "field" }, h("span", { text: "Prénom" }), h("input", { type: "text", id: "prenom", required: true, value: who.prenom, autocomplete: "given-name" })),
        h("label", { class: "field" }, h("span", { text: "Classe" }), h("input", { type: "text", id: "classe", value: who.classe }))),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "submit", text: "Démarrer le QCM" }),
        h("a", { class: "btn ghost", href: "#", text: "Retour" })));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const student = { nom: form.querySelector("#nom").value.trim(), prenom: form.querySelector("#prenom").value.trim(),
        classe: form.querySelector("#classe").value.trim() };
      if (!student.nom || !student.prenom) return toast("Indiquez votre nom et votre prénom.");
      store.set("student", student);
      const order = quiz.shuffle ? shuffle(quiz.questions.map((q) => q.id)) : quiz.questions.map((q) => q.id);
      const optOrder = {};
      quiz.questions.forEach((q) => {
        if (!q.options) return;
        const idx = q.options.map((_, i) => i);
        optOrder[q.id] = quiz.shuffle ? shuffle(idx) : idx;
      });
      const att = { student, order, optOrder, answers: {}, start: Date.now(), leaves: 0, idx: 0 };
      store.set("attempt:" + quiz.id, att);
      runQuiz(quiz, att);
    });
    show(form);
  }

  function runQuiz(quiz, att) {
    const key = "attempt:" + quiz.id;
    const byId = Object.fromEntries(quiz.questions.map((q) => [q.id, q]));
    const save = () => store.set(key, att);
    const isEval = quiz.mode === "evaluation";
    const deadline = quiz.duration ? att.start + quiz.duration * 60000 : 0;
    let timerEl, timerInt, finished = false, warnEl;

    const onHide = () => {
      if (document.visibilityState === "hidden" && !finished) {
        att.leaves += 1; save();
        if (warnEl) { warnEl.hidden = false; warnEl.textContent = "Vous avez quitté la page " + att.leaves + " fois. Votre enseignant le verra."; }
      }
    };
    if (runCleanup) runCleanup();
    if (isEval) document.addEventListener("visibilitychange", onHide);
    runCleanup = () => { document.removeEventListener("visibilitychange", onHide); clearInterval(timerInt); runCleanup = null; };

    function tick() {
      if (!timerEl || !deadline) return;
      const left = Math.max(0, deadline - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      timerEl.textContent = m + " min " + String(s).padStart(2, "0") + " s";
      timerEl.classList.toggle("low", left < 5 * 60000);
      if (left <= 0 && !finished) { toast("Temps écoulé : votre copie est envoyée."); submit(); }
    }

    const countAnswered = () => att.order.filter((id) => isAnswered(byId[id], att.answers[id])).length;
    let progI, countEl, dotEls = [];
    function refreshProgress() {
      const n = att.order.length, answered = countAnswered();
      if (progI) progI.style.width = Math.round((answered / n) * 100) + "%";
      if (countEl) countEl.textContent = "Question " + (att.idx + 1) + " sur " + n + " · " + answered + " répondue(s)";
      dotEls.forEach((d, k) => d.classList.toggle("done", isAnswered(byId[att.order[k]], att.answers[att.order[k]])));
    }

    function answerUI(q, qid) {
      const t = typeOf(q);
      const a = att.answers[qid];
      if (t === "single" || t === "multi") {
        const multi = t === "multi";
        const sel = multi ? (Array.isArray(a) ? a : []) : a;
        const order = att.optOrder[qid] || q.options.map((_, i) => i);
        return h("div", { class: "stack" },
          multi ? h("p", { class: "muted small", text: "Plusieurs réponses possibles : cochez toutes les bonnes réponses." }) : null,
          h("div", { class: "options", role: multi ? "group" : "radiogroup", "aria-label": "Réponses" },
            order.map((orig, k) => h("button", {
              class: "opt" + (multi ? " multi" : ""), type: "button", role: multi ? "checkbox" : "radio",
              "aria-checked": String(multi ? sel.includes(orig) : sel === orig),
              onclick: () => {
                if (multi) {
                  const next = sel.includes(orig) ? sel.filter((x) => x !== orig) : sel.concat(orig);
                  if (next.length) att.answers[qid] = next; else delete att.answers[qid];
                } else att.answers[qid] = orig;
                save(); screen(true);
              },
            }, h("span", { class: "letter", text: LETTERS[k] }), h("span", { text: q.options[orig].text })))));
      }
      if (t === "number") {
        att.raw = att.raw || {};
        const input = h("input", { type: "text", id: "numAnswer", inputmode: "decimal", autocomplete: "off",
          value: att.raw[qid] !== undefined ? att.raw[qid] : (typeof a === "number" ? String(a).replace(".", ",") : ""),
          placeholder: "Votre réponse", "aria-label": "Votre réponse" });
        const hint = h("p", { class: "muted small" });
        const upd = () => {
          att.raw[qid] = input.value;
          const v = parseNum(input.value);
          if (v === null) delete att.answers[qid]; else att.answers[qid] = v;
          hint.textContent = input.value.trim() && v === null ? "Saisissez uniquement un nombre, par exemple 16 200 ou -42 400." : "";
          save(); refreshProgress();
        };
        input.addEventListener("input", upd);
        return h("div", { class: "stack" },
          h("div", { class: "numrow" }, input, q.unit ? h("span", { class: "unit", text: q.unit }) : null),
          hint);
      }
      if (t === "match") {
        const cur = Array.isArray(a) ? a.slice() : q.items.map(() => null);
        while (cur.length < q.items.length) cur.push(null);
        att.rightOrder = att.rightOrder || {};
        if (!att.rightOrder[qid] || att.rightOrder[qid].length !== q.choices.length) {
          const idx = q.choices.map((_, k) => k);
          att.rightOrder[qid] = quiz.shuffle ? shuffle(idx) : idx;
          save();
        }
        return h("div", { class: "stack" },
          h("p", { class: "muted small", text: "Touchez un élément à gauche, puis la réponse qui lui correspond à droite : une flèche les relie. Pour changer une flèche, touchez à nouveau l'élément de gauche. Une même réponse peut recevoir plusieurs flèches." }),
          arrowBoard(q, cur, (c) => {
            if (c.some((x) => x !== null && x !== undefined)) att.answers[qid] = c; else delete att.answers[qid];
            save(); refreshProgress();
          }, { rightOrder: att.rightOrder[qid] }));
      }
      return h("p", { text: "Type de question non pris en charge." });
    }

    function screen(keep) {
      const qid = att.order[att.idx];
      const q = byId[qid];
      const n = att.order.length;
      const answered = countAnswered();
      const y = window.scrollY;
      timerEl = deadline ? h("span", { class: "timer" }) : null;
      warnEl = h("div", { class: "banner warn", hidden: !(isEval && att.leaves) },
        "Vous avez quitté la page " + att.leaves + " fois. Votre enseignant le verra.");
      progI = h("i", { style: "width:" + Math.round((answered / n) * 100) + "%" });
      countEl = h("span", { class: "muted small", text: "Question " + (att.idx + 1) + " sur " + n + " · " + answered + " répondue(s)" });
      dotEls = att.order.map((id, k) => h("button", {
        class: "dot" + (isAnswered(byId[id], att.answers[id]) ? " done" : "") + (k === att.idx ? " here" : ""),
        "aria-label": "Question " + (k + 1), onclick: () => { att.idx = k; save(); screen(); }, text: String(k + 1),
      }));
      show(
        h("div", { class: "runbar" },
          h("div", { class: "row spread" },
            h("span", { class: "label", text: quiz.title }),
            timerEl),
          h("div", { class: "progress", "aria-hidden": "true" }, progI),
          h("div", { class: "row spread" },
            countEl,
            quiz.context ? h("button", { class: "btn small", onclick: () => docsPanel(quiz), text: "Voir les documents" }) : null)),
        warnEl,
        h("section", { class: "stack" },
          h("div", { class: "row" }, h("span", { class: "pill", text: TYPES[typeOf(q)] }),
            h("span", { class: "muted small", text: fmtNum(q.points || 1) + " point(s)" })),
          h("p", { class: "qtext", text: q.text }),
          answerUI(q, qid)),
        h("div", { class: "row spread" },
          h("button", { class: "btn", disabled: att.idx === 0, onclick: () => { att.idx--; save(); screen(); }, text: "← Précédente" }),
          att.idx < n - 1
            ? h("button", { class: "btn primary", onclick: () => { att.idx++; save(); screen(); }, text: "Suivante →" })
            : h("button", { class: "btn primary", onclick: review, text: "Terminer" })),
        h("div", { class: "stack" },
          h("span", { class: "label", text: "Aller à la question" }),
          h("div", { class: "dots" }, dotEls)));
      if (keep) window.scrollTo(0, y);
      tick();
    }

    function review() {
      const missing = att.order.filter((id) => !isAnswered(byId[id], att.answers[id])).length;
      const partial = att.order.filter((id) => {
        const q = byId[id], a = att.answers[id];
        return typeOf(q) === "match" && Array.isArray(a) && a.some((x) => x === null || x === undefined);
      }).length;
      timerEl = deadline ? h("span", { class: "timer" }) : null;
      show(h("div", { class: "card stack" },
        h("h2", { text: "Rendre votre copie ?" }),
        missing ? h("div", { class: "banner warn", text: missing + " question(s) sans réponse. Elles compteront 0 point." })
          : h("div", { class: "banner ok", text: "Vous avez répondu à toutes les questions." }),
        partial ? h("div", { class: "banner warn", text: partial + " association(s) incomplète(s)." }) : null,
        timerEl ? h("p", { class: "muted" }, "Temps restant : ", timerEl) : null,
        h("p", { class: "muted", text: "Une fois envoyée, la copie ne peut plus être modifiée." }),
        h("div", { class: "row" },
          h("button", { class: "btn primary", onclick: submit, text: "Envoyer ma copie" }),
          h("button", { class: "btn", onclick: screen, text: "Revoir mes réponses" }))));
      tick();
    }

    async function submit() {
      if (finished) return;
      finished = true;
      runCleanup && runCleanup();
      const payload = { action: "submit", quizId: quiz.id, nom: att.student.nom, prenom: att.student.prenom,
        classe: att.student.classe, answers: att.answers, durationSec: Math.round((Date.now() - att.start) / 1000), leaves: att.leaves };
      loading("Envoi de votre copie…");
      try {
        const res = await apiPost(payload);
        store.del(key);
        viewResult(quiz, res, att);
      } catch (e) {
        if (!navigator.onLine || e instanceof TypeError) {
          const pending = store.get("pending", []);
          pending.push(payload);
          store.set("pending", pending);
          store.del(key);
          show(h("div", { class: "card stack" },
            h("h2", { text: "Copie enregistrée sur cet appareil" }),
            h("p", { text: "La connexion a échoué. Votre copie sera envoyée dès que vous cliquerez sur « Envoyer maintenant » depuis l'accueil, une fois connecté." }),
            h("div", { class: "row" }, h("button", { class: "btn primary", onclick: sendPending, text: "Envoyer maintenant" }))));
        } else {
          finished = false;
          errorView(e.message, submit);
        }
      }
    }

    if (deadline) timerInt = setInterval(tick, 1000);
    if (deadline && Date.now() >= deadline) return submit();
    screen();
  }

  function correctionBody(q, a, part) {
    const t = typeOf(q);
    if (t === "single") {
      const chosen = a === null || a === undefined ? null : q.options[a];
      if (part === 1) return h("p", { class: "tag-ok", text: "Juste : " + q.options[q.correct].text });
      return h("div", { class: "stack" },
        h("p", {}, h("span", { class: "tag-bad", text: chosen ? "Votre réponse : " + chosen.text : "Sans réponse" }),
          chosen && chosen.why ? h("span", { class: "muted", text: " – " + chosen.why }) : null),
        h("p", {}, h("strong", { text: "Bonne réponse : " }), q.options[q.correct].text));
    }
    if (t === "multi") {
      const sel = Array.isArray(a) ? a : [];
      return h("ul", { class: "corrlist" }, q.options.map((o, k) => {
        const good = q.corrects.includes(k), mine = sel.includes(k);
        const status = good && mine ? ["tag-ok", "bonne réponse cochée"] : good ? ["tag-bad", "bonne réponse oubliée"]
          : mine ? ["tag-bad", "cochée à tort"] : null;
        return h("li", {}, o.text, status ? h("span", { class: status[0], text: " – " + status[1] }) : null,
          mine && !good && o.why ? h("span", { class: "muted", text: " (" + o.why + ")" }) : null);
      }));
    }
    if (t === "number") {
      const unit = q.unit ? " " + q.unit : "";
      const tol = Number(q.tolerance) ? " (à ±" + fmtNum(q.tolerance) + " près)" : "";
      return h("div", { class: "stack" },
        h("p", { class: part === 1 ? "tag-ok" : "tag-bad", text: typeof a === "number" ? "Votre réponse : " + fmtNum(a) + unit : "Sans réponse" }),
        part === 1 ? null : h("p", {}, h("strong", { text: "Réponse attendue : " }), fmtNum(q.answer) + unit + tol));
    }
    if (t === "match") {
      const cur = Array.isArray(a) ? a.slice() : [];
      while (cur.length < q.items.length) cur.push(null);
      const board = arrowBoard(q, cur.slice(), null, { readonly: true, status: q.items.map((it, i) => cur[i] === it.answer) });
      return h("div", { class: "stack" }, board, h("ul", { class: "corrlist" }, q.items.map((it, i) => {
        const mine = cur[i], ok = mine === it.answer;
        return h("li", {}, h("strong", { text: it.text + " → " }),
          h("span", { class: ok ? "tag-ok" : "tag-bad", text: mine === null || mine === undefined ? "sans réponse" : q.choices[mine] }),
          ok ? null : h("span", { class: "muted", text: " (attendu : " + q.choices[it.answer] + ")" }));
      })));
    }
    return null;
  }

  function viewResult(quiz, res, att) {
    const nodes = [h("div", { class: "card stack" },
      h("span", { class: "label", text: quiz.title }),
      h("h1", { text: "Copie envoyée" }),
      h("p", { class: "muted", text: att.student.prenom + " " + att.student.nom + (att.student.classe ? " · " + att.student.classe : "") }),
      res.score !== undefined ? h("div", { class: "score" },
        h("b", { text: fmtNum(res.note) }), h("span", { text: "/ 20" }),
        h("span", { class: "muted", text: "(" + fmtNum(res.score) + " point(s) sur " + fmtNum(res.total) + ")" })) : null,
      h("div", { class: "row" }, h("a", { class: "btn", href: "#", text: "Retour à l'accueil" })))];
    if (res.correction) {
      const qs = Object.fromEntries(res.correction.questions.map((q) => [q.id, q]));
      const det = Object.fromEntries(res.correction.details.map((d) => [d.id, d]));
      nodes.push(h("h2", { text: "Correction" }));
      att.order.forEach((id, k) => {
        const q = qs[id], d = det[id];
        if (!q || !d) return;
        const part = d.part === undefined ? (d.ok ? 1 : 0) : d.part;
        const pts = Number(q.points) || 1;
        nodes.push(h("div", { class: "corr " + (part === 1 ? "ok" : part > 0 ? "part" : "bad") },
          h("p", {}, h("strong", { text: "Question " + (k + 1) + ". " }), q.text),
          correctionBody(q, d.chosen, part),
          h("p", { class: "muted small", text: "Points : " + fmtNum(Math.round(part * pts * 100) / 100) + " / " + fmtNum(pts) }),
          q.explanation ? h("p", { class: "muted small", text: q.explanation }) : null));
      });
    }
    show(nodes);
  }

  /* ---------- Enseignant ---------- */

  const pwd = () => session.get("qcm-pwd");

  function teacherPost(body) {
    return apiPost(Object.assign({ password: pwd() }, body)).catch((e) => {
      if (/mot de passe/i.test(e.message)) { session.del("qcm-pwd"); location.hash = "prof"; }
      throw e;
    });
  }

  function viewLogin() {
    const form = h("form", { class: "card stack" },
      h("h1", { text: "Espace enseignant" }),
      h("label", { class: "field" }, h("span", { text: "Mot de passe enseignant" }),
        h("input", { type: "password", id: "pwd", required: true, autocomplete: "current-password" })),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit", text: "Se connecter" })));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const p = form.querySelector("#pwd").value;
      try {
        await apiPost({ action: "login", password: p });
        session.set("qcm-pwd", p);
        viewTeacher();
      } catch (err) { toast(err.message); }
    });
    show(form);
    form.querySelector("#pwd").focus();
  }

  let cache = [];

  async function viewTeacher() {
    if (!apiReady()) return viewSetup();
    if (!pwd()) return viewLogin();
    loading("Chargement de vos QCM…");
    try { cache = (await teacherPost({ action: "all" })).quizzes || []; }
    catch (e) { return pwd() ? errorView(e.message, viewTeacher) : viewLogin(); }
    const list = h("div", { class: "stack" });
    cache.forEach((q) => list.append(teacherCard(q)));
    show(
      h("div", { class: "row spread" },
        h("h1", { text: "Mes QCM" }),
        h("div", { class: "row" },
          h("a", { class: "btn primary", href: "#prof/edit/new", text: "Nouveau QCM" }),
          h("label", { class: "btn", for: "importFile" }, "Importer un QCM",
            h("input", { type: "file", id: "importFile", accept: ".json,application/json", hidden: true, onchange: importQuiz })),
          h("button", { class: "btn ghost", onclick: () => { session.del("qcm-pwd"); viewLogin(); }, text: "Se déconnecter" }))),
      h("p", { class: "muted", text: "Seuls les QCM ouverts sont visibles par les élèves. Ouvrez-les au début de la séance et fermez-les à la fin." }),
      cache.length ? list : h("div", { class: "card empty" }, h("h2", { text: "Aucun QCM" }),
        h("p", { text: "Créez un QCM ou importez vos questions depuis Excel." }),
        h("a", { class: "btn primary", href: "#prof/edit/new", text: "Créer un QCM" })));
  }

  /** Importe un QCM depuis un fichier .json (exporté par l'application ou fourni tout prêt). */
  async function importQuiz(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let quiz;
    try { quiz = JSON.parse(await file.text()); }
    catch (err) { return toast("Ce fichier n'est pas un QCM lisible (format .json attendu)."); }
    if (!quiz || !quiz.title || !Array.isArray(quiz.questions) || !quiz.questions.length)
      return toast("Fichier incomplet : il faut un titre et au moins une question.");
    quiz.open = false;
    quiz.questions.forEach((q, i) => { if (!q.id) q.id = "q" + (i + 1) + "-" + uid("i").slice(2); });
    if (!quiz.id || cache.some((c) => c.id === quiz.id)) {
      if (cache.some((c) => c.id === quiz.id)) quiz.title += " (importé)";
      quiz.id = slug(quiz.title) + "-" + uid("m").slice(2);
    }
    try {
      await teacherPost({ action: "save", quiz });
      toast("QCM « " + quiz.title + " » importé. Il est fermé : ouvrez-le quand vous voulez.");
      viewTeacher();
    } catch (err) { toast(err.message); }
  }

  function exportQuiz(q) {
    const copy = JSON.parse(JSON.stringify(q));
    copy.open = false;
    const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(copy, null, 1)], { type: "application/json" })),
      download: slug(q.title) + ".json" });
    document.body.append(a); a.click(); a.remove();
    toast("Fichier téléchargé : vous pouvez le garder en sauvegarde ou le réimporter.");
  }

  function teacherCard(q) {
    const card = h("article", { class: "card quiz-card" });
    const render = () => {
      card.replaceChildren(
        h("div", { class: "row spread" },
          h("h2", { text: q.title }),
          h("div", { class: "row" },
            h("span", { class: "pill" + (q.mode === "evaluation" ? " eval" : ""), text: q.mode === "evaluation" ? "Évaluation" : "Entraînement" }),
            h("span", { class: "pill " + (q.open ? "open" : "closed"), text: q.open ? "Ouvert" : "Fermé" }))),
        h("div", { class: "meta" }, h("span", { text: q.questions.length + " questions" }), q.duration ? h("span", { text: "· " + q.duration + " min" }) : null),
        h("div", { class: "row" },
          h("button", { class: "btn small" + (q.open ? "" : " primary"), onclick: toggle, text: q.open ? "Fermer aux élèves" : "Ouvrir aux élèves" }),
          h("a", { class: "btn small", href: "#prof/res/" + encodeURIComponent(q.id), text: "Résultats" }),
          h("a", { class: "btn small", href: "#prof/edit/" + encodeURIComponent(q.id), text: "Modifier" }),
          h("button", { class: "btn small", onclick: duplicate, text: "Dupliquer" }),
          h("button", { class: "btn small", onclick: () => exportQuiz(q), text: "Exporter" }),
          h("button", { class: "btn small danger", onclick: askDelete, text: "Supprimer" })));
    };
    async function toggle() {
      const copy = Object.assign({}, q, { open: !q.open });
      try { await teacherPost({ action: "save", quiz: copy }); q.open = copy.open; render(); toast(q.open ? "QCM ouvert aux élèves." : "QCM fermé."); }
      catch (e) { toast(e.message); }
    }
    async function duplicate() {
      const copy = JSON.parse(JSON.stringify(q));
      copy.id = slug(q.title) + "-" + uid("c").slice(2);
      copy.title = q.title + " (copie)";
      copy.open = false;
      try { await teacherPost({ action: "save", quiz: copy }); toast("QCM dupliqué."); viewTeacher(); }
      catch (e) { toast(e.message); }
    }
    function askDelete() {
      card.classList.add("confirm");
      card.replaceChildren(h("p", { text: "Supprimer « " + q.title + " » ? Les résultats déjà enregistrés restent dans votre Google Sheets." }),
        h("div", { class: "row" },
          h("button", { class: "btn small danger solid", onclick: async () => {
            try { await teacherPost({ action: "delete", id: q.id }); card.remove(); toast("QCM supprimé."); }
            catch (e) { toast(e.message); }
          }, text: "Supprimer définitivement" }),
          h("button", { class: "btn small", onclick: () => { card.classList.remove("confirm"); render(); }, text: "Annuler" })));
    }
    render();
    return card;
  }

  /* ---------- Éditeur ---------- */

  function blankOptions() {
    return [{ text: "", why: "" }, { text: "", why: "" }, { text: "", why: "" }, { text: "", why: "" }];
  }

  function blankQuestion() {
    return { id: uid("q"), type: "single", text: "", points: 1, explanation: "", correct: -1, options: blankOptions() };
  }

  /** Change le type d'une question en gardant ce qui peut l'être. */
  function convertQuestion(q, t) {
    const from = typeOf(q);
    if (from === t) return;
    if ((t === "single" || t === "multi") && !Array.isArray(q.options)) q.options = blankOptions();
    if (t === "single") q.correct = from === "multi" && q.corrects && q.corrects.length ? q.corrects[0] : (q.correct >= 0 ? q.correct : -1);
    if (t === "multi") q.corrects = from === "single" && q.correct >= 0 ? [q.correct] : (q.corrects || []);
    if (t === "number") { if (q.answer === undefined) q.answer = null; if (q.tolerance === undefined) q.tolerance = 0; if (q.unit === undefined) q.unit = "€"; }
    if (t === "match") {
      if (!Array.isArray(q.choices)) q.choices = ["", ""];
      if (!Array.isArray(q.items)) q.items = [{ text: "", answer: -1 }, { text: "", answer: -1 }];
    }
    q.type = t;
  }

  /** Ne garde que les champs utiles au type de la question. */
  function tidyQuestion(q) {
    const t = typeOf(q);
    const base = { id: q.id, type: t, text: q.text, points: q.points, explanation: q.explanation || "" };
    if (t === "single" || t === "multi") {
      const keep = q.options.map((o, k) => o.text.trim() !== "" || (t === "single" ? k === q.correct : (q.corrects || []).includes(k)));
      const remap = (k) => (k >= 0 && keep[k] ? keep.slice(0, k).filter(Boolean).length : -1);
      base.options = q.options.filter((_, k) => keep[k]);
      if (t === "single") base.correct = remap(q.correct);
      else base.corrects = (q.corrects || []).map(remap).filter((k) => k >= 0).sort((x, y) => x - y);
    } else if (t === "number") {
      base.answer = typeof q.answer === "number" ? q.answer : parseNum(q.answer);
      base.tolerance = Math.abs(Number(q.tolerance) || 0);
      base.unit = (q.unit || "").trim();
    } else if (t === "match") {
      const used = new Set(q.items.map((it) => it.answer));
      const keep = q.choices.map((c, k) => c.trim() !== "" || used.has(k));
      const remap = (k) => (k >= 0 && keep[k] ? keep.slice(0, k).filter(Boolean).length : -1);
      base.choices = q.choices.filter((_, k) => keep[k]);
      base.items = q.items.filter((it) => it.text.trim() !== "").map((it) => ({ text: it.text, answer: remap(it.answer) }));
    }
    return base;
  }

  async function viewEditor(id, fromDraft) {
    if (!pwd()) return viewLogin();
    let quiz;
    if (fromDraft) {
      quiz = JSON.parse(JSON.stringify(fromDraft));
    } else if (id === "new") {
      quiz = { id: "", title: "", mode: "entrainement", open: false, duration: 0, shuffle: false, showScore: true,
        showCorrection: true, context: "", questions: [blankQuestion()] };
    } else {
      if (!cache.length) {
        loading();
        try { cache = (await teacherPost({ action: "all" })).quizzes || []; } catch (e) { return errorView(e.message); }
      }
      const found = cache.find((q) => q.id === id);
      if (!found) return errorView("QCM introuvable.");
      quiz = JSON.parse(JSON.stringify(found));
    }
    const draftKey = "draft:" + (id === "new" ? "new" : id);

    const qList = h("div", { class: "stack" });
    const field = (label, input, hint) => h("label", { class: "field" }, h("span", { text: label }), input, hint ? h("span", { class: "muted small", text: hint }) : null);
    const title = h("input", { type: "text", id: "title", value: quiz.title, placeholder: "Ex. : LAVANDINE – Budgets et trésorerie" });
    const mode = h("select", { id: "mode" },
      h("option", { value: "entrainement", text: "Entraînement (correction détaillée à la fin)" }),
      h("option", { value: "evaluation", text: "Évaluation (note seule, sorties de page signalées)" }));
    mode.value = quiz.mode;
    const duration = h("input", { type: "number", id: "duration", min: "0", step: "5", value: quiz.duration || 0 });
    const shuffleBox = h("input", { type: "checkbox", id: "shuffle", checked: quiz.shuffle });
    const scoreBox = h("input", { type: "checkbox", id: "showScore", checked: quiz.showScore !== false });
    const corrBox = h("input", { type: "checkbox", id: "showCorrection", checked: quiz.showCorrection });
    mode.addEventListener("change", () => { corrBox.checked = mode.value !== "evaluation"; });
    const context = h("textarea", { id: "context", rows: "8", value: quiz.context,
      placeholder: "## Document 1 – Ventes\n| | Janvier | Février |\n|---|---|---|\n| Ventes HT | 40 000 | 50 000 |\n- 60 % des ventes encaissées au comptant." });
    const preview = h("div", { class: "card", hidden: true });
    const importBox = h("textarea", { id: "importBox", rows: "6", placeholder: "Collez ici les lignes copiées depuis Excel…" });

    function renderQuestions() {
      qList.replaceChildren(...quiz.questions.map((q, i) => questionEditor(q, i)));
    }

    function questionEditor(q, i) {
      const n = quiz.questions.length;
      const text = h("textarea", { rows: "2", value: q.text, placeholder: "Énoncé de la question" });
      text.addEventListener("input", () => { q.text = text.value; });
      const pts = h("input", { type: "number", min: "0", step: "0.5", value: q.points, style: "max-width:90px" });
      pts.addEventListener("input", () => { q.points = Number(pts.value) || 0; });
      const expl = h("textarea", { rows: "2", value: q.explanation || "", placeholder: "Explication affichée dans la correction (facultatif)" });
      expl.addEventListener("input", () => { q.explanation = expl.value; });
      const t = typeOf(q);
      const typeSel = h("select", { class: "typesel", "aria-label": "Type de question" },
        Object.entries(TYPES).map(([v, label]) => h("option", { value: v, text: label })));
      typeSel.value = t;
      typeSel.addEventListener("change", () => { convertQuestion(q, typeSel.value); renderQuestions(); });
      const body = typeEditor(q, t);
      return h("div", { class: "card qedit" },
        h("div", { class: "head" },
          h("h3", { text: "Question " + (i + 1) }),
          h("label", { class: "row small" }, "Points", pts),
          h("button", { class: "btn small ghost", type: "button", disabled: i === 0, "aria-label": "Monter", onclick: () => { quiz.questions.splice(i - 1, 0, quiz.questions.splice(i, 1)[0]); renderQuestions(); }, text: "↑" }),
          h("button", { class: "btn small ghost", type: "button", disabled: i === n - 1, "aria-label": "Descendre", onclick: () => { quiz.questions.splice(i + 1, 0, quiz.questions.splice(i, 1)[0]); renderQuestions(); }, text: "↓" }),
          h("button", { class: "btn small danger", type: "button", onclick: () => { quiz.questions.splice(i, 1); if (!quiz.questions.length) quiz.questions.push(blankQuestion()); renderQuestions(); }, text: "Supprimer" })),
        typeSel,
        text,
        body,
        expl);
    }

    function typeEditor(q, t) {
      if (t === "single" || t === "multi") {
        const multi = t === "multi";
        if (multi && !Array.isArray(q.corrects)) q.corrects = [];
        const opts = h("div", { class: "stack" }, q.options.map((o, k) => {
          const mark = h("input", { type: multi ? "checkbox" : "radio", name: "ok-" + q.id,
            checked: multi ? q.corrects.includes(k) : q.correct === k, "aria-label": "Bonne réponse : " + LETTERS[k] });
          mark.addEventListener("change", () => {
            if (!multi) q.correct = k;
            else q.corrects = mark.checked ? q.corrects.concat(k) : q.corrects.filter((x) => x !== k);
          });
          const ti = h("input", { type: "text", value: o.text, placeholder: "Réponse " + LETTERS[k] });
          ti.addEventListener("input", () => { o.text = ti.value; });
          const why = h("input", { type: "text", class: "why small", value: o.why || "", placeholder: "Erreur visée si l'élève choisit cette réponse (facultatif)" });
          why.addEventListener("input", () => { o.why = why.value; });
          const remove = () => {
            q.options.splice(k, 1);
            const shift = (x) => (x > k ? x - 1 : x);
            if (multi) q.corrects = q.corrects.filter((x) => x !== k).map(shift);
            else q.correct = q.correct === k ? -1 : shift(q.correct);
            renderQuestions();
          };
          return h("div", { class: "optedit" }, mark, h("div", { class: "row", style: "flex-wrap:nowrap" }, ti,
            q.options.length > 2 ? h("button", { class: "btn small ghost", type: "button", "aria-label": "Retirer la réponse " + LETTERS[k], onclick: remove, text: "✕" }) : null), why);
        }));
        return h("div", { class: "stack" },
          h("span", { class: "muted small", text: multi
            ? "Cochez toutes les bonnes réponses. Notation : (bonnes cochées − fausses cochées) ÷ nombre de bonnes réponses, jamais en dessous de 0."
            : "Cochez la bonne réponse." }),
          opts,
          q.options.length < 6 ? h("div", {}, h("button", { class: "btn small", type: "button", onclick: () => { q.options.push({ text: "", why: "" }); renderQuestions(); }, text: "+ Ajouter une réponse" })) : null);
      }
      if (t === "number") {
        const ans = h("input", { type: "text", inputmode: "decimal", value: q.answer === null || q.answer === undefined ? "" : String(q.answer).replace(".", ","), placeholder: "Ex. : -42 400" });
        ans.addEventListener("input", () => { q.answer = parseNum(ans.value); });
        const tol = h("input", { type: "number", min: "0", step: "any", value: q.tolerance || 0 });
        tol.addEventListener("input", () => { q.tolerance = Number(tol.value) || 0; });
        const unit = h("input", { type: "text", value: q.unit || "", placeholder: "€" });
        unit.addEventListener("input", () => { q.unit = unit.value; });
        return h("div", { class: "grid3" },
          field("Réponse attendue", ans),
          field("Tolérance (±)", tol, "0 = valeur exacte. Ex. : 1 pour accepter les arrondis à l'euro."),
          field("Unité affichée", unit));
      }
      if (t === "match") {
        const itemSelects = [];
        const choiceRows = q.choices.map((c, k) => {
          const ci = h("input", { type: "text", value: c, placeholder: "Réponse " + LETTERS[k] });
          ci.addEventListener("input", () => {
            q.choices[k] = ci.value;
            itemSelects.forEach((sel) => { sel.options[k + 1].textContent = LETTERS[k] + ". " + (ci.value || "(vide)"); });
          });
          return h("div", { class: "row", style: "flex-wrap:nowrap" }, h("span", { class: "letterbox", text: LETTERS[k] }), ci,
            q.choices.length > 2 ? h("button", { class: "btn small ghost", type: "button", "aria-label": "Retirer la réponse " + LETTERS[k], onclick: () => {
              q.choices.splice(k, 1);
              q.items.forEach((it) => { it.answer = it.answer === k ? -1 : it.answer > k ? it.answer - 1 : it.answer; });
              renderQuestions();
            }, text: "✕" }) : null);
        });
        const itemRows = q.items.map((it, i) => {
          const ti = h("input", { type: "text", value: it.text, placeholder: "Élément " + (i + 1) });
          ti.addEventListener("input", () => { it.text = ti.value; });
          const sel = h("select", { "aria-label": "Bonne réponse pour l'élément " + (i + 1) },
            h("option", { value: "-1", text: "Bonne réponse…" }),
            q.choices.map((c, k) => h("option", { value: String(k), text: LETTERS[k] + ". " + (c || "(vide)") })));
          sel.value = String(it.answer);
          sel.addEventListener("change", () => { it.answer = Number(sel.value); });
          itemSelects.push(sel);
          return h("div", { class: "matchedit" }, ti, sel,
            q.items.length > 1 ? h("button", { class: "btn small ghost", type: "button", "aria-label": "Retirer l'élément " + (i + 1), onclick: () => { q.items.splice(i, 1); renderQuestions(); }, text: "✕" }) : null);
        });
        return h("div", { class: "stack" },
          h("span", { class: "label", text: "Réponses proposées (colonne de droite)" }),
          h("div", { class: "stack" }, choiceRows),
          q.choices.length < 8 ? h("div", {}, h("button", { class: "btn small", type: "button", onclick: () => { q.choices.push(""); renderQuestions(); }, text: "+ Ajouter une réponse" })) : null,
          h("span", { class: "label", text: "Éléments à relier et leur bonne réponse" }),
          h("p", { class: "muted small", text: "Les élèves relient chaque élément à sa réponse en traçant une flèche. Une même réponse peut recevoir plusieurs flèches (ex. : emploi / ressource). Points partiels selon le nombre de flèches justes. Mettez les réponses dans le désordre, ou cochez « Mélanger » dans les réglages du QCM." }),
          h("div", { class: "stack" }, itemRows),
          h("div", {}, h("button", { class: "btn small", type: "button", onclick: () => { q.items.push({ text: "", answer: -1 }); renderQuestions(); }, text: "+ Ajouter un élément" })));
      }
      return null;
    }

    function collect() {
      quiz.title = title.value.trim();
      quiz.mode = mode.value;
      quiz.duration = Math.max(0, Number(duration.value) || 0);
      quiz.shuffle = shuffleBox.checked;
      quiz.showScore = scoreBox.checked;
      quiz.showCorrection = corrBox.checked;
      quiz.context = context.value;
    }

    function cleanOptions() {
      quiz.questions = quiz.questions.map(tidyQuestion);
    }

    function validate() {
      if (!quiz.title) return "Donnez un titre au QCM.";
      for (let i = 0; i < quiz.questions.length; i++) {
        const q = quiz.questions[i];
        const n = "la question " + (i + 1), t = typeOf(q);
        if (!q.text.trim()) return "La question " + (i + 1) + " n'a pas d'énoncé.";
        if ((t === "single" || t === "multi") && q.options.length < 2) return "Il faut au moins 2 réponses pour " + n + ".";
        if (t === "single" && !(q.correct >= 0 && q.correct < q.options.length)) return "Cochez la bonne réponse de " + n + ".";
        if (t === "multi" && !q.corrects.length) return "Cochez au moins une bonne réponse pour " + n + ".";
        if (t === "number" && (q.answer === null || !isFinite(q.answer))) return "Indiquez la réponse chiffrée attendue pour " + n + ".";
        if (t === "match" && q.choices.length < 2) return "Il faut au moins 2 réponses proposées pour " + n + ".";
        if (t === "match" && !q.items.length) return "Ajoutez au moins un élément à relier pour " + n + ".";
        if (t === "match" && q.items.some((it) => it.answer < 0)) return "Choisissez la bonne correspondance de chaque élément pour " + n + ".";
      }
      return "";
    }

    async function saveQuiz(e) {
      e.preventDefault();
      collect();
      cleanOptions();
      const err = validate();
      if (err) { renderQuestions(); return toast(err); }
      if (!quiz.id) quiz.id = slug(quiz.title) + "-" + uid("x").slice(2);
      const btn = e.submitter || form.querySelector("[type=submit]");
      btn.disabled = true;
      try {
        await teacherPost({ action: "save", quiz });
        store.del(draftKey);
        cache = [];
        toast("QCM enregistré.");
        location.hash = "prof";
      } catch (ex) { toast(ex.message); btn.disabled = false; }
    }

    function doImport() {
      const rows = importBox.value.replace(/\r/g, "").split("\n").map((l) => l.split("\t")).filter((r) => r.some((c) => c.trim()));
      const added = [];
      for (const r of rows) {
        let c = r.map((x) => x.trim().replace(/^"|"$/g, ""));
        if (/^n°?$|^question$/i.test(c[0]) || /^question$/i.test(c[1] || "")) continue; // ligne d'en-tête
        if (/^\d+$/.test(c[0])) c = c.slice(1); // colonne N°
        const [text, a, b, cc, d, good, points, expl] = c;
        if (!text) continue;
        const options = [a, b, cc, d].filter((x) => x !== undefined && x !== "").map((t) => ({ text: t, why: "" }));
        const g = String(good || "").trim();
        const pts = Number(String(points || "1").replace(",", ".")) || 1;
        const base = { id: uid("q"), text, points: pts, explanation: expl || "" };
        if (!options.length && parseNum(g) !== null) {
          added.push(Object.assign(base, { type: "number", answer: parseNum(g), tolerance: 0, unit: "" }));
          continue;
        }
        const letters = (g.toUpperCase().match(/\b[A-H]\b|^[A-H]+$/g) || []).join("").split("")
          .map((L) => LETTERS.indexOf(L)).filter((k, i, arr) => k >= 0 && k < options.length && arr.indexOf(k) === i);
        if (letters.length > 1) added.push(Object.assign(base, { type: "multi", options, corrects: letters.sort() }));
        else added.push(Object.assign(base, { type: "single", options, correct: letters.length ? letters[0] : -1 }));
      }
      if (!added.length) return toast("Aucune question reconnue. Vérifiez l'ordre des colonnes.");
      collect();
      quiz.questions = quiz.questions.filter((q) => q.text.trim()).concat(added);
      importBox.value = "";
      renderQuestions();
      toast(added.length + " question(s) importée(s).");
    }

    const form = h("form", { class: "stack" },
      h("div", { class: "row spread" }, h("h1", { text: id === "new" ? "Nouveau QCM" : "Modifier le QCM" }),
        h("a", { class: "btn ghost", href: "#prof", text: "Annuler" })),
      h("section", { class: "card stack" },
        field("Titre", title),
        h("div", { class: "grid2" },
          field("Mode", mode),
          field("Durée (minutes)", duration, "0 = pas de limite. Le QCM est envoyé automatiquement à la fin du temps.")),
        h("label", { class: "check" }, shuffleBox, "Mélanger l'ordre des questions et des réponses pour chaque élève"),
        h("label", { class: "check" }, scoreBox, "Montrer la note à l'élève après l'envoi"),
        h("label", { class: "check" }, corrBox, "Montrer la correction détaillée après l'envoi")),
      h("section", { class: "card stack" },
        h("h2", { text: "Documents du cas (facultatif)" }),
        h("p", { class: "muted small", text: "Affichés aux élèves avec le bouton « Voir les documents ». Titres : ## Titre · listes : - texte · tableaux : | a | b | · gras : **texte**." }),
        context,
        h("div", {}, h("button", { class: "btn small", type: "button", onclick: () => {
          preview.hidden = !preview.hidden;
          preview.replaceChildren(renderMd(context.value));
        }, text: "Aperçu des documents" })),
        preview),
      h("section", { class: "card stack" },
        h("h2", { text: "Importer depuis Excel" }),
        h("p", { class: "muted small", text: "Dans Excel, sélectionnez vos lignes puis copiez-les. Colonnes : N° (facultatif), Question, Réponse A, B, C, D, Bonne réponse, Points, Explication. Bonne réponse : une lettre (B), plusieurs lettres pour plusieurs bonnes réponses (A,C), ou un nombre sans réponses A à D pour une réponse chiffrée. Les associations se créent dans l'éditeur." }),
        importBox,
        h("div", {}, h("button", { class: "btn small", type: "button", onclick: doImport, text: "Ajouter ces questions" }))),
      h("h2", { text: "Questions" }),
      qList,
      h("div", {}, h("button", { class: "btn", type: "button", onclick: () => { quiz.questions.push(blankQuestion()); renderQuestions(); }, text: "+ Ajouter une question" })),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit", text: "Enregistrer le QCM" }),
        h("a", { class: "btn ghost", href: "#prof", text: "Annuler" })));
    form.addEventListener("submit", saveQuiz);
    // Brouillon local : évite de perdre la saisie si l'onglet se ferme.
    form.addEventListener("input", () => { collect(); store.set(draftKey, quiz); });
    const draft = fromDraft ? null : store.get(draftKey, null);
    renderQuestions();
    show(form);
    if (draft && JSON.stringify(draft) !== JSON.stringify(quiz)) {
      form.prepend(h("div", { class: "banner warn row spread" }, h("span", { text: "Une saisie non enregistrée existe pour ce QCM." }),
        h("div", { class: "row" },
          h("button", { class: "btn small", type: "button", onclick: () => viewEditor(id, draft), text: "La reprendre" }),
          h("button", { class: "btn small ghost", type: "button", onclick: (ev) => { store.del(draftKey); ev.target.closest(".banner").remove(); }, text: "L'ignorer" }))));
    }
  }

  /* ---------- Résultats ---------- */

  async function viewResults(id) {
    if (!pwd()) return viewLogin();
    loading("Chargement des résultats…");
    let data;
    try { data = await teacherPost({ action: "results", id }); } catch (e) { return errorView(e.message, () => viewResults(id)); }
    const quiz = data.quiz, rows = (data.results || []).slice().sort((a, b) =>
      String(a.classe).localeCompare(String(b.classe)) || String(a.nom).localeCompare(String(b.nom), "fr"));
    if (!quiz) return errorView("QCM introuvable.");
    const n = rows.length;
    const notes = rows.map((r) => Number(r.note) || 0);
    const avg = n ? notes.reduce((a, b) => a + b, 0) / n : 0;
    const flagged = rows.filter((r) => Number(r.sorties) > 0).length;
    const perQ = quiz.questions.map((q, i) => {
      const sum = rows.reduce((acc, r) => acc + (r.parts && typeof r.parts[q.id] === "number" ? r.parts[q.id] : 0), 0);
      return { i, q, rate: n ? sum / n : 0 };
    });

    function csv() {
      const head = ["Nom", "Prénom", "Classe", "Note /20", "Score", "Total", "Durée (min)", "Sorties de page", "Date"]
        .concat(quiz.questions.map((_, i) => "Q" + (i + 1)));
      const lines = [head].concat(rows.map((r) => [r.nom, r.prenom, r.classe, r.note, r.score, r.total, r.duree, r.sorties,
        new Date(r.date).toLocaleString("fr-FR")].concat(quiz.questions.map((q) => fmtAnswer(q, r.answers ? r.answers[q.id] : undefined)))));
      const text = "﻿" + lines.map((l) => l.map((c) => '"' + String(c === undefined ? "" : c).replace(/"/g, '""') + '"').join(";")).join("\r\n");
      const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })), download: slug(quiz.title) + "-resultats.csv" });
      document.body.append(a); a.click(); a.remove();
    }

    show(
      h("div", { class: "row spread" },
        h("div", { class: "stack" }, h("span", { class: "label", text: "Résultats" }), h("h1", { text: quiz.title })),
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: () => viewResults(id), text: "Actualiser" }),
          n ? h("button", { class: "btn", onclick: csv, text: "Exporter (CSV)" }) : null,
          h("a", { class: "btn ghost", href: "#prof", text: "Retour" }))),
      h("div", { class: "stats" },
        h("div", { class: "card stat" }, h("span", { class: "label", text: "Copies" }), h("b", { text: String(n) })),
        h("div", { class: "card stat" }, h("span", { class: "label", text: "Moyenne" }), h("b", { text: n ? fmtNum(Math.round(avg * 100) / 100) : "–" })),
        h("div", { class: "card stat" }, h("span", { class: "label", text: "Note min / max" }), h("b", { text: n ? fmtNum(Math.min(...notes)) + " / " + fmtNum(Math.max(...notes)) : "–" })),
        h("div", { class: "card stat" }, h("span", { class: "label", text: "Sorties de page" }), h("b", { text: String(flagged) }))),
      n ? h("div", { class: "tablewrap" }, h("table", { class: "data" },
        h("thead", {}, h("tr", {}, ["Nom", "Prénom", "Classe"].map((t) => h("th", { text: t })),
          ["Note /20", "Durée (min)", "Sorties"].map((t) => h("th", { class: "num", text: t })), h("th", { text: "Envoyée le" }))),
        h("tbody", {}, rows.map((r) => h("tr", {},
          h("td", { text: r.nom }), h("td", { text: r.prenom }), h("td", { text: r.classe }),
          h("td", { class: "num", text: fmtNum(r.note) }), h("td", { class: "num", text: fmtNum(r.duree) }),
          h("td", { class: "num" + (Number(r.sorties) > 0 ? " flag" : ""), text: String(r.sorties) }),
          h("td", { text: new Date(r.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) }))))))
        : h("div", { class: "card empty" }, h("p", { text: "Aucune copie reçue pour ce QCM." })),
      n ? h("section", { class: "card stack" },
        h("h2", { text: "Réussite par question" }),
        h("p", { class: "muted small", text: "Les questions en rouge (moins de 50 % de réussite) sont à reprendre en classe." }),
        h("div", { class: "bars" }, perQ.map((p) => h("div", { class: "bar" + (p.rate < 0.5 ? " weak" : ""), title: p.q.text },
          h("span", { text: "Q" + (p.i + 1) }), h("span", { class: "track" }, h("i", { style: "width:" + Math.round(p.rate * 100) + "%" })),
          h("span", { text: Math.round(p.rate * 100) + " %" }))))) : null,
      flagged ? h("p", { class: "muted small", text: "« Sorties » compte le nombre de fois où l'élève a quitté la page pendant une évaluation (autre onglet, autre application). C'est un indice, pas une preuve : un téléphone à côté de l'ordinateur n'est pas détecté." }) : null);
  }

  /* ---------- Routage ---------- */

  function route() {
    if (runCleanup && !location.hash.startsWith("#qcm/")) runCleanup();
    const parts = decodeURIComponent(location.hash.replace(/^#/, "")).split("/");
    document.getElementById("profLink").hidden = parts[0] === "prof";
    if (parts[0] === "qcm" && parts[1]) return viewQuiz(parts[1]);
    if (parts[0] === "prof" && parts[1] === "edit" && parts[2]) return viewEditor(parts[2]);
    if (parts[0] === "prof" && parts[1] === "res" && parts[2]) return viewResults(parts[2]);
    if (parts[0] === "prof") return viewTeacher();
    return viewHome();
  }

  function updateNet() { document.getElementById("net").hidden = navigator.onLine; }
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  window.addEventListener("hashchange", route);
  updateNet();
  route();

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* l'application fonctionne aussi sans */ });
  }
})();
