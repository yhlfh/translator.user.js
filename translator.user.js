// ==UserScript==
// @name        translator
// @namespace   https://lufei.so
// @supportURL  https://github.com/intellilab/translator.user.js
// @description 划词翻译
// @version     1.6.9
// @require     https://cdn.jsdelivr.net/combine/npm/@violentmonkey/dom@2,npm/@violentmonkey/ui@0.7
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/shortcut@1
// @require     https://cdn.jsdelivr.net/npm/marked@12/lib/marked.umd.min.js
// @include     *
// @grant       GM_addStyle
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @grant       GM_xmlhttpRequest
// ==/UserScript==

(function (shortcut, ui, marked) {
'use strict';

var styles = {"panelGemini":"tr_panelGemini_zpHUq","header":"tr_header_74YkC"};
var stylesheet=".tr_panelGemini_zpHUq{font-size:14px;line-height:1.2}.tr_header_74YkC{color:#888;cursor:move;font-size:12px;font-style:italic;font-weight:bolder;padding-bottom:.5em;text-align:center;text-transform:uppercase;user-select:none}";

function request({
  method = 'GET',
  url,
  params,
  responseType,
  data,
  headers
}) {
  return new Promise((resolve, reject) => {
    if (params) {
      const sep = url.includes('?') ? '&' : '?';
      url += sep + new URLSearchParams(params).toString();
    }
    GM_xmlhttpRequest({
      method,
      url,
      responseType,
      data,
      headers,
      onload(res) {
        if (res.status >= 300) return reject();
        resolve(res.response);
      },
      onerror: reject
    });
  });
}
function getSelection() {
  const {
    activeElement
  } = document;
  let text;
  let rect;
  if (['input', 'textarea'].includes(activeElement.tagName.toLowerCase())) {
    const inputEl = activeElement;
    text = inputEl.value.slice(inputEl.selectionStart, inputEl.selectionEnd);
    rect = inputEl.getBoundingClientRect();
  } else {
    const sel = window.getSelection();
    text = sel.toString();
    rect = sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
  }
  text = text.trim();
  return {
    text,
    rect
  };
}
function getPosition(x1, y1, x2 = x1, y2 = y1) {
  const {
    clientWidth,
    clientHeight
  } = document.documentElement;
  const style = {
    top: 'auto',
    left: 'auto',
    right: 'auto',
    bottom: 'auto'
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
function safeHtml(html) {
  return html.replace(/[<&]/g, m => ({
    '<': '&lt;',
    '&': '&amp;'
  })[m]);
}

const geminiApiKey = GM_getValue('GEMINI_API_KEY');
const prompts = {
  define: {
    command: 'Gemini Define',
    shortcut: 'ctrlcmd-g d',
    loadingTpl: args => marked.parse(`\
**Define:** ${safeHtml(args.input)}

*Asking Gemini...*
`),
    promptTpl: args => `Define the content below in locale ${args.locale}. The output is a bullet list of definitions grouped by parts of speech in plain text. Each item of the definition list contains pronunciation using IPA, meaning, and a list of usage examples with at most 2 items. Do not return anything else. Here is the content:\n\n${JSON.stringify(args.input)}`,
    resultTpl: args => marked.parse(`\
**Define:** ${safeHtml(args.input)}

${args.output}
`)
  },
  translate: {
    command: 'Gemini Translate',
    shortcut: 'ctrlcmd-g t',
    loadingTpl: args => marked.parse(`\
**Translating by Gemini...**

${safeHtml(args.input)}
`),
    promptTpl: args => `Translate the content below into locale ${args.locale}. Translate into ${args.alternateLocale} instead if it is already in ${args.locale}. Do not return anything else. Here is the content:\n\n${JSON.stringify(args.input)}`,
    resultTpl: args => marked.parse(`\
**Translated by Gemini**

${safeHtml(args.input)}

->

${args.output}
`)
  },
  improve: {
    command: 'Gemini Improve',
    shortcut: 'ctrlcmd-g i',
    loadingTpl: args => marked.parse(`\
**Improving by Gemini...**

${safeHtml(args.input)}
`),
    promptTpl: args => `Improve the content below in the same locale. Do not return anything else. Here is the content:\n\n${JSON.stringify(args.input)}`,
    resultTpl: args => marked.parse(`\
**Improved by Gemini**

${safeHtml(args.input)}

->

${args.output}
`)
  }
};
const panel = ui.getPanel({
  shadow: false,
  style: stylesheet
});
panel.setMovable(true);
if (geminiApiKey) initialize();
function initialize() {
  Object.entries(prompts).forEach(([key, value]) => {
    const handle = () => handlePrompt(key);
    let name = value.command;
    if (value.shortcut) {
      shortcut.register(value.shortcut, handle);
      name += ` (${shortcut.reprShortcut(value.shortcut)})`;
    }
    GM_registerMenuCommand(name, handle);
  });
  panel.body.classList.add(styles.panelGemini);
  document.addEventListener('mousedown', e => {
    if (panel.body.contains(e.target)) return;
    panel.hide();
  }, true);
}
function stopMouse(e) {
  e.stopPropagation();
}
async function handlePrompt(name) {
  const selection = getSelection();
  if (!(selection != null && selection.text)) return;
  const {
    text,
    rect
  } = selection;
  const {
    wrapper
  } = panel;
  Object.assign(wrapper.style, getPosition(rect.left, rect.top, rect.right, rect.bottom));
  panel.show();
  const def = prompts[name];
  const args = {
    locale: 'en',
    alternateLocale: 'zh',
    input: text,
    output: ''
  };
  panel.show();
  const header = VM.hm("div", {
    className: styles.header
  }, "translator");
  panel.setContent(VM.hm("div", null, header, VM.hm("div", {
    innerHTML: await def.loadingTpl(args),
    onMouseDown: stopMouse
  })));
  args.output = await askGemini(await def.promptTpl(args));
  panel.setContent(VM.hm("div", null, header, VM.hm("div", {
    innerHTML: await def.resultTpl(args),
    onMouseDown: stopMouse
  })));
}
async function askGemini(prompt, handleResult, handleError) {
  // console.info('Request', JSON.stringify(prompt));
  let text;
  try {
    const data = await request({
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
      headers: {
        'content-type': 'application/json'
      },
      responseType: 'json',
      data: JSON.stringify({
        contents: [{
          parts: {
            text: prompt
          }
        }]
      })
    });
    text = data['candidates'][0]['content']['parts'][0]['text'];
    if (handleResult) {
      text = handleResult(text);
    }
  } catch (error) {
    // console.error(error);
    text = handleError ? handleError(error) : `Oops, I went blank.\n\n${error}`;
  }
  // console.info('Response', text);
  return text;
}

})(VM.shortcut, VM, marked);
