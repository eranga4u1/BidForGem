/**
 * PUT a file directly to storage via a pre-signed URL, with progress. Uses XHR
 * (fetch has no upload-progress event). The file bytes never pass through the
 * API — they go straight to the object store.
 */
export function uploadToStorage(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (event): void => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = (): void => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = (): void => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}
