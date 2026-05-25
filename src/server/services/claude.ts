import Anthropic from '@anthropic-ai/sdk';

export const PROMPT_VERSION = 'v1';

interface TranslateParams {
  pageText: string;
  contextBefore: string;
  contextAfter: string;
  pageNum: number;
}

export interface TranslateResult {
  translation: string;
  inputTokens: number;
  outputTokens: number;
}

const client = new Anthropic();

function buildPrompt(params: TranslateParams): string {
  const { pageText, contextBefore, contextAfter, pageNum } = params;

  const beforeSection = contextBefore
    ? `<context_before>\n${contextBefore}\n</context_before>`
    : '<context_before>(前ページなし)</context_before>';

  const afterSection = contextAfter
    ? `<context_after>\n${contextAfter}\n</context_after>`
    : '<context_after>(次ページなし)</context_after>';

  return `あなたはソフトウェアエンジニアリングの技術書を専門とするプロの英日翻訳者です。

${beforeSection}

<main_content page="${pageNum}">
${pageText}
</main_content>

${afterSection}

指示：
- <main_content> タグ内のテキストのみを自然な日本語に翻訳してください
- context セクションはページ境界の文脈理解のためのみ使用し、翻訳しないでください
- コードブロック・変数名・技術用語（クラス名、メソッド名など）はそのまま保持してください
- 出力はMarkdown形式で整形してください（セクション見出しには ##、インラインコードには \`code\`、コードブロックには \`\`\` を使用）
- ドキュメントの構造的な階層を翻訳でも維持してください
- main_content がページ中断で途中から始まる文の場合、context_before を参考に自然に翻訳してください
- main_content の末尾が context_after に続く文の場合、そのページ範囲で自然に終わらせてください`;
}

export async function translatePage(params: TranslateParams): Promise<TranslateResult> {
  const prompt = buildPrompt(params);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude API');
  }

  return {
    translation: content.text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
