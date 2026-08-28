/** `content` içindeki karakter index'inin (0-tabanlı) hangi satırda (1-tabanlı) olduğunu bulur. */
export const lineNumberAt = (content: string, charIndex: number): number => content.slice(0, charIndex).split('\n').length
