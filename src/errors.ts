export interface TejErrorOptions {
  statusCode?: number;
  errorCode?: string;
  requestId?: string;
  cause?: unknown;
}

/** Base class for every error the SDK throws. */
export class TejError extends Error {
  readonly statusCode: number | undefined;
  readonly errorCode: string | undefined;
  readonly requestId: string | undefined;

  constructor(message: string, opts: TejErrorOptions = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = new.target.name;
    this.statusCode = opts.statusCode;
    this.errorCode = opts.errorCode;
    this.requestId = opts.requestId;
  }

  override toString(): string {
    const parts = [`${this.name}: ${this.message}`];
    if (this.statusCode !== undefined) parts.push(`status=${this.statusCode}`);
    if (this.errorCode) parts.push(`error=${this.errorCode}`);
    if (this.requestId) parts.push(`request_id=${this.requestId}`);
    return parts.join(" ");
  }
}

/** Thrown locally, before any request, when an argument is invalid. */
export class ValidationError extends TejError {}

/** HTTP 400: invalid path or query parameter. */
export class BadRequestError extends TejError {}

/**
 * HTTP 401: no key was sent where one is required, or the key is malformed,
 * unknown, or revoked. `errorCode` is `key_required` or `invalid_key`.
 * Get a free key at https://tejhq.dev/keys.
 */
export class AuthError extends TejError {}

/** HTTP 402: endpoint needs a paid key, Retail or Pro. */
export class ProRequiredError extends TejError {}

/** HTTP 404: resource not found. */
export class NotFoundError extends TejError {}

/** HTTP 429: per-IP, per-minute or daily limit reached. */
export class RateLimitError extends TejError {}

/** HTTP 5xx: upstream failure after retries. */
export class ServerError extends TejError {}

/** Transport failure: DNS, connection, TLS, abort, timeout. */
export class NetworkError extends TejError {}

export function fromStatus(status: number, message: string, opts: TejErrorOptions = {}): TejError {
  const o = { ...opts, statusCode: status };
  if (status === 400) return new BadRequestError(message, o);
  if (status === 401) return new AuthError(message, o);
  if (status === 402) return new ProRequiredError(message, o);
  if (status === 404) return new NotFoundError(message, o);
  if (status === 429) return new RateLimitError(message, o);
  if (status >= 500 && status < 600) return new ServerError(message, o);
  return new TejError(message, o);
}
