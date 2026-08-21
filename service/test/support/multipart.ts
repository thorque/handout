/**
 * A hand-built `multipart/form-data` body for `app.inject`, so both endpoint suites need
 * no extra dependency just to post a file. `multipartFormData` covers the common shape
 * (fields, then one file) that most cases need; `multipartRequest` takes an explicit,
 * ordered list of parts for the cases that care about order or repetition themselves —
 * multipart/form-data does not fix the order fields and files arrive in, and the create
 * endpoint has to cope with either.
 */
import { randomBytes } from 'node:crypto';

export interface MultipartFile {
  fieldname: string;
  filename: string;
  contentType: string;
  content: Buffer | string;
}

export type MultipartPart =
  { kind: 'field'; name: string; value: string } | ({ kind: 'file' } & MultipartFile);

export interface MultipartRequest {
  headers: { 'content-type': string };
  payload: Buffer;
}

export function multipartRequest(parts: MultipartPart[]): MultipartRequest {
  const boundary = `handoutTestBoundary${randomBytes(8).toString('hex')}`;
  const buffers: Buffer[] = [];

  for (const part of parts) {
    if (part.kind === 'field') {
      buffers.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`,
        ),
      );
      continue;
    }

    buffers.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${part.fieldname}"; ` +
          `filename="${part.filename}"\r\nContent-Type: ${part.contentType}\r\n\r\n`,
      ),
    );
    buffers.push(Buffer.isBuffer(part.content) ? part.content : Buffer.from(part.content));
    buffers.push(Buffer.from('\r\n'));
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(buffers),
  };
}

/** The common shape: every field, then one file — the order the plan's hand review uses. */
export function multipartFormData(
  fields: Record<string, string>,
  file?: MultipartFile,
): MultipartRequest {
  const parts: MultipartPart[] = Object.entries(fields).map(([name, value]) => ({
    kind: 'field' as const,
    name,
    value,
  }));
  if (file !== undefined) parts.push({ kind: 'file' as const, ...file });
  return multipartRequest(parts);
}
