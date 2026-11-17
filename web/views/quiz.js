import { icon } from '../icons.js';
import { debounce, escapeHtml as esc, renderMath } from '../math.js';
import { dialog, fmtScore, plural, relTime, statusChip, toast, typeLabel } from '../ui.js';

const LETTERS = 'ABCDEFGH';

export async function mount(el, ctx) {
  const quizId = ctx.params[0];
  let disposed = false;
  let quiz = null;
  let questions = [];
  let attempts = [];
  let decks = [];
  let mode = 'overview';
  let run = null;
  let refreshTimer = null;

  const previewMath = debounce(() => {
    const pv = el.querySelector('#answer-preview');
    const ta = el.querySelector('#text-answer');
    if (!pv || !ta) return;
    pv.textContent = ta.value;
    renderMath(pv);
  }, 140);

  function deckName() {
    const d = decks.find((x) => String(x.id) === String(quiz?.deck_id));
    return d?.name || '';
  }

  function totalPoints() {
    return questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
  }

  async function loadOverview() {
    const [quizRes, quizzesRes, attemptsRes, decksRes] = await Promise.allSettled([
      ctx.api.quiz(quizId, { includeAnswers: false }),
      ctx.api.quizzes(),
      ctx.api.attempts({ quizId: Number(quizId), limit: 20 }),
      ctx.api.decks(),
    ]);
    if (quizRes.status === 'rejected') throw quizRes.reason;
    quiz = quizRes.value.quiz;
    questions = quizRes.value.questions || [];
    attempts = attemptsRes.status === 'fulfilled' ? attemptsRes.value.attempts || [] : [];
    decks = decksRes.status === 'fulfilled' ? decksRes.value.decks || [] : [];
    mode = 'overview';
    renderOverview();
  }

  function renderOverview() {
    const inProgress = attempts.find((a) => a.status === 'in_progress');
    const past = attempts.filter((a) => a.status !== 'in_progress');
    const meta = [
      deckName() ? `<span class="chip chip--plain">${esc(deckName())}</span>` : '',
      `<span class="chip chip--mono">${plural(questions.length, 'question')}</span>`,
      `<span class="chip chip--mono">${totalPoints()} points</span>`,
      quiz?.source === 'ai' ? `<span class="chip chip--tonal">${icon('auto_awesome')}AI-made</span>` : '',
    ]
      .filter(Boolean)
      .join('');

    el.innerHTML = `
      <a class="back-link" href="#/quizzes">${icon('chevron_left')}All quizzes</a>
      <header class="quiz-head">
        <div class="quiz-head__main">
          <h1 class="quiz-title">${esc(quiz?.title || 'Quiz')}</h1>
          <p class="page-sub">${esc(quiz?.description || 'One question at a time. Your answers are saved as you go.')}</p>
          <div class="quiz-meta" style="margin-top:14px">${meta}</div>
        </div>
        <div class="page-actions">
          ${
            inProgress
              ? `<button class="btn btn--filled" id="resume">${icon('play_arrow')}Resume attempt</button>
                 <button class="btn btn--text" id="start">Start over</button>`
              : `<button class="btn btn--filled" id="start">${icon('play_arrow')}Start attempt</button>`
          }
        </div>
      </header>

      <section style="margin-top:8px">
        <div class="section-head">
          <h2 class="section-title">Questions</h2>
          <span class="section-meta">Answers are revealed after submission</span>
        </div>
        <div class="panel panel--plain">
          ${questions
            .map(
              (q, i) => `<div class="question-preview">
                <span class="question-preview__num">${String(i + 1).padStart(2, '0')}</span>
                <div class="question-preview__main">
                  <div class="question-preview__prompt">${esc(q.prompt)}</div>
                  <div class="question-preview__meta">
                    <span class="chip chip--plain">${esc(typeLabel(q.type))}</span>
                    <span class="chip chip--mono">${q.points} ${Number(q.points) === 1 ? 'point' : 'points'}</span>
                    ${['short', 'latex'].includes(q.type) ? `<span class="chip chip--warning">AI graded</span>` : ''}
                  </div>
                </div>
              </div>`
            )
            .join('')}
        </div>
      </section>

      <section style="margin-top:32px">
        <div class="section-head">
          <h2 class="section-title">Your attempts</h2>
          <span class="section-meta">${past.length ? plural(past.length, 'previous attempt') : 'No attempts yet'}</span>
        </div>
        ${
          past.length
            ? `<div class="list attempts-list">${past
                .map(
                  (a) => `<a class="list__row" href="#/attempt/${a.id}">
                    <span class="list__main">
                      <span class="list__title">Attempt ${a.id}</span>
                      <span class="list__desc">${esc(relTime(a.submitted_at || a.started_at))}</span>
                    </span>
                    <span class="mono" style="font-size:12px">${escapeScore(a)}</span>
                    ${statusChip(a.status)}
                    <span class="list__chevron">${icon('chevron_right')}</span>
                  </a>`
                )
                .join('')}</div>`
            : `<p class="muted" style="font: var(--md-sys-typescale-body-medium)">No completed attempts yet. Starting one only takes a few minutes.</p>`
        }
      </section>`;

    el.querySelector('#start')?.addEventListener('click', startAttempt);
    el.querySelector('#resume')?.addEventListener('click', () => resumeAttempt(inProgress));
    el.querySelectorAll('.question-preview__prompt').forEach((p) => renderMath(p));
  }

  function escapeScore(a) {
    return esc(fmtScore(a.score ?? 0, a.max_score ?? 0));
  }

  async function startAttempt() {
    try {
      const res = await ctx.api.startAttempt(Number(quizId));
      run = {
        attempt: res.attempt,
        answers: {},
        flags: new Set(),
        index: 0,
      };
      mode = 'run';
      renderRun();
    } catch (err) {
      toast(err.message || 'Could not start the attempt', { type: 'error' });
    }
  }

  async function resumeAttempt(attemptRow) {
    if (!attemptRow) return;
    try {
      const data = await ctx.api.attempt(attemptRow.id);
      const answers = {};
      for (const a of data.answers || []) {
        if (a.response !== null && a.response !== undefined) answers[a.question_id] = a.response;
      }
      const firstUnanswered = questions.findIndex((q) => {
        const v = answers[q.id];
        return v === undefined || v === '';
      });
      run = {
        attempt: data.attempt || attemptRow,
        answers,
        flags: new Set(),
        index: firstUnanswered >= 0 ? firstUnanswered : 0,
      };
      mode = 'run';
      renderRun();
    } catch (err) {
      toast(err.message || 'Could not resume the attempt', { type: 'error' });
    }
  }

  function currentQuestion() {
    return questions[run.index];
  }

  function hasAnswer(q) {
    const v = run.answers[q.id];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim().length > 0;
  }

  async function saveCurrent({ silent = true } = {}) {
    if (!run) return;
    const q = currentQuestion();
    if (!q) return;
    const value = run.answers[q.id];
    if (value === undefined) return;
    try {
      await ctx.api.answerAttempt(run.attempt.id, q.id, value);
    } catch (err) {
      if (!silent) toast(err.message || 'Could not save this answer', { type: 'error' });
      else throw err;
    }
  }

  async function goTo(index) {
    if (!run || index < 0 || index >= questions.length) return;
    try {
      await saveCurrent({ silent: true });
    } catch {
      toast('Answer not saved yet — check the server', { type: 'error' });
    }
    run.index = index;
    renderRun();
  }

  function answerSlot(q) {
    const value = run.answers[q.id];
    if (q.type === 'mcq') {
      return `<div class="choices" role="radiogroup" aria-label="Answer choices">
        ${(q.choices || [])
          .map((c, i) => {
            const selected = String(value ?? '') === String(c.id);
            return `<label class="choice" data-choice="${esc(c.id)}" data-selected="${selected}">
              <input type="radio" name="answer" value="${esc(c.id)}" ${selected ? 'checked' : ''}>
              <span class="choice__key">${LETTERS[i] || i + 1}</span>
              <span class="choice__text">${esc(c.text)}</span>
            </label>`;
          })
          .join('')}
      </div>`;
    }
    if (q.type === 'multi') {
      let selected = [];
      try {
        selected = Array.isArray(value) ? value : JSON.parse(value || '[]');
      } catch {
        selected = [];
      }
      return `<div class="choices" role="group" aria-label="Answer choices">
        ${(q.choices || [])
          .map((c, i) => {
            const on = selected.includes(c.id);
            return `<label class="choice" data-choice="${esc(c.id)}" data-selected="${on}">
              <input type="checkbox" name="answer" value="${esc(c.id)}" ${on ? 'checked' : ''}>
              <span class="choice__key">${LETTERS[i] || i + 1}</span>
              <span class="choice__text">${esc(c.text)}</span>
            </label>`;
          })
          .join('')}
      </div>`;
    }
    if (q.type === 'numeric') {
      return `<div class="numeric-answer">
        <input class="input" id="numeric-answer" type="text" inputmode="decimal" autocomplete="off" placeholder="Your answer" value="${esc(
          value ?? ''
        )}" aria-label="Numeric answer">
        ${q.unit ? `<span class="numeric-answer__unit">${esc(q.unit)}</span>` : ''}
      </div>
      <p class="muted" style="margin-top:10px;font: var(--md-sys-typescale-body-small)">Tolerance is built into the question. Enter the number only.</p>`;
    }
    return `<div class="answer-editor">
      <label class="field">
        <span class="field__label">Your answer</span>
        <textarea class="textarea textarea--mono" id="text-answer" maxlength="8000" rows="7" placeholder="$...$ for math, plain text otherwise">${esc(
          value ?? ''
        )}</textarea>
      </label>
      <div class="field">
        <span class="field__label">Preview</span>
        <div class="preview-card" style="min-height:180px">
          <div class="preview-card__body" id="answer-preview"></div>
        </div>
      </div>
    </div>`;
  }

  function renderRun() {
    const q = currentQuestion();
    if (!q) return;
    const total = questions.length;
    const i = run.index;
    const answered = questions.filter(hasAnswer).length;
    const flagged = run.flags.has(q.id);
    const isLast = i === total - 1;
    const pendingGrading = ['short', 'latex'].includes(q.type);

    el.innerHTML = `
      <div class="runner">
        <div class="runner__bar">
          <button class="icon-btn" id="runner-close" aria-label="Back to quiz overview">${icon('close')}</button>
          <span class="runner__meta">${esc(quiz?.title || 'Quiz')} <span>· ${esc(typeLabel(q.type))}</span></span>
          <span class="runner__count">${i + 1} / ${total}</span>
        </div>
        <div class="progress"><div class="progress__bar" style="width:${((i + 1) / total) * 100}%"></div></div>

        <div class="runner__question">
          <div class="runner__type">
            <span class="chip chip--tonal">${esc(typeLabel(q.type))}</span>
            ${
              pendingGrading
                ? `<span class="chip chip--warning">${icon('auto_awesome')}Graded by AI</span>`
                : `<span class="chip chip--plain">Auto-graded</span>`
            }
          </div>
          <h1 class="runner__prompt" id="runner-prompt" tabindex="-1">${esc(q.prompt)}</h1>
          <div class="runner__points">${q.points} ${Number(q.points) === 1 ? 'point' : 'points'}</div>
        </div>

        <div id="answer-slot">${answerSlot(q)}</div>

        <div class="runner__foot">
          <button class="btn btn--text" id="prev" ${i === 0 ? 'disabled' : ''}>${icon('arrow_back')}Back</button>
          <div class="runner__foot-end">
            <button class="icon-btn flag-btn" id="flag" aria-pressed="${flagged}" aria-label="${
              flagged ? 'Remove flag' : 'Flag this question'
            }" title="Flag for review">${icon('flag')}</button>
            ${
              isLast
                ? `<button class="btn btn--filled" id="submit">Submit quiz</button>`
                : `<button class="btn btn--filled" id="next">Next${icon('arrow_forward')}</button>`
            }
          </div>
        </div>

        <nav class="runner-dots" aria-label="Jump to question">
          ${questions
            .map(
              (item, idx) => `<button class="runner-dot" data-jump="${idx}" data-current="${
                idx === i
              }" data-answered="${hasAnswer(item)}" data-flagged="${run.flags.has(item.id)}" aria-label="Question ${
                idx + 1
              }${hasAnswer(item) ? ', answered' : ''}${run.flags.has(item.id) ? ', flagged' : ''}"${
                idx === i ? ' aria-current="step"' : ''
              }>${idx + 1}</button>`
            )
            .join('')}
        </nav>
        <div class="row row--between" style="margin-top:12px">
          <span class="live"><span class="dot dot--live"></span>Answers save when you move on</span>
          <span class="section-meta mono">${answered} of ${total} answered</span>
        </div>
      </div>`;

    bindRun(q);
    renderMath(el.querySelector('#runner-prompt'));
    renderMath(el.querySelector('#answer-slot'));
    el.querySelector('#runner-prompt')?.focus({ preventScroll: true });
  }

  function updateChoiceUi() {
    const q = currentQuestion();
    if (!q) return;
    el.querySelectorAll('.choice').forEach((label) => {
      const input = label.querySelector('input');
      label.dataset.selected = String(input.checked);
    });
    const dots = el.querySelectorAll('.runner-dot');
    const answered = questions.filter(hasAnswer).length;
    const counter = el.querySelector('.row--between .section-meta');
    if (counter) counter.textContent = `${answered} of ${questions.length} answered`;
    dots.forEach((d, idx) => {
      d.dataset.answered = String(hasAnswer(questions[idx]));
      d.setAttribute(
        'aria-label',
        `Question ${idx + 1}${hasAnswer(questions[idx]) ? ', answered' : ''}${
          run.flags.has(questions[idx].id) ? ', flagged' : ''
        }`
      );
    });
  }

  function bindRun(q) {
    el.querySelector('#runner-close')?.addEventListener('click', async () => {
      await saveCurrent({ silent: true }).catch(() => {});
      await loadOverview().catch(() => {});
    });
    el.querySelector('#prev')?.addEventListener('click', () => goTo(run.index - 1));
    el.querySelector('#next')?.addEventListener('click', () => goTo(run.index + 1));
    el.querySelector('#submit')?.addEventListener('click', submitQuiz);

    el.querySelector('#flag')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (run.flags.has(q.id)) run.flags.delete(q.id);
      else run.flags.add(q.id);
      const on = run.flags.has(q.id);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Remove flag' : 'Flag this question');
      el.querySelector(`.runner-dot[data-jump="${run.index}"]`)?.setAttribute('data-flagged', String(on));
    });

    el.querySelectorAll('[data-jump]').forEach((dot) => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.jump)));
    });

    if (q.type === 'mcq') {
      el.querySelectorAll('input[name="answer"]').forEach((input) => {
        input.addEventListener('change', () => {
          run.answers[q.id] = input.value;
          updateChoiceUi();
        });
      });
    } else if (q.type === 'multi') {
      el.querySelectorAll('input[name="answer"]').forEach((input) => {
        input.addEventListener('change', () => {
          const picked = [...el.querySelectorAll('input[name="answer"]:checked')].map((i) => i.value);
          run.answers[q.id] = picked;
          updateChoiceUi();
        });
      });
    } else if (q.type === 'numeric') {
      el.querySelector('#numeric-answer')?.addEventListener('input', (e) => {
        run.answers[q.id] = e.target.value;
        updateChoiceUi();
      });
    } else {
      const ta = el.querySelector('#text-answer');
      ta?.addEventListener('input', () => {
        run.answers[q.id] = ta.value;
        previewMath();
        updateChoiceUi();
      });
      const v = run.answers[q.id];
      const pv = el.querySelector('#answer-preview');
      if (pv && v) {
        pv.textContent = v;
        renderMath(pv);
      }
    }
  }

  async function submitQuiz() {
    if (!run) return;
    await saveCurrent({ silent: true }).catch(() => {});
    const answered = questions.filter(hasAnswer).length;
    const unanswered = questions.length - answered;
    const pending = questions.filter((q) => ['short', 'latex'].includes(q.type)).length;
    const value = await dialog({
      title: 'Submit this quiz?',
      body: `<p>You answered <strong>${answered} of ${questions.length}</strong> questions.${
        unanswered ? ` ${plural(unanswered, 'question')} will be scored as unanswered.` : ''
      }</p>${
        pending
          ? `<p style="margin-top:8px">${plural(pending, 'free response')} ${
              pending === 1 ? 'goes' : 'go'
            } to your AI for grading. The score updates automatically when that is done.</p>`
          : ''
      }`,
      actions: [
        { label: 'Keep working', value: 'cancel' },
        { label: 'Submit quiz', value: 'submit', variant: 'btn--filled' },
      ],
    });
    if (value !== 'submit') return;
    try {
      const res = await ctx.api.submitAttempt(run.attempt.id);
      const id = res.attempt?.id || run.attempt.id;
      ctx.go(`#/attempt/${id}`);
    } catch (err) {
      toast(err.message || 'Could not submit the quiz', { type: 'error' });
    }
  }

  function onKey(e) {
    if (mode !== 'run' || !run) return;
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (run.index === questions.length - 1) submitQuiz();
      else goTo(run.index + 1);
      return;
    }
    if (typing) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (run.index < questions.length - 1) goTo(run.index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (run.index > 0) goTo(run.index - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      saveCurrent({ silent: true })
        .catch(() => {})
        .then(() => loadOverview().catch(() => {}));
    } else if (/^[a-hA-H]$/.test(e.key)) {
      const q = currentQuestion();
      if (!q || !q.choices) return;
      const idx = e.key.toUpperCase().charCodeAt(0) - 65;
      const choice = q.choices[idx];
      if (!choice) return;
      e.preventDefault();
      if (q.type === 'multi') {
        let picked = [];
        try {
          picked = Array.isArray(run.answers[q.id]) ? [...run.answers[q.id]] : JSON.parse(run.answers[q.id] || '[]');
        } catch {
          picked = [];
        }
        picked = picked.includes(choice.id) ? picked.filter((x) => x !== choice.id) : [...picked, choice.id];
        run.answers[q.id] = picked;
        const input = el.querySelector(`input[value="${choice.id}"]`);
        if (input) input.checked = picked.includes(choice.id);
        updateChoiceUi();
      } else if (q.type === 'mcq') {
        run.answers[q.id] = choice.id;
        const input = el.querySelector(`input[value="${choice.id}"]`);
        if (input) input.checked = true;
        updateChoiceUi();
      }
    }
  }

  document.addEventListener('keydown', onKey);

  try {
    await loadOverview();
  } catch (err) {
    el.innerHTML = `<div class="empty" style="margin-top:12vh">
      <div class="empty__icon">${icon('cancel')}</div>
      <h2 class="empty__title">This quiz didn’t load</h2>
      <p class="empty__body">${esc(err.message || 'The quiz may have been deleted.')}</p>
      <a class="btn btn--tonal" href="#/quizzes">Back to quizzes</a>
    </div>`;
    return () => {
      disposed = true;
      document.removeEventListener('keydown', onKey);
    };
  }

  const off = ctx.onChange((changes) => {
    if (mode !== 'overview') return;
    if (!changes.some((c) => c.entity === 'attempt' || c.entity === 'answer')) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      if (disposed || mode !== 'overview') return;
      loadOverview().catch(() => {});
    }, 450);
  });

  return () => {
    disposed = true;
    document.removeEventListener('keydown', onKey);
    clearTimeout(refreshTimer);
    off();
  };
}
