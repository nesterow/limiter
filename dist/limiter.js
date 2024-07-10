export class LimiterRetryError extends Error {
    constructor(message, error) {
        super(message);
        this.name = "RetryError";
        if (error) {
            this.stack = error.stack;
            this.cause = error;
        }
    }
}
export class Limiter {
    #limit = 10;
    #promisesCount = 0;
    #promises = [];
    #retryQueue = [];
    #maxRetry = 0;
    #rps;
    #onError;
    constructor({ limit = 10, rps, maxRetry = 0, onError = undefined, }) {
        this.#limit = limit;
        this.#rps = rps;
        this.#maxRetry = maxRetry;
        this.#onError = onError?.bind(this);
    }
    #tick = Date.now();
    async #limitRps(callback, delay = 0) {
        if (!this.#rps) {
            return await callback();
        }
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        const diff = Date.now() - this.#tick;
        if (diff < 1000 / this.#rps) {
            return await this.#limitRps(callback, 1000 / this.#rps - diff);
        }
        this.#tick = Date.now();
        return await callback();
    }
    async #execute() {
        try {
            await Promise.all(this.#promises);
            this.#promises = [];
        }
        catch (error) {
            if (!this.#onError) {
                throw error;
            }
            for (;;) {
                const promise = this.#promises.pop();
                if (!promise)
                    break;
                promise.catch(this.#onError);
            }
        }
    }
    async process(...callbacks) {
        for (;;) {
            const item = callbacks.pop();
            if (!item)
                break;
            if (this.#promisesCount >= this.#limit) {
                await this.#execute();
            }
            this.#promisesCount++;
            const promise = (async (item) => {
                const callback = item.callback || item;
                try {
                    const res = await this.#limitRps(callback);
                    this.#promisesCount--;
                    return res;
                }
                catch (error) {
                    this.#promisesCount--;
                    if (this.#maxRetry > 0) {
                        this.#retryQueue.push({
                            callback,
                            retries: item.retries ?? this.#maxRetry,
                            error: error,
                        });
                    }
                    else {
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
            const retryItems = [];
            for (;;) {
                const item = this.#retryQueue.pop();
                if (!item)
                    break;
                if (item.retries > 0) {
                    item.retries--;
                    retryItems.push(item);
                }
                else if (this.#onError) {
                    this.#onError(new LimiterRetryError("Retry limit exceeded", item.error));
                }
                else {
                    throw new LimiterRetryError("Retry limit exceeded", item.error);
                }
            }
            if (retryItems.length) {
                await this.process(...retryItems);
            }
        }
    }
    get length() {
        return this.#promisesCount;
    }
}
