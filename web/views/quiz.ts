import { errorMessage } from '../api.js';
import type { AppContext } from '../context.js';
import { icon } from '../icons.js';
import {
  debounce,
  escapeHtml as esc,
  markdown as md,
  markdownInline as mdi,
  renderMath,
} from '../math.js';
import type { AttemptRow, AttemptStart, DeckSummary, QuizQuestionDto, QuizRow } from '../../shared/types.js';
import { confirmDanger, dialog, fmtScore, plural, relTime, statusChip, toast, typeLabel } from '../ui.js';

const LETTERS = 'ABCDEFGH';

type QuizRun = {
  attempt: AttemptRow | AttemptStart;
  answers: Record<number, string | string[]>;
  flags: Set<number>;
  index: number;
};

export async function mount(el: HTMLElement, ctx: AppContext): Promise<void | (() => void)> {
  const quizId = ctx.params[0];
  let disposed = false;
  let quiz: QuizRow | null = null;
  let questions: QuizQuestionDto[] = [];
  let attempts: AttemptRow[] = [];
  let decks: DeckSummary[] = [];
  let mode: 'overview' | 'run' = 'overview';
  let run: QuizRun | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const previewMath = debounce(() => {
    const pv = el.querySelector<HTMLElement>('#answer-preview');
    const ta = el.querySelector<HTMLTextAreaElement>('#text-answer');
    if (!pv || !ta) return;
    pv.innerHTML = md(ta.value);
    renderMath(pv);
  }, 140);

  function deckName(): string {
    const d = decks.find((x) => String(x.id) === String(quiz?.deck_id));
    return d?.name || '';
  }

  function totalPoints(): number {
    return questions.reduce((a, q) => a + (Number(q.points) || 0), 0);
  }

  async function loadOverview(): Promise<void> {
    const [quizRes, quizzesRes, attemptsRes, decksRes] = await Promise.allSettled([
      ctx.api.quiz(Number(quizId), { includeAnswers: false }),
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

  function renderOverview(): void {
    if (!quiz) return;
    const inProgress = attempts.find((a) => a.status === 'in_progress');
    const past = attempts.filter((a) => a.status !== 'in_progress');
    const linked = deckName()
      ? `<div class="linked-item">
           <span class="linked-item__label">Linked deck</span>
           <a class="chip chip--tonal chip--link" href="#/deck/${esc(
             String(quiz.deck_id)
           )}" title="Linked deck: ${esc(deckName())}">${icon('style')}${esc(deckName())}</a>
         </div>`
      : '';
    const meta = [
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
          <div class="page-sub" id="quiz-description">${md(quiz?.description || 'One question at a time. Your answers are saved as you go.')}</div>
          ${linked}
          <div class="quiz-meta" style="margin-top:12px">${meta}</div>
        </div>
        <div class="page-actions">
          ${
            inProgress
              ? `<button class="btn btn--filled" id="resume">${icon('play_arrow')}Resume attempt</button>
                 <button class="btn btn--text" id="start">Start over</button>`
              : `<button class="btn btn--filled" id="start">${icon('play_arrow')}Start attempt</button>`
          }
          <button class="btn btn--outlined btn--danger" id="delete-quiz">${icon('delete')}Delete</button>
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
                  <div class="question-preview__prompt">${md(q.prompt)}</div>
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
    el.querySelector('#delete-quiz')?.addEventListener('click', openDeleteQuiz);
    renderMath(el.querySelector('#quiz-description'));
    el.querySelectorAll('.question-preview__prompt').forEach((p) => renderMath(p));
  }

  function openDeleteQuiz(): void {
    if (!quiz) return;
    const name = deckName();
    dialog({
      title: 'Delete quiz',
      body: `
        <p>Type <strong>${esc(quiz.title)}</strong> to confirm. The quiz, its questions and its attempts will be removed.</p>
        ${
          name
            ? `<p style="margin-top:10px">Linked deck: <strong>${esc(name)}</strong></p>
               <label class="check-row">
                 <input type="checkbox" id="keep-deck" checked>
                 <span>Keep linked deck?</span>
               </label>
               <p class="muted" id="delete-quiz-hint" style="font-size:12.5px">The deck and its cards stay; only this quiz is removed.</p>`
            : ''
        }
        <label class="field" style="margin-top:${name ? '16' : '14'}px">
          <span class="field__label">Quiz title</span>
          <input class="input" id="quiz-delete-title" maxlength="200" autocomplete="off" placeholder="${esc(quiz.title)}">
        </label>`,
      actions: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Delete quiz', value: 'delete', variant: 'btn--filled', danger: true },
      ],
      onMount(root: HTMLElement) {
        if (!quiz) return;
        const q = quiz;
        const input = root.querySelector<HTMLInputElement>('#quiz-delete-title');
        const keep = root.querySelector<HTMLInputElement>('#keep-deck');
        const hint = root.querySelector<HTMLElement>('#delete-quiz-hint');
        const submit = root.querySelector<HTMLButtonElement>('button[value="delete"]');
        if (!input) return;
        const update = () => {
          if (submit) submit.disabled = input.value.trim() !== q.title;
          if (keep && hint)
            hint.textContent = keep.checked
              ? 'The deck and its cards stay; only this quiz is removed.'
              : 'The linked deck and its cards are deleted too.';
        };
        input.addEventListener('input', update);
        keep?.addEventListener('change', update);
        update();
        input.focus();
        root.addEventListener('submit', async (e: SubmitEvent) => {
          const submitter = e.submitter instanceof HTMLButtonElement ? e.submitter : null;
          if (submitter?.value !== 'delete' || input.value.trim() !== q.title) return;
          try {
            await ctx.api.deleteQuiz(Number(quizId), q.title, keep ? !keep.checked : false);
            toast(`Quiz “${q.title}” deleted`);
            ctx.go('#/quizzes');
          } catch (err) {
            toast(errorMessage(err, 'Could not delete the quiz'), { type: 'error' });
          }
        });
      },
    });
  }

  function escapeScore(a: AttemptRow): string {
    return esc(fmtScore(a.score ?? 0, a.max_score ?? 0));
  }

  async function startAttempt(): Promise<void> {
    try {
      const inProgress = attempts.find((a) => a.status === 'in_progress');
      if (inProgress) {
        const ok = await confirmDanger({
          title: 'Start over?',
          body: 'Your current attempt and all of its answers will be discarded, and a fresh attempt will begin.',
          confirmLabel: 'Start over',
        });
        if (!ok) return;
      }
      const res = inProgress
        ? await ctx.api.restartAttempt(Number(quizId))
        : await ctx.api.startAttempt(Number(quizId));
      run = {
        attempt: res.attempt,
        answers: {},
        flags: new Set<number>(),
        index: 0,
      };
      mode = 'run';
      renderRun();
    } catch (err) {
      toast(errorMessage(err, 'Could not start the attempt'), { type: 'error' });
    }
  }

  async function resumeAttempt(attemptRow: AttemptRow | undefined): Promise<void> {
    if (!attemptRow) return;
    try {
      const data = await ctx.api.attempt(attemptRow.id);
      const answers: Record<number, string | string[]> = {};
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
        flags: new Set<number>(),
        index: firstUnanswered >= 0 ? firstUnanswered : 0,
      };
      mode = 'run';
      renderRun();
    } catch (err) {
      toast(errorMessage(err, 'Could not resume the attempt'), { type: 'error' });
    }
  }

  function currentQuestion(): QuizQuestionDto | undefined {
    return run ? questions[run.index] : undefined;
  }

  function hasAnswer(q: QuizQuestionDto): boolean {
    if (!run) return false;
    const v = run.answers[q.id];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim().length > 0;
  }

  async function saveCurrent({ silent = true }: { silent?: boolean } = {}): Promise<void> {
    if (!run) return;
    const q = currentQuestion();
    if (!q) return;
    const value = run.answers[q.id];
    if (value === undefined) return;
    try {
      await ctx.api.answerAttempt(run.attempt.id, q.id, value);
    } catch (err) {
      if (!silent) toast(errorMessage(err, 'Could not save this answer'), { type: 'error' });
      else throw err;
    }
  }

  async function goTo(index: number): Promise<void> {
    if (!run || index < 0 || index >= questions.length) return;
    try {
      await saveCurrent({ silent: true });
    } catch {
      toast('Answer not saved yet — check the server', { type: 'error' });
    }
    run.index = index;
    renderRun();
  }

  function answerSlot(q: QuizQuestionDto): string {
    const value = run?.answers[q.id];
    if (q.type === 'mcq') {
      return `<div class="choices" role="radiogroup" aria-label="Answer choices">
        ${(q.choices || [])
          .map((c, i) => {
            const selected = String(value ?? '') === String(c.id);
            return `<label class="choice" data-choice="${esc(c.id)}" data-selected="${selected}">
              <input type="radio" name="answer" value="${esc(c.id)}" ${selected ? 'checked' : ''}>
              <span class="choice__key">${LETTERS[i] || i + 1}</span>
              <span class="choice__text">${mdi(c.text)}</span>
            </label>`;
          })
          .join('')}
      </div>`;
    }
    if (q.type === 'multi') {
      let selected: string[] = [];
      try {
        selected = Array.isArray(value) ? value : (JSON.parse(value || '[]') as string[]);
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
              <span class="choice__text">${mdi(c.text)}</span>
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

  function renderRun(): void {
    const q = currentQuestion();
    if (!q) return;
    if (!run) return;
    const currentRun = run;
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
          <div class="runner__prompt" id="runner-prompt" role="heading" aria-level="1" tabindex="-1">${md(q.prompt)}</div>
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
              }" data-answered="${hasAnswer(item)}" data-flagged="${currentRun.flags.has(item.id)}" aria-label="Question ${
                idx + 1
              }${hasAnswer(item) ? ', answered' : ''}${currentRun.flags.has(item.id) ? ', flagged' : ''}"${
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
    el.querySelector<HTMLElement>('#runner-prompt')?.focus({ preventScroll: true });
  }

  function updateChoiceUi(): void {
    const q = currentQuestion();
    if (!q) return;
    if (!run) return;
    const currentRun = run;
    el.querySelectorAll<HTMLElement>('.choice').forEach((label) => {
      const input = label.querySelector<HTMLInputElement>('input');
      if (!input) return;
      label.dataset.selected = String(input.checked);
    });
    const dots = el.querySelectorAll<HTMLElement>('.runner-dot');
    const answered = questions.filter(hasAnswer).length;
    const counter = el.querySelector<HTMLElement>('.row--between .section-meta');
    if (counter) counter.textContent = `${answered} of ${questions.length} answered`;
    dots.forEach((d, idx) => {
      d.dataset.answered = String(hasAnswer(questions[idx]));
      d.setAttribute(
        'aria-label',
        `Question ${idx + 1}${hasAnswer(questions[idx]) ? ', answered' : ''}${
          currentRun.flags.has(questions[idx].id) ? ', flagged' : ''
        }`
      );
    });
  }

  function bindRun(q: QuizQuestionDto): void {
    el.querySelector('#runner-close')?.addEventListener('click', async () => {
      await saveCurrent({ silent: true }).catch(() => {});
      await loadOverview().catch(() => {});
    });
    el.querySelector('#prev')?.addEventListener('click', () => {
      if (!run) return;
      goTo(run.index - 1);
    });
    el.querySelector('#next')?.addEventListener('click', () => {
      if (!run) return;
      goTo(run.index + 1);
    });
    el.querySelector('#submit')?.addEventListener('click', submitQuiz);

    el.querySelector('#flag')?.addEventListener('click', (e: Event) => {
      if (!run) return;
      const btn = e.currentTarget;
      if (!(btn instanceof HTMLElement)) return;
      if (run.flags.has(q.id)) run.flags.delete(q.id);
      else run.flags.add(q.id);
      const on = run.flags.has(q.id);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? 'Remove flag' : 'Flag this question');
      el.querySelector(`.runner-dot[data-jump="${run.index}"]`)?.setAttribute('data-flagged', String(on));
    });

    el.querySelectorAll<HTMLElement>('[data-jump]').forEach((dot) => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.jump)));
    });

    if (q.type === 'mcq') {
      el.querySelectorAll<HTMLInputElement>('input[name="answer"]').forEach((input) => {
        input.addEventListener('change', () => {
          if (!run) return;
          run.answers[q.id] = input.value;
          updateChoiceUi();
        });
      });
    } else if (q.type === 'multi') {
      el.querySelectorAll<HTMLInputElement>('input[name="answer"]').forEach((input) => {
        input.addEventListener('change', () => {
          if (!run) return;
          const picked = [...el.querySelectorAll<HTMLInputElement>('input[name="answer"]:checked')].map((i) => i.value);
          run.answers[q.id] = picked;
          updateChoiceUi();
        });
      });
    } else if (q.type === 'numeric') {
      el.querySelector<HTMLInputElement>('#numeric-answer')?.addEventListener('input', (e: Event) => {
        if (!run) return;
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        run.answers[q.id] = target.value;
        updateChoiceUi();
      });
    } else {
      const ta = el.querySelector<HTMLTextAreaElement>('#text-answer');
      ta?.addEventListener('input', () => {
        if (!run) return;
        run.answers[q.id] = ta.value;
        previewMath();
        updateChoiceUi();
      });
      const v = run?.answers[q.id];
      const pv = el.querySelector<HTMLElement>('#answer-preview');
      if (pv && typeof v === 'string' && v) {
        pv.innerHTML = md(v);
        renderMath(pv);
      }
    }
  }

  async function submitQuiz(): Promise<void> {
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
      toast(errorMessage(err, 'Could not submit the quiz'), { type: 'error' });
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (mode !== 'run' || !run) return;
    if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const tag = (target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
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
        let picked: string[] = [];
        try {
          const existing: string | string[] | undefined = run.answers[q.id];
          picked = Array.isArray(existing) ? [...existing] : (JSON.parse(existing || '[]') as string[]);
        } catch {
          picked = [];
        }
        picked = picked.includes(choice.id) ? picked.filter((x) => x !== choice.id) : [...picked, choice.id];
        run.answers[q.id] = picked;
        const input = el.querySelector<HTMLInputElement>(`input[value="${choice.id}"]`);
        if (input) input.checked = picked.includes(choice.id);
        updateChoiceUi();
      } else if (q.type === 'mcq') {
        run.answers[q.id] = choice.id;
        const input = el.querySelector<HTMLInputElement>(`input[value="${choice.id}"]`);
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
      <p class="empty__body">${esc(errorMessage(err, 'The quiz may have been deleted.'))}</p>
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
    clearTimeout(refreshTimer ?? undefined);
    refreshTimer = setTimeout(() => {
      if (disposed || mode !== 'overview') return;
      loadOverview().catch(() => {});
    }, 450);
  });

  return () => {
    disposed = true;
    document.removeEventListener('keydown', onKey);
    clearTimeout(refreshTimer ?? undefined);
    off();
  };
}
