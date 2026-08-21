/**
 * A hand-built `multipart/form-data` body for `app.inject`, so both endpoint suites need
 * no extra dependency just to post a file. Fields first, the file part last — the same
 * order the browser snippets in the plan's hand review use, and the order
 * `@fastify/multipart`'s own README recommends.
 */
import { randomBytes } from 'node:crypto';

export interface MultipartFile {
  fieldname: string;
  filename: string;
  contentType: string;
  content: Buffer | string;
}

export interface MultipartRequest {
  headers: { 'content-type': string };
  payload: Buffer;
}

export function multipartFormData(
  fields: Record<string, string>,
  file?: MultipartFile,
): MultipartRequest {
  const boundary = `handoutTestBoundary${randomBytes(8).toString('hex')}`;
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  if (file !== undefined) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldname}"; ` +
          `filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    parts.push(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content));
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(parts),
  };
}
