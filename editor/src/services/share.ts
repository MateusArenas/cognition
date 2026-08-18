import * as Sharing from 'expo-sharing';

export async function shareFile(uri: string, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, { mimeType });
}
