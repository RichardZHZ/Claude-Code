/** 业务错误：API 层据此返回 4xx，而不是 500。 */
export class DomainError extends Error {
  readonly code: 'not_found' | 'invalid';

  constructor(code: 'not_found' | 'invalid', message: string) {
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
