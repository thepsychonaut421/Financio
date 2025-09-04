
export function fileToDataURL(file: File): Promise<string> {
    const tryFileReader = () =>
      new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => typeof fr.result === 'string'
          ? resolve(fr.result)
          : reject(new Error('FileReader produced a non-string result.'));
        fr.onerror = () => reject(fr.error ?? new Error('Failed to read file with FileReader.'));
        fr.onabort = () => reject(new Error('File read aborted by the browser.'));
        fr.readAsDataURL(file);
      });
  
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  
    // Retry once
    return tryFileReader().catch(async (err) => {
      console.warn("First FileReader attempt failed, retrying...", err);
      await sleep(150);
      try {
        return await tryFileReader();
      } catch (retryErr) {
        console.error("Second FileReader attempt failed, using fallback.", retryErr);
        // Fallback: arrayBuffer -> base64
        try {
            const buf = await file.arrayBuffer(); // if this fails, it's a true permission/lock issue
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            const b64 = btoa(binary);
            return `data:${file.type || 'application/pdf'};base64,${b64}`;
        } catch (fallbackErr) {
            console.error("ArrayBuffer fallback also failed:", fallbackErr);
            // Propagate a user-friendly error from the original attempts
            throw retryErr; 
        }
      }
    });
}
