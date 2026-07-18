export interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface IncusTransport {
  name: string;
  isAvailable(): Promise<boolean>;
  get(path: string): Promise<any>;
  post(path: string, body?: any): Promise<any>;
  put(path: string, body?: any): Promise<any>;
  patch(path: string, body?: any): Promise<any>;
  delete(path: string, body?: any): Promise<any>;
  rawRequest(method: string, path: string, headers?: Record<string, string>, body?: string | Buffer): Promise<RawResponse>;
}
