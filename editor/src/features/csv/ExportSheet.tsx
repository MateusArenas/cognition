import { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Field } from '@/design/components/Field';
import { Segmented } from '@/design/components/Segmented';
import { Sheet } from '@/design/components/Sheet';
import { TintedButton } from '@/design/components/TintedButton';
import { useToast } from '@/design/components/Toast';
import { useTheme } from '@/design/useTheme';
import { sheetToText } from '@/domain/csv/csv';
import type { CsvDoc } from '@/domain/types';
import { useI18n } from '@/i18n/I18nProvider';
import { exportarCsv } from '@/services/export';

export interface ExportSheetHandle {
  present: () => void;
}

interface Props {
  doc: CsvDoc;
}

// Prévia + os dois separadores, igual ao protótipo de referência: fórmulas saem já calculadas
// (CSV não tem fórmula), BOM prefixado automaticamente quando o separador é ";" (services/
// export.ts#exportarCsv -> domain/csv/csv.ts#sheetToText).
export const ExportSheet = forwardRef<ExportSheetHandle, Props>(function ExportSheet({ doc }, handleRef) {
  const { colors, space } = useTheme();
  const { t } = useI18n();
  const { show } = useToast();
  const sheetRef = useRef<BottomSheetModal>(null);
  const [delim, setDelim] = useState<CsvDoc['delimiter']>(doc.delimiter);

  useImperativeHandle(handleRef, () => ({ present: () => sheetRef.current?.present() }));

  const preview = useMemo(() => sheetToText(doc, delim).replace(/^﻿/, ''), [doc, delim]);

  async function salvarArquivo() {
    await exportarCsv(doc, delim);
    sheetRef.current?.dismiss();
  }
  async function copiarTexto() {
    await Clipboard.setStringAsync(preview);
    show(t('common.copied'));
  }

  return (
    <Sheet ref={sheetRef} title={t('csv.exportCsv')} snapPoints={['62%']}>
      <View style={{ gap: space.lg }}>
        <View>
          <Text style={[styles.section, { color: colors.labelSecondary }]}>{t('csv.exportDelimiter')}</Text>
          <Segmented
            options={[
              { value: ',', label: t('csv.delimiterComma') },
              { value: ';', label: t('csv.delimiterSemicolon') },
            ]}
            value={delim}
            onChange={(v) => setDelim(v as CsvDoc['delimiter'])}
          />
          <Text style={[styles.hint, { color: colors.labelSecondary }]}>{t('csv.exportFormulasHint')}</Text>
        </View>
        <View>
          <Text style={[styles.section, { color: colors.labelSecondary }]}>{t('csv.exportPreview')}</Text>
          <Field value={preview} editable={false} mono multiline numberOfLines={6} style={styles.preview} />
        </View>
        <View style={{ gap: space.sm }}>
          <TintedButton icon="share" label={t('csv.saveFile')} onPress={salvarArquivo} />
          <TintedButton icon="copy" label={t('common.copy')} onPress={copiarTexto} />
        </View>
      </View>
    </Sheet>
  );
});

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  hint: { fontSize: 12.5, marginTop: 8, lineHeight: 17 },
  preview: { height: 140, textAlignVertical: 'top', paddingTop: 10 },
});
