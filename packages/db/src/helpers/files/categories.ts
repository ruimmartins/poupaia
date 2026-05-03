export interface ParentCategory {
  id: number;
  nome: string;
  subcategoriasOriginais: string[];
}

export const PARENT_CATEGORIES: ParentCategory[] = [
  {
    id: 1,
    nome: 'Eletrónica & Tecnologia',
    subcategoriasOriginais: ['Eletrónica', 'Computadores', 'Eletrodomésticos', 'Aparelhos e Acessórios Amazon', 'Software'],
  },
  {
    id: 2,
    nome: 'Casa & Cozinha',
    subcategoriasOriginais: ['Casa e Cozinha', 'Iluminação', 'Pátio, Relvado e Jardim'],
  },
  {
    id: 3,
    nome: 'Moda & Beleza',
    subcategoriasOriginais: ['Moda', 'Beleza'],
  },
  {
    id: 4,
    nome: 'Saúde & Farmácia',
    subcategoriasOriginais: ['Saúde e Casa'],
  },
  {
    id: 5,
    nome: 'Desporto & Exterior',
    subcategoriasOriginais: ['Produtos Desportivos'],
  },
  {
    id: 6,
    nome: 'Brinquedos & Bebé',
    subcategoriasOriginais: ['Brinquedos e Jogos', 'Produtos para Bebé'],
  },
  {
    id: 7,
    nome: 'Automóvel',
    subcategoriasOriginais: ['Automóvel'],
  },
  {
    id: 8,
    nome: 'Bricolage & Ferramentas',
    subcategoriasOriginais: ['Bricolage e Ferramentas', 'Industrial e Científico', 'Instrumentos Musicais', 'Produtos para Escritório'],
  },
  {
    id: 9,
    nome: 'Entretenimento',
    subcategoriasOriginais: ['Jogos de Vídeo', 'Filmes e TV'],
  },
  {
    id: 10,
    nome: 'Animais & Mercearia',
    subcategoriasOriginais: ['Materiais para Animais de Estimação', 'Mercearia'],
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
 * Returns the parent category name for a given Amazon top-level category string.
 * The match is case-insensitive. Returns null if no mapping exists.
 */
export const getParentCategory = (amazonCategory: string): string | null => {
  // The scraped category is "MainDept > SubDept" — we use only the first segment.
  const topLevel = amazonCategory.split(' > ')[0].trim();
  return _subcategoryToParent.get(topLevel.toLowerCase()) ?? null;
};
