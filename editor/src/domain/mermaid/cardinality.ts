import type { Relation } from '../types';

export const CARD_L: Record<Relation['cardL'], string> = {
  '||': 'Exatamente 1',
  '|o': 'Zero ou 1',
  '}o': 'Zero ou N',
  '}|': '1 ou N',
};

export const CARD_R: Record<Relation['cardR'], string> = {
  '||': 'Exatamente 1',
  'o|': 'Zero ou 1',
  'o{': 'Zero ou N',
  '|{': '1 ou N',
};
