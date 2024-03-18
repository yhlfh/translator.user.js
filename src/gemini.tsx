import { register, reprShortcut } from '@violentmonkey/shortcut';
import { getPanel } from '@violentmonkey/ui';
import marked from 'marked';
import styles, { stylesheet } from './style.module.css';
import { getPosition, getSelection, request, safeHtml } from './util';

interface QueryContext {
  locale: string;
  alternateLocale: string;
  input: string;
  output: string;
}

interface PromptDefinition {
  command: string;
  shortcut?: string;
  loadingTpl: (args: QueryContext) => string | Promise<string>;
  promptTpl: (args: QueryContext) => string | Promise<string>;
  resultTpl: (args: QueryContext) => string | Promise<string>;
}

const geminiApiKey = GM_getValue('GEMINI_API_KEY');
const prompts: Record<string, PromptDefinition> = {
  define: {
    command: 'Gemini Define',
    shortcut: 'ctrlcmd-g d',
    loadingTpl: (args: QueryContext) =>
      marked.parse(`\
**Define:** ${safeHtml(args.input)}

*Asking Gemini...*
`),
    promptTpl: (args: QueryContext) =>
      `Define the content below in locale ${args.locale}. The output is a bullet list of definitions grouped by parts of speech in plain text. Each item of the definition list contains pronunciation using IPA, meaning, and a list of usage examples with at most 2 items. Do not return anything else. Here is the content:\n\n${JSON.stringify(args.input)}`,
    resultTpl: (args: QueryContext) =>
      marked.parse(`\
**Define:** ${safeHtml(args.input)}

${args.output}
`),
  },
  translate: {
    command: 'Gemini Translate',
    shortcut: 'ctrlcmd-g t',
    loadingTpl: (args: QueryContext) =>
      marked.parse(`\
**Translating by Gemini...**

${safeHtml(args.input)}
`),
    promptTpl: (args: QueryContext) =>
      `Translate the content below into locale ${args.locale}. Translate into ${args.alternateLocale} instead if it is already in ${args.locale}. Do not return anything else. Here is the content:\n\n${JSON.stringify(args.input)}`,
    resultTpl: (args: QueryContext) =>
      marked.parse(`\
**Translated by Gemini**

${safeHtml(args.input)}

->

${args.output}
`),
  },
  improve: {
    command: 'Gemini Improve',
    shortcut: 'ctrlcmd-g i',
    loadingTpl: (args: QueryContext) =>
      marked.parse(`\
**Improving by Gemini...**

${safeHtml(args.input)}
`),
    promptTpl: (args: QueryContext) =>
      `Improve the content below in the same locale. Do not return anything else. Here is the content:\n\n${JSON.stringify(args.input)}`,
    resultTpl: (args: QueryContext) =>
      marked.parse(`\
**Improved by Gemini**

${safeHtml(args.input)}

->

${args.output}
`),
  },
};

const panel = getPanel({
  shadow: false,
  style: stylesheet,
});
panel.setMovable(true);

if (geminiApiKey) initialize();

function initialize() {
  Object.entries(prompts).forEach(([key, value]) => {
    const handle = () => handlePrompt(key);
    let name = value.command;
    if (value.shortcut) {
      register(value.shortcut, handle);
      name += ` (${reprShortcut(value.shortcut)})`;
    }
    GM_registerMenuCommand(name, handle);
  });
  panel.body.classList.add(styles.panelGemini);
  document.addEventListener(
    'mousedown',
    (e) => {
      if (panel.body.contains(e.target as HTMLElement)) return;
      panel.hide();
    },
    true,
  );
}

function stopMouse(e: MouseEvent) {
  e.stopPropagation();
}

async function handlePrompt(name: string) {
  const selection = getSelection();
  if (!selection?.text) return;
  const { text, rect } = selection;
  const { wrapper } = panel;
  Object.assign(
    wrapper.style,
    getPosition(rect.left, rect.top, rect.right, rect.bottom),
  );
  panel.show();
  const def = prompts[name];
  const args: QueryContext = {
    locale: 'en',
    alternateLocale: 'zh',
    input: text,
    output: '',
  };
  panel.show();
  const header = <div className={styles.header}>translator</div>;
  panel.setContent(
    <div>
      {header}
      <div innerHTML={await def.loadingTpl(args)} onMouseDown={stopMouse}></div>
    </div>,
  );
  args.output = await askGemini(await def.promptTpl(args));
  panel.setContent(
    <div>
      {header}
      <div innerHTML={await def.resultTpl(args)} onMouseDown={stopMouse}></div>
    </div>,
  );
}

async function askGemini(
  prompt: string,
  handleResult?: (output: string) => string,
  handleError?: (error: any) => string,
) {
  // console.info('Request', JSON.stringify(prompt));
  let text: string;
  try {
    const data = await request({
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
      headers: {
        'content-type': 'application/json',
      },
      responseType: 'json',
      data: JSON.stringify({
        contents: [
          {
            parts: { text: prompt },
          },
        ],
      }),
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
