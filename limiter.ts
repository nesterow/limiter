type AsyncCallback = () => any | Promise<any>;

export interface ILimiter {
  process: (...cb: AsyncCallback[]) => Promise<void>;
}

export interface ILimiterOptions {
  limit?: number;
  maxRetry?: number;
  rps?: number;
  onError?: (error: Error) => Promise<void> | void;
}

interface ILimiterRetryItem {
  callback: AsyncCallback;
  retries: number;
  error?: Error;
}

export class LimiterRetryError extends Error {
  constructor(message: string, error?: Error) {
    super(message);
    this.name = "RetryError";
    if (error) {
      this.stack = error.stack;
      this.cause = error;
    }
  }
}

export class Limiter implements ILimiter {
  #limit = 10;
  #promisesCount = 0;
  #promises: Promise<any>[] = [];
  #retryQueue: Array<ILimiterRetryItem> = [];
  #maxRetry = 0;
  #rps: number | undefined;
  #onError?: (error: Error) => void | Promise<void>;

  constructor({
    limit = 10,
    rps,
    maxRetry = 0,
    onError = undefined,
  }: ILimiterOptions) {
    this.#limit = limit;
    this.#rps = rps;
    this.#maxRetry = maxRetry;
    this.#onError = onError?.bind(this);
  }

  #tick = Date.now();
  async #limitRps(callback: AsyncCallback, delay = 0): Promise<any> {
    if (!this.#rps) {
      return await callback();
    }
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const diff = Date.now() - this.#tick;
    if (diff < 1000 / this.#rps!) {
      return await this.#limitRps(callback, 1000 / this.#rps! - diff);
    }
    this.#tick = Date.now();
    return await callback();
  }

  async #execute() {
    try {
      await Promise.all(this.#promises);
      this.#promises = [];
    } catch (error) {
      if (!this.#onError) {
        throw error;
      }
      for (;;) {
        const promise = this.#promises.pop();
        if (!promise) break;
        promise.catch(this.#onError);
      }
    }
  }

  async process(...callbacks: AsyncCallback[] | ILimiterRetryItem[]) {
    for (;;) {
      const item = callbacks.pop();
      if (!item) break;

      if (this.#promisesCount >= this.#limit) {
        await this.#execute();
      }

      this.#promisesCount++;
      const promise = (async (item) => {
        const callback =
          (item as ILimiterRetryItem).callback || (item as AsyncCallback);
        try {
          const res = await this.#limitRps(callback);
          this.#promisesCount--;
          return res;
        } catch (error) {
          this.#promisesCount--;
          if (this.#maxRetry > 0) {
            this.#retryQueue.push({
              callback,
              retries: (item as ILimiterRetryItem).retries ?? this.#maxRetry,
              error: error as Error,
            });
          } else {
            throw error;
          }
        }
      })(item);
      this.#promises.push(promise);
    }

    if (this.#promises.length > 0) {
      await this.#execute();
    }

    if (this.#retryQueue.length > 0) {
      const retryItems: ILimiterRetryItem[] = [];
      for (;;) {
        const item = this.#retryQueue.pop();
        if (!item) break;
        if (item.retries > 0) {
          item.retries--;
          retryItems.push(item);
        } else if (this.#onError) {
          this.#onError(
            new LimiterRetryError("Retry limit exceeded", item.error),
          );
        } else {
          throw new LimiterRetryError("Retry limit exceeded", item.error);
        }
      }
      if (retryItems.length) {
        await this.process(...retryItems);
      }
    }
  }

  get length(): number {
    return this.#promisesCount;
  }
}
