export type SimpleHttpRequest = {
  method: string;
  body?: unknown;
  query?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  url?: string;
};

export type SimpleHttpResponse = {
  status: number;
  body: string;
  headers?: Record<string, string>;
};

export type SimpleContext = {
  invocationId?: string;
  bindingData?: Record<string, unknown>;
  log?: {
    (message: string, ...args: unknown[]): void;
    error?: (message: string, ...args: unknown[]) => void;
  };
  res?: SimpleHttpResponse;
};
