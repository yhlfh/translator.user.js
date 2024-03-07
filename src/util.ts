export function request<T = any>({
  method = 'GET',
  url,
  params,
  responseType,
  data,
  headers,
}: {
  method?: string;
  url: string;
  params?: Record<string, string>;
  responseType?: VMScriptResponseType;
  data?: string | Blob | FormData;
  headers?: Record<string, string>;
}) {
  return new Promise<T>((resolve, reject) => {
    if (params) {
      const sep = url.includes('?') ? '&' : '?';
      url += sep + new URLSearchParams(params).toString();
    }
    GM_xmlhttpRequest<T>({
      method,
      url,
      responseType,
      data,
      headers,
      onload(res) {
        if (res.status >= 300) return reject();
        resolve(res.response);
      },
      onerror: reject,
    });
  });
}

export function getSelection() {
  const { activeElement } = document;
  let text: string;
  let rect: DOMRect;
  if (['input', 'textarea'].includes(activeElement.tagName.toLowerCase())) {
    const inputEl = activeElement as HTMLInputElement;
    text = inputEl.value.slice(inputEl.selectionStart, inputEl.selectionEnd);
    rect = inputEl.getBoundingClientRect();
  } else {
    const sel = window.getSelection();
    text = sel.toString();
    rect =
      sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
  }
  text = text.trim();
  return { text, rect };
}

export function getPosition(x1: number, y1: number, x2 = x1, y2 = y1) {
  const { clientWidth, clientHeight } = document.documentElement;
  const style = {
    top: 'auto',
    left: 'auto',
    right: 'auto',
    bottom: 'auto',
  };
  if (y1 + 300 > clientHeight) {
    style.bottom = `${clientHeight - y1 + 10}px`;
  } else {
    style.top = `${y2 + 10}px`;
  }
  if (x1 + 400 > clientWidth) {
    style.right = `${clientWidth - x2}px`;
  } else {
    style.left = `${x1}px`;
  }
  return style;
}

export function safeHtml(html: string) {
  return html.replace(
    /[<&]/g,
    (m) =>
      ({
        '<': '&lt;',
        '&': '&amp;',
      })[m],
  );
}
