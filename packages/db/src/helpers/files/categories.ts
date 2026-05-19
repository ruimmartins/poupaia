export interface ParentCategory {
  id: number;
  nome: string;
  subcategoriasOriginais: string[];
}

export const PARENT_CATEGORIES: ParentCategory[] = [
  {
    id: 1,
    nome: 'Eletrónica & Tecnologia',
    subcategoriasOriginais: [
      'Eletrónica', 'Electrónica', 'Computadores', 'Computadores e Software', 'Eletrodomésticos',
      'Aparelhos e Acessórios Amazon', 'Software', 'Tablets', 'Smartphones', 'TVs', 'Áudio',
      'Fotografia', 'Videojogos', 'Escritório', 'Rede', 'Armazenamento',
    ],
  },
  {
    id: 2,
    nome: 'Casa & Cozinha',
    subcategoriasOriginais: [
      'Casa e Cozinha', 'Iluminação', 'Pátio, Relvado e Jardim', 'Casa', 'Cozinha',
      'Decoração', 'Móveis', 'Ferragens',
    ],
  },
  {
    id: 3,
    nome: 'Moda & Beleza',
    subcategoriasOriginais: [
      'Moda', 'Beleza', 'Perfumeria', 'Cosméticos', 'Roupa', 'Sapatos', 'Acessórios',
      'Relógios', 'Joalharia', 'Malas e Mochilas',
    ],
  },
  {
    id: 4,
    nome: 'Saúde & Farmácia',
    subcategoriasOriginais: [
      'Saúde e Casa', 'Saúde', 'Farmácia', 'Suplementos', 'Cuidados Pessoais',
      'Dietas e Suplementos Alimentares',
    ],
  },
  {
    id: 5,
    nome: 'Desporto & Exterior',
    subcategoriasOriginais: [
      'Produtos Desportivos', 'Desporto', 'Fitness', 'Campismo', 'Trekking',
      'Ciclismo', 'Natação', 'Golfe', 'Futebol', 'Ténis',
    ],
  },
  {
    id: 6,
    nome: 'Brinquedos & Bebé',
    subcategoriasOriginais: [
      'Brinquedos e Jogos', 'Produtos para Bebé', 'Brinquedos', 'Jogos', 'Bebé',
      'Puericultura', 'Moda Bebé',
    ],
  },
  {
    id: 7,
    nome: 'Automóvel',
    subcategoriasOriginais: [
      'Automóvel', 'Pneus', 'Acessórios Auto', 'Ferramentas Auto', 'Equipamento Auto',
    ],
  },
  {
    id: 8,
    nome: 'Bricolage & Ferramentas',
    subcategoriasOriginais: [
      'Bricolage e Ferramentas', 'Industrial e Científico', 'Instrumentos Musicais',
      'Produtos para Escritório', 'Ferramentas', 'Bricolage', 'Jardim',
    ],
  },
  {
    id: 9,
    nome: 'Entretenimento',
    subcategoriasOriginais: [
      'Jogos de Vídeo', 'Filmes e TV', 'Filmes', 'TV', 'Música', 'Livros',
      'Música Digital', 'Instrumentos Musicais',
    ],
  },
  {
    id: 10,
    nome: 'Animais & Mercearia',
    subcategoriasOriginais: [
      'Materiais para Animais de Estimação', 'Mercearia', 'Animais', 'Pet',
      'Comida para Animais', 'Produtos para Animais',
    ],
  },
];

/**
 * Reverse lookup map: amazon original category (top-level) → parent category name.
 * Keys are normalised to lowercase for case-insensitive matching.
 */
const _subcategoryToParent = new Map<string, string>();
for (const parent of PARENT_CATEGORIES) {
  for (const sub of parent.subcategoriasOriginais) {
    _subcategoryToParent.set(sub.toLowerCase(), parent.nome);
  }
}

/**
 * All known parent category names for fuzzy matching.
 */
const ALL_PARENT_NAMES = PARENT_CATEGORIES.map(p => p.nome);

/**
 * Returns the parent category name for a given Amazon top-level category string.
 * The match is case-insensitive. Falls back to fuzzy matching against parent names.
 * Returns "Geral" if no match found.
 */
export const getParentCategory = (amazonCategory: string): string | null => {
  const topLevel = amazonCategory.split(' > ')[0].trim().toLowerCase();
  const mapped = _subcategoryToParent.get(topLevel);
  if (mapped) return mapped;

  const fuzzy = ALL_PARENT_NAMES.find(name => topLevel.includes(name.toLowerCase()));
  if (fuzzy) return fuzzy;

  return null;
};
