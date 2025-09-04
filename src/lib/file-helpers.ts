export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const fr = new FileReader();

      fr.onload = () => {
        if (typeof fr.result === 'string') return resolve(fr.result);
        return reject(new Error('FileReader produced a non-string result.'));
      };

      fr.onerror = () => {
        const msg =
          (fr.error && fr.error.message) ||
          'Failed to read file with FileReader.';
        reject(new Error(msg));
      };

      fr.onabort = () => reject(new Error('File read aborted by the browser.'));
      fr.readAsDataURL(file);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Unknown FileReader error'));
    }
  });
}
