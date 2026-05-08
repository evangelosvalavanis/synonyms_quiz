(async function () {
  "use strict";

  const BATCH_SIZE = 10;
  const app = document.getElementById("app");
  const tpl = document.getElementById("tpl-question");
  const progressFill = document.getElementById("progress-fill");
  const progressLabel = document.getElementById("progress-label");

  async function loadQuestions() {
    const res = await fetch("questions.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      throw new Error("questions.json is empty or malformed");
    }
    return data;
  }

  let QUESTIONS;
  try {
    QUESTIONS = await loadQuestions();
  } catch (err) {
    app.innerHTML =
      '<div class="card"><p>Δεν φορτώθηκαν οι ερωτήσεις από το <code>questions.json</code>.</p>' +
      '<p style="color:var(--muted);font-size:14px">Αν άνοιξες το <code>index.html</code> με διπλό κλικ, οι browsers μπλοκάρουν το <code>fetch</code> από <code>file://</code>. ' +
      'Άνοιξέ το μέσω τοπικού server, π.χ.:</p>' +
      '<pre style="background:#f0f3f8;padding:10px;border-radius:8px;overflow:auto">cd ' +
      'synonyms_quiz\npython3 -m http.server 8765\n# μετά άνοιξε http://127.0.0.1:8765/</pre>' +
      '<p style="color:var(--muted);font-size:13px">Λεπτομέρεια σφάλματος: ' + escapeHtml(String(err && err.message || err)) + '</p></div>';
    return;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildBatches(questions) {
    const prepared = questions.map((q) => ({
      ...q,
      shuffledOptions: shuffle(q.options),
    }));
    const batches = [];
    for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
      batches.push(prepared.slice(i, i + BATCH_SIZE));
    }
    return batches;
  }

  const state = {
    batches: buildBatches(QUESTIONS),
    batchIndex: 0,
    selections: new Map(),
    reviewed: new Set(),
    wrongAll: [],
    totalAnswered: 0,
  };

  function renderProgress() {
    const total = QUESTIONS.length;
    const upToBatchEnd = Math.min((state.batchIndex + 1) * BATCH_SIZE, total);
    const pct = (upToBatchEnd / total) * 100;
    progressFill.style.width = pct + "%";
    const totalBatches = state.batches.length;
    progressLabel.textContent = `Δεκάδα ${state.batchIndex + 1} / ${totalBatches}`;
  }

  function makeOptionButton(text, idx) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.dataset.value = text;

    const bullet = document.createElement("span");
    bullet.className = "bullet";
    bullet.textContent = String.fromCharCode(913 + idx); // Α, Β, Γ, Δ
    btn.appendChild(bullet);

    const label = document.createElement("span");
    label.className = "label";
    label.textContent = text;
    btn.appendChild(label);

    li.appendChild(btn);
    return li;
  }

  function renderBatch() {
    app.innerHTML = "";
    const batch = state.batches[state.batchIndex];
    const startNum = state.batchIndex * BATCH_SIZE + 1;
    const reviewed = state.reviewed.has(state.batchIndex);

    batch.forEach((q, i) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.qid = q.id;
      node.dataset.batchIdx = String(i);

      node.querySelector(".q-number").textContent = String(startNum + i);

      const sentenceEl = node.querySelector(".q-sentence");
      sentenceEl.innerHTML = renderBoldSentence(q.sentence);

      const list = node.querySelector(".q-options");
      q.shuffledOptions.forEach((opt, idx) => {
        list.appendChild(makeOptionButton(opt, idx));
      });

      if (reviewed) {
        node.dataset.state = "reviewed";
        const chosen = state.selections.get(q.id);
        list.querySelectorAll(".option").forEach((btn) => {
          const v = btn.dataset.value;
          if (v === q.correct) btn.classList.add("correct");
          if (v === chosen && chosen !== q.correct) btn.classList.add("wrong");
          btn.disabled = true;
        });
      } else {
        const chosen = state.selections.get(q.id);
        if (chosen) {
          const sel = list.querySelector(`.option[data-value="${cssEscape(chosen)}"]`);
          if (sel) sel.setAttribute("aria-checked", "true");
        }
        list.addEventListener("click", (e) => {
          const btn = e.target.closest(".option");
          if (!btn) return;
          state.selections.set(q.id, btn.dataset.value);
          list.querySelectorAll(".option").forEach((b) =>
            b.setAttribute("aria-checked", "false")
          );
          btn.setAttribute("aria-checked", "true");
          updateFooter();
        });
      }

      app.appendChild(node);
    });

    if (reviewed) {
      renderReviewSummary(batch);
      renderAdvanceFooter();
    } else {
      renderCheckFooter();
    }

    renderProgress();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderBoldSentence(s) {
    return escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return s.replace(/(["\\])/g, "\\$1");
  }

  function renderCheckFooter() {
    const footer = document.createElement("div");
    footer.className = "batch-footer";
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.id = "check-btn";
    btn.textContent = "Έλεγχος απαντήσεων";
    btn.addEventListener("click", checkBatch);
    footer.appendChild(btn);
    app.appendChild(footer);
    updateFooter();
  }

  function updateFooter() {
    const btn = document.getElementById("check-btn");
    if (!btn) return;
    const batch = state.batches[state.batchIndex];
    const allAnswered = batch.every((q) => state.selections.has(q.id));
    btn.disabled = !allAnswered;
    btn.textContent = allAnswered
      ? "Έλεγχος απαντήσεων"
      : `Απάντησε σε όλες (${batch.filter((q) => state.selections.has(q.id)).length}/${batch.length})`;
  }

  function checkBatch() {
    state.reviewed.add(state.batchIndex);
    const batch = state.batches[state.batchIndex];
    batch.forEach((q) => {
      const chosen = state.selections.get(q.id);
      state.totalAnswered += 1;
      if (chosen !== q.correct) {
        state.wrongAll.push({ ...q, chosen });
      }
    });
    renderBatch();
  }

  function renderReviewSummary(batch) {
    const wrong = batch.filter((q) => state.selections.get(q.id) !== q.correct);
    const card = document.createElement("section");
    card.className = "card summary-card";

    const right = batch.length - wrong.length;
    const head = document.createElement("h2");
    head.textContent = "Αποτέλεσμα δεκάδας";
    card.appendChild(head);

    const score = document.createElement("p");
    score.className = "score-line";
    score.innerHTML = `Σωστές: <span class="score-num">${right}/${batch.length}</span>`;
    card.appendChild(score);

    if (wrong.length === 0) {
      const ok = document.createElement("div");
      ok.className = "all-good";
      ok.textContent = "Τέλεια! Δεν σε δυσκόλεψε καμία λέξη σε αυτή τη δεκάδα.";
      card.appendChild(ok);
    } else {
      const title = document.createElement("p");
      title.style.margin = "10px 0 4px";
      title.style.color = "var(--muted)";
      title.style.fontSize = "14px";
      title.textContent = "Λέξεις που σε δυσκόλεψαν:";
      card.appendChild(title);

      const ul = document.createElement("ul");
      ul.className = "difficult-list";
      wrong.forEach((q) => {
        const li = document.createElement("li");
        li.innerHTML =
          `<span class="word">${escapeHtml(q.word)}</span>` +
          `<span class="arrow">→</span>` +
          `<span class="syn">${escapeHtml(q.correct)}</span>` +
          `<span class="def">${escapeHtml(q.definition)}</span>`;
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    app.appendChild(card);
  }

  function renderAdvanceFooter() {
    const footer = document.createElement("div");
    footer.className = "batch-footer";
    const isLast = state.batchIndex >= state.batches.length - 1;

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = isLast ? "Δες τα τελικά αποτελέσματα" : "Επόμενη δεκάδα →";
    btn.addEventListener("click", () => {
      if (isLast) renderFinal();
      else {
        state.batchIndex += 1;
        renderBatch();
      }
    });
    footer.appendChild(btn);
    app.appendChild(footer);
  }

  function renderFinal() {
    app.innerHTML = "";
    const total = state.totalAnswered;
    const wrongCount = state.wrongAll.length;
    const right = total - wrongCount;
    const pct = total > 0 ? Math.round((right / total) * 100) : 0;

    const card = document.createElement("section");
    card.className = "card final-card";

    const h = document.createElement("h2");
    h.textContent = "Τέλος κουίζ!";
    card.appendChild(h);

    const big = document.createElement("p");
    big.className = "big-score";
    big.textContent = `${right}/${total}`;
    card.appendChild(big);

    const sub = document.createElement("p");
    sub.className = "big-score-sub";
    sub.textContent = `${pct}% σωστές απαντήσεις`;
    card.appendChild(sub);

    if (wrongCount === 0) {
      const ok = document.createElement("div");
      ok.className = "all-good";
      ok.textContent = "Φοβερά! Δεν έκανες κανένα λάθος.";
      card.appendChild(ok);
    } else {
      const title = document.createElement("p");
      title.className = "difficult-list-title";
      title.textContent = `Όλες οι λέξεις που σε δυσκόλεψαν (${wrongCount}):`;
      card.appendChild(title);

      const ul = document.createElement("ul");
      ul.className = "difficult-list";
      state.wrongAll.forEach((q) => {
        const li = document.createElement("li");
        li.innerHTML =
          `<span class="word">${escapeHtml(q.word)}</span>` +
          `<span class="arrow">→</span>` +
          `<span class="syn">${escapeHtml(q.correct)}</span>` +
          `<span class="def">${escapeHtml(q.definition)}</span>`;
        ul.appendChild(li);
      });
      card.appendChild(ul);
    }

    const footer = document.createElement("div");
    footer.className = "batch-footer";
    const restart = document.createElement("button");
    restart.className = "btn secondary";
    restart.textContent = "Επανάληψη από την αρχή";
    restart.addEventListener("click", () => {
      state.batches = buildBatches(QUESTIONS);
      state.batchIndex = 0;
      state.selections = new Map();
      state.reviewed = new Set();
      state.wrongAll = [];
      state.totalAnswered = 0;
      renderBatch();
    });
    footer.appendChild(restart);
    card.appendChild(footer);

    app.appendChild(card);

    progressFill.style.width = "100%";
    progressLabel.textContent = "Ολοκληρώθηκε";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  renderBatch();
})();
