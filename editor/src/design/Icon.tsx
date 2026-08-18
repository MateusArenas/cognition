import {
  X,
  Check,
  ChevronRight,
  Plus,
  Minus,
  Undo2,
  Redo2,
  Trash2,
  CircleEllipsis,
  Info,
  Sparkles,
} from 'lucide-react-native';
import { useTheme } from './useTheme';

// Ícones vêm do lucide-react-native (SVG puro, mesma base do runtime — react-native-svg —
// então roda sem plugin nativo extra, inclusive no Expo Go). Registro pequeno de propósito:
// adicione um ícone por vez, quando uma feature precisar, escolhendo o equivalente mais
// próximo do desenho do protótipo (editor-mermaid.html, registro `ICO`) em vez de inventar um
// novo. Ver docs/03-design-system.md.
const ICONS = {
  close: X,
  check: Check,
  chevronRight: ChevronRight,
  plus: Plus,
  minus: Minus,
  undo: Undo2,
  redo: Redo2,
  trash: Trash2,
  menu: CircleEllipsis,
  info: Info,
  spark: Sparkles,
} as const;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 22, color }: Props) {
  const { colors } = useTheme();
  const Cmp = ICONS[name];
  return <Cmp size={size} color={color ?? colors.blue} strokeWidth={1.8} />;
}
