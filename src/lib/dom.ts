// 极简 DOM 构建辅助，保持零框架依赖
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener | undefined> = {},
  ...children: Array<Node | string | null | undefined>
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'html') {
      el.innerHTML = String(v);
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

export function toast(msg: string, kind: 'info' | 'error' = 'info'): void {
  const t = h('div', { class: 'toast ' + kind }, msg);
  document.body.append(t);
  setTimeout(() => {
    t.classList.add('fade');
    setTimeout(() => t.remove(), 400);
  }, 2600);
}

export function labelRow(text: string, input: HTMLElement): HTMLElement {
  return h('label', { class: 'field' }, h('span', {}, text), input);
}

export function numberInput(value: number, step: number, onChange: (v: number) => void): HTMLInputElement {
  const input = h('input', { type: 'number', step: String(step), value: String(value) }) as HTMLInputElement;
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v)) onChange(v);
  });
  return input;
}

export function rangeInput(value: number, min: number, max: number, step: number,
  onChange: (v: number) => void): HTMLInputElement {
  const input = h('input', {
    type: 'range', min: String(min), max: String(max), step: String(step), value: String(value)
  }) as HTMLInputElement;
  input.addEventListener('input', () => onChange(parseFloat(input.value)));
  return input;
}

export function colorInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const input = h('input', { type: 'color', value: value }) as HTMLInputElement;
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

export function textInput(value: string, onChange: (v: string) => void): HTMLInputElement {
  const input = h('input', { type: 'text', value }) as HTMLInputElement;
  input.addEventListener('change', () => onChange(input.value));
  return input;
}

export function button(text: string, onClick: EventListener, primary = false): HTMLButtonElement {
  return h('button', { class: primary ? 'btn primary' : 'btn', onClick }, text);
}

export function sectionTitle(text: string): HTMLElement {
  return h('div', { class: 'section-title' }, text);
}
