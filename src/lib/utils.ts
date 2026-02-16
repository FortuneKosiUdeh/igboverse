import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes an Igbo string by converting it to lowercase and removing diacritics (tone marks).
 * This is useful for accent-insensitive search.
 * @param str The string to normalize.
 * @returns The normalized string.
 */
export function normalizeIgboString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD") // Decompose characters into base characters and combining marks
    .replace(/[\u0300-\u036f]/g, ""); // Remove combining diacritical marks
}
