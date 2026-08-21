import { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Field } from '@/design/components/Field';
import { RowSwitch } from '@/design/components/RowSwitch';
import { Sheet } from '@/design/components/Sheet';
import { TintedButton } from '@/design/components/TintedButton';
import { useTheme } from '@/design/useTheme';
import { useI18n } from '@/i18n/I18nProvider';

export interface ImportSheetHandle {
  present: () => void;
}

interface Props {
  // Devolve o texto lido/colado + se a 1ª linha é cabeçalho — quem chama decide o que fazer
  // (abrir como novo documento, na Galeria, OU substituir a tabela atual, no editor — mesmo
  // componente serve os dois lugares).
  onImport: (text: string, fileName: string | null, headerRow: boolean) => void;
}

// Duas vias, iguais ao protótipo de referência: escolher um arquivo (expo-document-picker) ou
// colar texto direto. Encoding: tenta UTF-8, se aparecer o caractere de substituição (encoding
// errado) refaz como ISO-8859-1 — a armadilha nº 1 de CSV brasileiro (docs/19-tabelas-csv.md).
export const ImportSheet = forwardRef<ImportSheetHandle, Props>(function ImportSheet({ onImport }, handleRef) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [pasted, setPasted] = useState('');
  const [headerRow, setHeaderRow] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(handleRef, () => ({ present: () => sheetRef.current?.present() }));

  async function pickFile() {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values', 'text/plain'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const file = res.assets[0];
    try {
      let text = await FileSystem.readAsStringAsync(file.uri);
      if (text.includes('�')) {
        const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
        text = latin1FromBase64(base64);
      }
      sheetRef.current?.dismiss();
      onImport(text, file.name.replace(/\.[^.]+$/, ''), headerRow);
      setPasted('');
    } catch {
      setError(t('csv.importReadError'));
    }
  }

  function importPasted() {
    const text = pasted.trim();
    if (!text) {
      setError(t('csv.importEmptyError'));
      return;
    }
    sheetRef.current?.dismiss();
    onImport(text, null, headerRow);
    setPasted('');
  }

  return (
    <Sheet ref={sheetRef} title={t('csv.importCsv')} snapPoints={['72%']}>
      <View style={{ gap: space.lg }}>
        <View>
          <SectionTitle text={t('csv.importFromFile')} />
          <Text style={[styles.hint, { color: colors.labelSecondary }]}>{t('csv.importFromFileHint')}</Text>
          <TintedButton icon="document" label={t('csv.pickFile')} onPress={pickFile} />
        </View>
        <View>
          <SectionTitle text={t('csv.importPasteText')} />
          <Text style={[styles.hint, { color: colors.labelSecondary }]}>{t('csv.importPasteTextHint')}</Text>
          <Field value={pasted} onChangeText={setPasted} mono multiline numberOfLines={6} style={styles.paste} />
        </View>
        <RowSwitchLine label={t('csv.headerRowToggle')} value={headerRow} onChange={setHeaderRow} />
        {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
        <TintedButton label={t('csv.importAction')} onPress={importPasted} disabled={!pasted.trim()} />
      </View>
    </Sheet>
  );
});

function SectionTitle({ text }: { text: string }) {
  const { colors } = useTheme();
  return <Text style={[styles.section, { color: colors.labelSecondary }]}>{text}</Text>;
}

function RowSwitchLine({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.switchLine}>
      <Text style={{ color: colors.label, fontSize: 15 }}>{label}</Text>
      <RowSwitch value={value} onValueChange={onChange} />
    </View>
  );
}

// Decodificador base64 -> ISO-8859-1 escrito à mão: `atob` não é garantido global no runtime
// Hermes do RN (sem polyfill no projeto), e trazer uma lib só pra isso é peso à toa pra ~15
// linhas. Cada byte decodificado já É o code point ISO-8859-1 correspondente (fromCharCode).
const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function latin1FromBase64(base64: string): string {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = B64_CHARS.indexOf(clean[i]);
    const e2 = B64_CHARS.indexOf(clean[i + 1]);
    const e3 = clean[i + 2] !== undefined ? B64_CHARS.indexOf(clean[i + 2]) : -1;
    const e4 = clean[i + 3] !== undefined ? B64_CHARS.indexOf(clean[i + 3]) : -1;
    const c1 = (e1 << 2) | (e2 >> 4);
    out += String.fromCharCode(c1);
    if (e3 >= 0) out += String.fromCharCode(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 >= 0) out += String.fromCharCode(((e3 & 3) << 6) | e4);
  }
  return out;
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  paste: { height: 140, textAlignVertical: 'top', paddingTop: 10 },
  switchLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
