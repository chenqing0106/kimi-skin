import type { CdpTarget } from "./types.js";

export async function fetchCdpJson<T>(port: number, route: string, timeoutMs = 5_000): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`CDP ${route} 返回 HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export async function isCdpReady(port: number): Promise<boolean> {
  try {
    await fetchCdpJson(port, "/json/version");
    return true;
  } catch {
    return false;
  }
}

export async function waitForCdp(port: number, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCdpReady(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`CDP 端口 ${port} 未在限定时间内就绪`);
}

export async function listTargets(port: number): Promise<CdpTarget[]> {
  return fetchCdpJson<CdpTarget[]>(port, "/json/list");
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

export class CdpSession {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    this.socket.addEventListener("close", () => {
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("CDP WebSocket 已关闭"));
      }
      this.pending.clear();
    });
  }

  async open(timeoutMs = 3_000): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP WebSocket 连接超时")), timeoutMs);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP WebSocket 连接失败"));
      }, { once: true });
    });
  }

  send<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 5_000): Promise<T> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP WebSocket 尚未连接"));
    }
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 调用超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send<{
      result?: { value?: T };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "页面脚本执行失败");
    }
    return response.result?.value as T;
  }

  close(): void {
    try {
      this.socket.close();
    } catch {
      // A failed connection may already be closing.
    }
  }
}
