// Feedback tátil (§5.3) — "é metade da sensação". Light ao selecionar, Medium ao criar,
// Warning ao excluir.
import * as Haptics from 'expo-haptics';

export const hapticSelect = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
export const hapticCreate = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
export const hapticWarning = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
