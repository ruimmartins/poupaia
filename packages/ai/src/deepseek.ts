import OpenAI from 'openai';

const DEEPSEEK_MODEL = 'deepseek-chat';

interface InterestInput {
  query: string;
  categories: string[];
  brands?: string[];
  includeKeywords?: string[];
  excludeKeywords?: string[];
  excludeBrands?: string[];
}

interface InterestOperation {
  action: 'add' | 'update' | 'remove';
  interest: {
    query: string;
    categories: string[];
    brands?: string[];
    includeKeywords?: string[];
    excludeKeywords?: string[];
  };
  targetQuery?: string;
}

interface InterestExtractionResult {
  operations: InterestOperation[];
}

const buildExtractionPrompt = (categories: string[], existingInterests: InterestInput[]): string => {
  const existingList =
    existingInterests.length > 0
      ? existingInterests
          .map(
            i =>
              `- "${i.query}" [${i.categories.join(', ')}]${i.brands?.length ? ` brands: ${i.brands.join(', ')}` : ''}${i.includeKeywords?.length ? ` include: ${i.includeKeywords.join(', ')}` : ''}${i.excludeKeywords?.length ? ` exclude: ${i.excludeKeywords.join(', ')}` : ''}${i.excludeBrands?.length ? ` excludeBrands: ${i.excludeBrands.join(', ')}` : ''}`
          )
          .join('\n')
      : '(nenhum)';

  return `És um extrator de interesses de compras para um bot de alertas de promoções em Portugal.

Categorias disponíveis: [${categories.map(c => `"${c}"`).join(', ')}]

Interesses atuais do utilizador:
${existingList}

Analisa a mensagem do utilizador (em português) e devolve operações para gerir os interesses.

Operações possíveis:
- "add": utilizador quer seguir NOVOS produtos. Cria um novo interesse.
- "update": utilizador quer MODIFICAR um interesse existente (adicionar exclusões, mudar marcas, etc.). Usa "targetQuery" para indicar qual o interesse a modificar.
- "remove": utilizador quer APAGAR um interesse existente. Usa "targetQuery".

Para cada interesse:
- "query": descrição curta e focada (3-8 palavras, em português). Ex: "café em grão", "calças de ganga", "sapatilhas running"
- "categories": categorias relevantes da lista disponível (máximo 2).
- "brands": marcas específicas mencionadas (manter capitalização original). Ex: "Nike", "Levi's", "Lavazza"
- "includeKeywords": atributos ou tipos específicos que DEVEM estar presentes no título do produto. Ex: ["grão", "torrado"]
- "excludeKeywords": termos que NÃO devem aparecer no título. Ex: ["cápsulas", "solúvel"]
- "targetQuery": para update/remove, qual o interesse existente a modificar. Usa o valor exato do "query" do interesse atual.

Regras de interpretação:
- "quero X, Y e Z" → múltiplos "add"
- "não quero X da marca Y" → "update" ao interesse "X" com adição à lista de exclusões
- "sem X", "exceto X", "menos X", "exclui X" → "update" com exclusões
- "tira X", "remove X", "apaga X" → "remove"
- Se o utilizador mencionar marcas, incluí-las em "brands"
- Se o utilizador especificar características do produto, colocá-las em "includeKeywords"
- Se o utilizador excluir algo que é uma marca, colocá-lo em "excludeKeywords" com o nome da marca
- Usa apenas categorias da lista disponível. Se nenhuma encaixar bem, usa a mais próxima.
- Não inventes marcas nem categorias.

Devolve APENAS JSON:
{
  "operations": [
    {
      "action": "add",
      "interest": {
        "query": "string",
        "categories": ["string"],
        "brands": ["string"],
        "includeKeywords": ["string"],
        "excludeKeywords": ["string"]
      }
    }
  ]
}

Os campos "brands", "includeKeywords" e "excludeKeywords" são opcionais - omite-os se vazios.
O campo "targetQuery" é obrigatório para "update" e "remove", e deve ser omitido para "add".`;
};

export const extractInterests = async (
  userMessage: string,
  categories: string[],
  existingInterests: InterestInput[]
): Promise<InterestExtractionResult> => {
  try {
    const client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseURL: 'https://api.deepseek.com',
    });

    const systemPrompt = buildExtractionPrompt(categories, existingInterests);

    const response = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 2048,
    });

    const text = response.choices[0]?.message?.content;
    if (!text) {
      throw new Error('Resposta vazia do DeepSeek');
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Formato de resposta inválido do DeepSeek');
    }

    const parsed: InterestExtractionResult = JSON.parse(jsonMatch[0]);

    if (!parsed.operations || !Array.isArray(parsed.operations)) {
      return { operations: [] };
    }

    const sanitizeInterest = (interest: unknown): InterestOperation['interest'] => {
      if (!interest || typeof interest !== 'object') {
        return { query: '', categories: [] };
      }
      const i = interest as Record<string, unknown>;
      return {
        query: typeof i.query === 'string' ? i.query : '',
        categories: Array.isArray(i.categories) ? i.categories.filter((c: unknown): c is string => typeof c === 'string') : [],
        brands: Array.isArray(i.brands) ? i.brands.filter((b: unknown): b is string => typeof b === 'string') : undefined,
        includeKeywords: Array.isArray(i.includeKeywords) ? i.includeKeywords.filter((k: unknown): k is string => typeof k === 'string') : undefined,
        excludeKeywords: Array.isArray(i.excludeKeywords) ? i.excludeKeywords.filter((k: unknown): k is string => typeof k === 'string') : undefined,
      };
    };

    const operations: InterestOperation[] = parsed.operations
      .filter((op: unknown): op is Record<string, unknown> => !!op && typeof op === 'object')
      .map((op): InterestOperation => ({
        action: (['add', 'update', 'remove'].includes(op.action as string) ? op.action : 'add') as InterestOperation['action'],
        interest: sanitizeInterest(op.interest),
        targetQuery: typeof op.targetQuery === 'string' ? op.targetQuery : undefined,
      }));

    return { operations };
  } catch (error) {
    console.error('Erro ao extrair interesses com DeepSeek:', error);
    return { operations: [] };
  }
};
