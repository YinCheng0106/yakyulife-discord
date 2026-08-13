import { describe, expect, test } from "bun:test";
import {
  isTransientPostgresError,
  postgresErrorCode,
  verifyPostgresConnection,
} from "./postgres-health.ts";

describe("PostgreSQL startup health check", () => {
  test("retries a transient closed connection and then succeeds", async () => {
    let calls = 0;
    const delays: number[] = [];
    const retries: string[] = [];

    await verifyPostgresConnection(
      async () => {
        calls += 1;
        if (calls < 3)
          throw Object.assign(new Error("Connection closed"), {
            code: "ERR_POSTGRES_CONNECTION_CLOSED",
          });
      },
      {
        delay: async (milliseconds) => {
          delays.push(milliseconds);
        },
        onRetry: ({ code }) => retries.push(code),
      },
    );

    expect(calls).toBe(3);
    expect(delays).toEqual([250, 500]);
    expect(retries).toEqual(["ERR_POSTGRES_CONNECTION_CLOSED", "ERR_POSTGRES_CONNECTION_CLOSED"]);
  });

  test("does not retry authentication or application errors", async () => {
    let calls = 0;
    const failure = Object.assign(new Error("password authentication failed"), { code: "28P01" });
    expect(
      verifyPostgresConnection(async () => {
        calls += 1;
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(calls).toBe(1);
    expect(isTransientPostgresError(failure)).toBe(false);
    expect(postgresErrorCode(failure)).toBe("28P01");
  });

  test("stops after the configured number of attempts", async () => {
    let calls = 0;
    const failure = Object.assign(new Error("Connection closed"), {
      code: "ERR_POSTGRES_CONNECTION_CLOSED",
    });
    expect(
      verifyPostgresConnection(
        async () => {
          calls += 1;
          throw failure;
        },
        { attempts: 3, delay: async () => undefined },
      ),
    ).rejects.toBe(failure);
    expect(calls).toBe(3);
  });
});
