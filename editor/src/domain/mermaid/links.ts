import type { LinkKey } from '../types';

export interface LinkDef { nome: string; op: string }

export const LINKS: Record<LinkKey, LinkDef> = {
  arrow: { nome: 'Seta', op: '-->' },
  open: { nome: 'Linha', op: '---' },
  dotted: { nome: 'Tracejada', op: '-.->' },
  dottedO: { nome: 'Tracej. aberta', op: '-.-' },
  thick: { nome: 'Grossa', op: '==>' },
  thickO: { nome: 'Grossa aberta', op: '===' },
  cross: { nome: 'Cruz', op: '--x' },
  circleE: { nome: 'Círculo', op: '--o' },
  bi: { nome: 'Bidirecional', op: '<-->' },
};

export const OP2LINK: Record<string, LinkKey> = Object.fromEntries(
  (Object.entries(LINKS) as [LinkKey, LinkDef][]).map(([k, v]) => [v.op, k])
) as Record<string, LinkKey>;
