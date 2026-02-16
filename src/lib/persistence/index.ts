export * from './types';
export * from './localProgressStore';

import { LocalProgressStore } from './localProgressStore';

export const progressStore = new LocalProgressStore();
