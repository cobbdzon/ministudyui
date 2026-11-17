import { icon } from '../icons.js';
import { escapeHtml as esc } from '../math.js';
import { dialog, toast } from '../ui.js';
import { IMPORT_PROMPT } from '../import-prompt.js';

// Assistants often wrap their answer in a fenced code block even when asked
// not to, so accept both raw JSON and a single fenced json block.
function stripFences(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (match ? match[1] : trimmed).trim();
}

async function copyPrompt() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
    } else {
      const helper = document.createElement('textarea');
      helper.value = IMPORT_PROMPT;
      helper.style.cssText = 'position:fixed;left:-9999px;opacity:0';
      document.body.appendChild(helper);
      helper.select();
      const copied = document.execCommand('copy');
      helper.remove();
      if (!copied) throw new Error('copy failed');
    }
    toast('Prompt copied to clipboard', { icon: 'content_copy' });
  } catch {
    toast('Could not copy automatically — select the prompt and copy it manually', { type: 'error' });
  }
}

function count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function openImport(ctx) {
  dialog({
    title: 'Import from an AI assistant',
    wide: true,
    body: `
      <p class="import-intro">Copy the prompt into another assistant (or an agent that cannot use MCP), then paste the JSON it returns. Everything is checked before anything is written, so a bad item never leaves a half-import.</p>
      <div class="import-stack">
        <div class="import-block">
          <div class="import-block__head">
            <span class="field__label">1 · Prompt to copy</span>
            <button type="button" class="btn btn--tonal btn--sm" id="import-copy">${icon('content_copy')}Copy prompt</button>
          </div>
          <textarea class="textarea textarea--mono import-prompt" id="import-prompt" rows="7" readonly aria-label="Prompt to copy">${esc(IMPORT_PROMPT)}</textarea>
        </div>
        <div class="import-block">
          <label class="field">
            <span class="field__label">2 · Paste the JSON you got back</span>
            <textarea class="textarea textarea--mono import-json" id="import-json" rows="7" placeholder='{ "decks": [...], "quizzes": [...] }' aria-label="Pasted JSON"></textarea>
          </label>
          <p class="import-hint" id="import-hint">A fenced json code block is fine. Ctrl/⌘ + Enter also imports.</p>
          <div class="import-run">
            <button type="button" class="btn btn--filled" id="import-run">${icon('upload')}Import JSON</button>
          </div>
        </div>
      </div>`,
    actions: [{ label: 'Close', value: 'close', variant: 'btn--tonal' }],
    onMount(root, close) {
      const input = root.querySelector('#import-json');
      const hint = root.querySelector('#import-hint');
      const button = root.querySelector('#import-run');

      root.querySelector('#import-copy')?.addEventListener('click', copyPrompt);
      requestAnimationFrame(() => input?.focus());

      const fail = (message) => {
        hint.textContent = message;
        hint.classList.add('import-hint--error');
      };

      const run = async () => {
        const raw = input.value.trim();
        if (!raw) return fail('Paste the JSON first.');
        let bundle;
        try {
          bundle = JSON.parse(stripFences(raw));
        } catch (e) {
          return fail(`That is not valid JSON: ${e.message}`);
        }
        hint.classList.remove('import-hint--error');
        hint.textContent = 'Importing…';
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
          const result = await ctx.api.importBundle(bundle);
          const parts = [];
          if (result.decks_created) parts.push(count(result.decks_created, 'deck'));
          if (result.decks_reused) parts.push(`${count(result.decks_reused, 'deck')} reused`);
          if (result.cards_added) parts.push(count(result.cards_added, 'card'));
          if (result.quizzes_created) parts.push(count(result.quizzes_created, 'quiz'));
          if (result.questions_added) parts.push(count(result.questions_added, 'question'));
          toast(parts.length ? `Imported ${parts.join(' · ')}` : 'Nothing new to import', { icon: 'check_circle' });
          close('import');
          // Refresh mounted views (works in mock mode too, where SSE is absent).
          window.dispatchEvent(new CustomEvent('live:change', {
            detail: [{ entity: 'deck', op: 'insert' }, { entity: 'card', op: 'insert' }, { entity: 'quiz', op: 'insert' }],
          }));
        } catch (err) {
          fail(err?.message || 'Could not import the JSON.');
        } finally {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      };

      button?.addEventListener('click', run);
      input?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          run();
        }
      });
    },
  });
}
