export type ApiResult<T, E = any> = {
  data: T | null;
  error: { message: string; status?: number; kind?: string } | null;
  ok: boolean;
};
