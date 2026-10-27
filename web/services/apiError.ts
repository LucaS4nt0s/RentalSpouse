export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function parseErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    if ('detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        return detail
          .map((item) =>
            typeof item === 'object' && item && 'msg' in item
              ? String((item as { msg: unknown }).msg)
              : String(item),
          )
          .join(', ');
      }
      if (
        typeof detail === 'object' &&
        detail !== null &&
        'message' in detail &&
        typeof (detail as { message: unknown }).message === 'string'
      ) {
        return (detail as { message: string }).message;
      }
    }
    if (
      'message' in body &&
      typeof (body as { message: unknown }).message === 'string'
    ) {
      return (body as { message: string }).message;
    }
  }
  return fallback;
}
