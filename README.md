# Limiter

A promise pool with RPS limiter.

Features:

- [x] TypeScript first
- [x] Limits parrallel promises execution
- [x] Limits RPS (requests per second), evenly distributes the requests over time
- [x] Able to retry
- [x] Simple API
- [x] Simple async/await flow
- [x] Allows to handle errors silently using onError callback
- [x] Works with any runtime (Bun/Deno/Node)

## Install

```bash
bun add github:nesterow/limiter # or pnpm
```

## API

- limit - default 10
- maxRetry - number of retries, use Infinity to retry until dead
- rps - if set throttles task execution based on provided rate per second
- onError() - if set, the errors are handled silently

```typescript
limiter = new Limiter({
  limit?: number;
  maxRetry?: number;
  rps?: number;
  onError?: (error: Error) => Promise<void> | void;
})
```

## Usage

### Add tasks

```typescript
import { Limiter } from "@nesterow/limiter";

const limiter = new Limiter({
  limit: 20,
});

const task = () => {
  await fetch(url);
};

limiter.process(task);
limiter.process(task);
limiter.process(task);

await limiter.done();
```

### Batch processing

```typescript
import { Limiter } from "@nesterow/limiter";

const task = () => {
  await fetch("https://my.api.xyz");
};

const limiter = new Limiter({
  limit: 10,
});

// process 100 tasks, 10 at the same time
await limiter.process(...Array.from({ length: 100 }, () => task()));
```

### Limit RPS

```typescript
import { Limiter } from "@nesterow/limiter";

const execEvery100ms = () => {
  await fetch("https://my.api.xyz");
};

const limiter = new Limiter({
  limit: 20,
  rps: 10,
});

// trottle every 100ms
await limiter.process(...Array.from({ length: 100 }, () => execEvery100ms()));
```

### Retry

```typescript
import { Limiter, LimiterRetryError } from "@nesterow/limiter";

const retry5times = () => {
  await fetch("https://my.api.xyz");
  throw new Error("Connection refused");
};

const limiter = new Limiter({
  limit: 20,
  maxRetry: 5,
});

for (let i = 0; i < 100; i++) {
  try {
    await limiter.process(...Array.from({ length: 100 }, () => retry5times()));
  } catch (e) {
    if (e instanceof LimiterRetryError) {
      // Logger.log(e)
    }
  }
}
```

## License

MIT
