import { FileSystemUploadType, getInfoAsync, uploadAsync } from "expo-file-system/legacy";
import { api } from "./api";

export interface PickedPhoto {
  uri: string;
  mime: string;
  sizeBytes: number;
  fileName?: string;
}

/**
 * Upload one photo to a gem: request a pre-signed ticket from the API, PUT the
 * raw file bytes straight to storage (never through our API), then mark it
 * complete. Mirrors the web upload flow.
 */
export async function uploadGemPhoto(gemId: string, photo: PickedPhoto): Promise<void> {
  let sizeBytes = photo.sizeBytes;
  if (!sizeBytes) {
    const info = await getInfoAsync(photo.uri);
    if (info.exists && !info.isDirectory) sizeBytes = info.size ?? 0;
  }

  const ticket = await api.media.requestUpload(gemId, {
    type: "photo",
    mime: photo.mime,
    sizeBytes: sizeBytes || 1,
    ...(photo.fileName ? { filename: photo.fileName } : {}),
  });

  const res = await uploadAsync(ticket.url, photo.uri, {
    httpMethod: "PUT",
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: ticket.headers,
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Photo upload failed (${res.status})`);
  }

  await api.media.complete(gemId, ticket.mediaId);
}
