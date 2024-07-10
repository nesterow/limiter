# Limiter

A promise poll with RPS limiter.

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

## Usage

### Limit number of requests

```typescript
import {Limiter} from '@nesterow/limiter'

const task = () => {
    await fetch('https://my.api.xyz')
    // ... write
}

const limiter = new Limiter({
    limit: 10
})

for (let i=0; i<100; i++) {
    await limiter.process(task)
}

```

### Limit RPS

```typescript
import {Limiter} from '@nesterow/limiter'

const execEvery100ms = () => {
    await fetch('https://my.api.xyz')
    // ... write
}

const limiter = new Limiter({
    limit: 20
    rps: 10
})

for (let i=0; i < 100; i++) {
    await limiter.process(execEvery100ms)
}

```

### Retry

```typescript
import {Limiter, LimiterRetryError} from '@nesterow/limiter'

const retry5times = () => {
    await fetch('https://my.api.xyz')
    throw new Error("Connection refused")
    // ... write
}

const limiter = new Limiter({
    limit: 20
    maxRetry: 5
})

for (let i=0; i < 100; i++) {
    try {
        await limiter.process(retry5times)
    } catch(e) {
        if (e instanceof LimiterRetryError) {
            // Logger.log(e)
        }
    }
}

```

### Handle errors in background

```typescript
import {Limiter, LimiterRetryError} from '@nesterow/limiter'

const wontStopPooling = () => {
    await fetch('https://my.api.xyz')
    throw new Error("Connection refused")
    // ... write
}

const limiter = new Limiter({
    limit: 20
    maxRetry: 5,
    onError(error) {
        // Logger.error(error)
    }
})

for (let i=0; i < 100; i++) {
    await limiter.process(wontStopPooling)
}

```
