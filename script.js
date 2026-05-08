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
    pickerOpen: false,
  };

  function batchStatus(idx) {
    if (state.reviewed.has(idx)) return "reviewed";
    const batch = state.batches[idx];
    const answered = batch.filter((q) => state.selections.has(q.id)).length;
    if (answered === 0) return "empty";
    if (answered === batch.length) return "complete";
    return "partial";
  }

  function allBatchesReviewed() {
    return state.reviewed.size === state.batches.length;
  }

  function goToBatch(idx) {
    if (idx < 0 || idx >= state.batches.length) return;
    state.batchIndex = idx;
    state.pickerOpen = false;
    renderBatch();
  }

  function renderProgress() {
    const totalBatches = state.batches.length;
    const reviewedCount = state.reviewed.size;
    const pct = (reviewedCount / totalBatches) * 100;
    progressFill.style.width = pct + "%";
    progressLabel.textContent = `Δεκάδα ${state.batchIndex + 1} / ${totalBatches}`;
    progressLabel.setAttribute("aria-expanded", state.pickerOpen ? "true" : "false");
  }

  function renderBatchPicker() {
    const existing = document.getElementById("batch-picker");
    if (existing) existing.remove();
    if (!state.pickerOpen) return;

    const picker = document.createElement("div");
    picker.id = "batch-picker";
    picker.className = "batch-picker";

    const grid = document.createElement("div");
    grid.className = "batch-picker-grid";

    state.batches.forEach((_, idx) => {
      const status = batchStatus(idx);
      const item = document.createElement("button");
      item.type = "button";
      item.className = `batch-picker-item is-${status}`;
      if (idx === state.batchIndex) item.classList.add("is-current");
      item.textContent = String(idx + 1);
      const labels = {
        empty: "άθικτη",
        partial: "σε εξέλιξη",
        complete: "απαντημένη",
        reviewed: "ελεγμένη",
      };
      item.title = `Δεκάδα ${idx + 1} — ${labels[status]}`;
      item.setAttribute("aria-label", item.title);
      item.addEventListener("click", () => goToBatch(idx));
      grid.appendChild(item);
    });

    picker.appendChild(grid);

    const legend = document.createElement("div");
    legend.className = "batch-picker-legend";
    legend.innerHTML =
      '<span><span class="dot is-empty"></span>άθικτη</span>' +
      '<span><span class="dot is-partial"></span>σε εξέλιξη</span>' +
      '<span><span class="dot is-complete"></span>απαντημένη</span>' +
      '<span><span class="dot is-reviewed"></span>ελεγμένη</span>';
    picker.appendChild(legend);

    progressLabel.parentElement.appendChild(picker);
  }

  progressLabel.setAttribute("role", "button");
  progressLabel.setAttribute("tabindex", "0");
  progressLabel.setAttribute("aria-haspopup", "true");
  progressLabel.classList.add("progress-label-clickable");
  progressLabel.addEventListener("click", (e) => {
    e.stopPropagation();
    state.pickerOpen = !state.pickerOpen;
    renderBatchPicker();
    renderProgress();
  });
  progressLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      state.pickerOpen = !state.pickerOpen;
      renderBatchPicker();
      renderProgress();
    }
  });
  document.addEventListener("click", (e) => {
    if (!state.pickerOpen) return;
    const picker = document.getElementById("batch-picker");
    if (picker && (picker.contains(e.target) || progressLabel.contains(e.target))) return;
    state.pickerOpen = false;
    renderBatchPicker();
    renderProgress();
  });

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
    }
    renderFooter();

    renderProgress();
    renderBatchPicker();
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

  function renderFooter() {
    const footer = document.createElement("div");
    footer.className = "batch-footer";

    const left = document.createElement("div");
    left.className = "batch-footer-slot left";
    const center = document.createElement("div");
    center.className = "batch-footer-slot center";
    const right = document.createElement("div");
    right.className = "batch-footer-slot right";

    const isFirst = state.batchIndex === 0;
    const isLast = state.batchIndex >= state.batches.length - 1;
    const reviewed = state.reviewed.has(state.batchIndex);

    if (!isFirst) {
      const prev = document.createElement("button");
      prev.type = "button";
      prev.className = "btn secondary nav";
      prev.textContent = "← Προηγούμενη";
      prev.addEventListener("click", () => goToBatch(state.batchIndex - 1));
      left.appendChild(prev);
    }

    if (reviewed) {
      if (allBatchesReviewed()) {
        const finalBtn = document.createElement("button");
        finalBtn.type = "button";
        finalBtn.className = "btn";
        finalBtn.textContent = "Δες τα τελικά αποτελέσματα";
        finalBtn.addEventListener("click", renderFinal);
        center.appendChild(finalBtn);
        if (!isLast) {
          const next = document.createElement("button");
          next.type = "button";
          next.className = "btn secondary nav";
          next.textContent = "Επόμενη →";
          next.addEventListener("click", () => goToBatch(state.batchIndex + 1));
          right.appendChild(next);
        }
      } else if (!isLast) {
        const next = document.createElement("button");
        next.type = "button";
        next.className = "btn";
        next.textContent = "Επόμενη δεκάδα →";
        next.addEventListener("click", () => goToBatch(state.batchIndex + 1));
        right.appendChild(next);
      }
    } else {
      const checkBtn = document.createElement("button");
      checkBtn.type = "button";
      checkBtn.className = "btn";
      checkBtn.id = "check-btn";
      checkBtn.textContent = "Έλεγχος απαντήσεων";
      checkBtn.addEventListener("click", checkBatch);
      center.appendChild(checkBtn);

      if (!isLast) {
        const next = document.createElement("button");
        next.type = "button";
        next.className = "btn secondary nav";
        next.textContent = "Επόμενη →";
        next.addEventListener("click", () => goToBatch(state.batchIndex + 1));
        right.appendChild(next);
      }
    }

    footer.appendChild(left);
    footer.appendChild(center);
    footer.appendChild(right);
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
      const sortedWrong = state.wrongAll.slice().sort((a, b) => a.id - b.id);
      sortedWrong.forEach((q) => {
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
      state.pickerOpen = false;
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
