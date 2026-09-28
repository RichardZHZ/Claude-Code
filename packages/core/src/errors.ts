/** 业务错误：API 层据此返回 4xx，而不是 500。 */
export type DomainErrorCode = 'not_found' | 'invalid' | 'unavailable';

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export function notFound(what: string, id: number | string): DomainError {
  return new DomainError('not_found', `${what}不存在：${id}`);
}

export function invalid(message: string): DomainError {
  return new DomainError('invalid', message);
}

/** 依赖的外部服务（例如 Zotero）暂时不可用。 */
export function unavailable(message: string): DomainError {
  return new DomainError('unavailable', message);
}
