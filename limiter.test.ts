import { beforeAll, expect, test, jest } from "bun:test";
import { Limiter, LimiterRetryError } from "./limiter";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const setup = ({ send, close, delay = 300 }: any) => {
  return jest.fn(() => {
    let closed = false;
    let loading = false;
    return {
      process: jest.fn(async () => {
        if (closed) throw new Error("Connection closed");
        //if (loading) throw new Error("Connection in use");
        loading = true;
        await send();
        await new Promise((resolve) => setTimeout(resolve, delay));
        loading = false;
      }),
      close: jest.fn(async () => {
        close();
        closed = true;
      }),
      send,
    };
  });
};

test(
  "Limiter: opens #limit of concurent connections",
  async () => {
    const connection = setup({
      send: jest.fn(() => Promise.resolve()),
      close: jest.fn(() => Promise.resolve()),
      delay: 500,
    });

    const limiter = new Limiter({ limit: 3 });
    const connections = Array.from({ length: 7 }, () => connection());

    limiter.process(
      ...connections.map((c) => {
        return c.process;
      }),
    );

    await delay(0);
    expect(limiter.length).toBe(3);

    await delay(500);
    expect(limiter.length).toBe(3);

    await delay(500);
    expect(limiter.length).toBe(1);

    await limiter.done();
    expect(connections[0].send).toBeCalledTimes(7);
  },
  { timeout: 5000 },
);

test("Limiter: can add new connections to poll", async () => {
  const connection = setup({
    send: jest.fn(() => Promise.resolve()),
    close: jest.fn(() => Promise.resolve()),
    delay: 500,
  });

  const limiter = new Limiter({ limit: 3 });

  limiter.process(connection().process);
  limiter.process(connection().process);
  limiter.process(connection().process);
  limiter.process(connection().process, connection().process);

  await delay(0);
  expect(limiter.length).toBe(3);

  await delay(500);
  expect(limiter.length).toBe(2);

  await delay(500);
  expect(limiter.length).toBe(0);
});

test("Limiter: limit RPS - requests are evenly distributed", async () => {
  const connection = setup({
    send: jest.fn(() => {
      return Promise.resolve();
    }),
    close: jest.fn(() => Promise.resolve()),
    delay: 0,
  });

  const limiter = new Limiter({ limit: 20, rps: 10 });
  const connections = Array.from({ length: 45 }, () => connection());

  let count = 0;
  const timestamps: number[] = [];
  await limiter.process(
    ...connections.map((c) => {
      return () => {
        ++count;
        timestamps.push(Date.now());
        return c.process();
      };
    }),
  );

  expect(count).toBe(45);
  const diffsAvg =
    timestamps
      .map((t, i) => {
        return i === 0 ? 100 : t - timestamps[i - 1];
      })
      .reduce((a, b) => a + b) / timestamps.length;
  expect(diffsAvg).toBeGreaterThan(99);
  expect(diffsAvg).toBeLessThan(102); // 100ms +- 2ms
});

test("Limiter: throws an error by deafult", async () => {
  const connection = setup({
    send: jest.fn(() => Promise.reject(1)),
    close: jest.fn(() => Promise.resolve()),
    delay: 500,
  });

  const limiter = new Limiter({ limit: 3 });
  const connections = Array.from({ length: 6 }, () => connection());

  try {
    await limiter.process(
      ...connections.map((c) => {
        return c.process;
      }),
    );
  } catch (e) {
    expect(e).toBe(1);
  }

  expect(limiter.length).toBe(0);

  expect(connections[0].send).toBeCalledTimes(3);
});

test("Limiter: #onError, no trow", async () => {
  const connection = setup({
    send: jest.fn(() => Promise.reject(1)),
    close: jest.fn(() => Promise.resolve()),
    delay: 500,
  });

  const onError = jest.fn(() => {});
  const limiter = new Limiter({
    limit: 3,
    onError,
  });
  const connections = Array.from({ length: 6 }, () => connection());

  await limiter.process(
    ...connections.map((c) => {
      return c.process;
    }),
  );

  expect(limiter.length).toBe(0);
  expect(connections[0].send).toBeCalledTimes(6);
  expect(onError).toBeCalledTimes(6);
});

test("Limiter: #maxRetry, exit on fail", async () => {
  const connection = setup({
    send: () => Promise.reject(1),
    close: jest.fn(() => Promise.resolve()),
    delay: 0,
  });

  const limiter = new Limiter({
    limit: 3,
    maxRetry: 3,
  });
  const connections = Array.from({ length: 6 }, () => connection());

  let count = 0;

  try {
    await limiter.process(
      ...connections.map((c) => {
        ++count;
        return c.process;
      }),
    );
  } catch (e) {
    expect(e).toBeInstanceOf(LimiterRetryError);
  }

  expect(limiter.length).toBe(0);
});

test("Limiter: #onError, #maxRetry", async () => {
  const connection = setup({
    send: jest.fn(() => Promise.reject(new Error("Connection error"))),
    close: jest.fn(() => Promise.resolve()),
    delay: 0,
  });

  let error;
  const onError = jest.fn((err) => {
    error = err;
  });
  const limiter = new Limiter({
    limit: 3,
    maxRetry: 3,
    onError,
  });
  const connections = Array.from({ length: 6 }, () => connection());

  await limiter.process(
    ...connections.map((c) => {
      return c.process;
    }),
  );
  expect(onError).toBeCalledTimes(6);
  expect(error).toBeInstanceOf(LimiterRetryError);
});
