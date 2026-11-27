// Reusable MD3 search bar: a rounded field with leading search icon, clear
// button and submit action, plus an optional row of filter chips below it.
// Render with searchBar(), wire once with wireSearchBar() on a container whose
// contents may be re-rendered — listeners are delegated to the container.
import { icon } from './icons.js';
import { escapeHtml as esc } from './math.js';

export interface SearchBarOptions {
  /** Unique input id; the hidden label points at it. */
  id: string;
  label: string;
  placeholder?: string;
  value?: string;
  name?: string;
  clearLabel?: string;
  submitLabel?: string;
  /** Filter chips or other controls rendered under the field. */
  filters?: string;
}

export function searchBar({
  id, label, placeholder = '', value = '', name = 'q',
  clearLabel = 'Clear search', submitLabel = 'Search', filters = '',
}: SearchBarOptions): string {
  return `<search class="search-bar">
    <form data-search-form>
      <div class="search-bar__bar">
        <span class="search-bar__leading" aria-hidden="true">${icon('search')}</span>
        <label class="sr-only" for="${esc(id)}">${esc(label)}</label>
        <input class="search-bar__input" id="${esc(id)}" name="${esc(name)}" type="search"
          value="${esc(value)}" placeholder="${esc(placeholder)}"
          autocomplete="off" spellcheck="false" data-search-input>
        <button class="search-bar__clear" type="button" aria-label="${esc(clearLabel)}"
          data-search-clear${value ? '' : ' hidden'}>${icon('close')}</button>
        <button class="search-bar__submit" type="submit" aria-label="${esc(submitLabel)}">${icon('arrow_forward')}</button>
      </div>
      ${filters ? `<div class="search-bar__filters">${filters}</div>` : ''}
    </form>
  </search>`;
}

export interface SearchFilterChipOptions {
  id: string;
  label: string;
  checked?: boolean;
  name?: string;
}

export function searchFilterChip({
  id, label, checked = false, name = 'filter',
}: SearchFilterChipOptions): string {
  return `<label class="search-filter-chip" for="${esc(id)}">
    <input type="checkbox" id="${esc(id)}" name="${esc(name)}"${checked ? ' checked' : ''}>
    <span>${esc(label)}</span>
  </label>`;
}

export interface WireSearchBarOptions {
  /** Called on form submit with the trimmed query and the submitted form. */
  onSearch: (query: string, form: HTMLFormElement) => void;
  /** Optional callback after the clear button empties the field. */
  onClear?: () => void;
}

export function wireSearchBar(root: HTMLElement, opts: WireSearchBarOptions): () => void {
  const onSubmit = (e: Event) => {
    if (!(e.target instanceof HTMLFormElement) || !e.target.hasAttribute('data-search-form')) return;
    e.preventDefault();
    const input = e.target.querySelector<HTMLInputElement>('[data-search-input]');
    opts.onSearch(input?.value.trim() || '', e.target);
  };
  const onInput = (e: Event) => {
    if (!(e.target instanceof HTMLInputElement) || !e.target.hasAttribute('data-search-input')) return;
    const clear = root.querySelector<HTMLButtonElement>('[data-search-clear]');
    if (clear) clear.hidden = !e.target.value;
  };
  const onClick = (e: Event) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target?.closest('[data-search-clear]')) return;
    const input = root.querySelector<HTMLInputElement>('[data-search-input]');
    const clear = root.querySelector<HTMLButtonElement>('[data-search-clear]');
    if (input) { input.value = ''; input.focus(); }
    if (clear) clear.hidden = true;
    opts.onClear?.();
  };
  root.addEventListener('submit', onSubmit);
  root.addEventListener('input', onInput);
  root.addEventListener('click', onClick);
  return () => {
    root.removeEventListener('submit', onSubmit);
    root.removeEventListener('input', onInput);
    root.removeEventListener('click', onClick);
  };
}
