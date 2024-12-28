import { Bracket as B } from "fp-ts-bracket";
import * as A from "fp-ts/lib/Array";
import { constVoid, pipe } from "fp-ts/lib/function";
import * as T from "fp-ts/lib/Task";
import * as TE from "fp-ts/lib/TaskEither";
import { expect } from "vitest";
import { withPool } from "../lib";
import {
  expectTaskEitherLeft,
  expectTaskEitherRight,
  flattenErrors,
  fromSeparated,
  testTaskEither,
} from "./helpers";

// eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
const TEVoid = TE.of(constVoid());

testTaskEither("acquire only one client when running in sequence", () => {
  let clients = 0;

  function create() {
    clients++;
    return TE.of(() => TE.of<Error, number>(clients));
  }

  function destroy() {
    clients--;
    return TEVoid;
  }

  const withTestPool = withPool({
    create,
    destroy,
    min: 1,
    max: 10,
  });

  const traverseInParallel = A.wilt(T.ApplicativeSeq);

  return pipe(
    withTestPool((acquire) =>
      pipe(
        [10, 20, 30],
        traverseInParallel((n) =>
          pipe(
            acquire(),
            B.use((client) =>
              pipe(
                client(),
                TE.map((i) => n + i),
              ),
            ),
          ),
        ),
        T.map(fromSeparated),
        TE.mapLeft(flattenErrors),
      ),
    ),
    expectTaskEitherRight((numbers) => {
      expect(numbers).toStrictEqual([11, 21, 31]);
      expect(clients).toBe(0);
    }),
  );
});

testTaskEither("acquire three clients when running in parallel", () => {
  let clients = 0;

  function create() {
    clients++;
    return TE.of(() => TE.of<Error, number>(clients));
  }

  function destroy() {
    clients--;
    return TEVoid;
  }

  const withTestPool = withPool({
    create,
    destroy,
    min: 1,
    max: 10,
  });

  const traverseInParallel = A.wilt(T.ApplicativePar);

  return pipe(
    withTestPool((acquire) =>
      pipe(
        [10, 20, 30],
        traverseInParallel((n) =>
          pipe(
            acquire(),
            B.use((client) =>
              pipe(
                client(),
                TE.map((i) => n + i),
              ),
            ),
          ),
        ),
        T.map(fromSeparated),
        TE.mapLeft(flattenErrors),
      ),
    ),
    expectTaskEitherRight((numbers) => {
      expect(numbers).toStrictEqual([13, 23, 33]);
      expect(clients).toBe(0);
    }),
  );
});

testTaskEither("gracefully shutdown when client throws error", () => {
  let clients = 0;

  function create(): TE.TaskEither<Error, () => TE.TaskEither<Error, number>> {
    clients++;
    const wantToFail = clients === 2;

    return TE.of(() =>
      wantToFail ? TE.left(new Error("Failed client #2")) : TE.of(clients),
    );
  }

  function destroy() {
    clients--;
    return TEVoid;
  }

  const withTestPool = withPool({
    create,
    destroy,
    min: 1,
    max: 10,
  });

  const traverseInParallel = A.wilt(T.ApplicativePar);

  return pipe(
    withTestPool((acquire) =>
      pipe(
        [10, 20, 30],
        traverseInParallel((n) =>
          pipe(
            acquire(),
            B.use((client) =>
              pipe(
                client(),
                TE.map((i) => n + i),
              ),
            ),
          ),
        ),
        T.tapIO((s) => () => {
          // we still have results from other clients because we use Task applicative
          expect(s.right).toStrictEqual([13, 33]);
        }),
        T.map(fromSeparated),
        TE.mapLeft(flattenErrors),
      ),
    ),
    expectTaskEitherLeft((error) => {
      expect(error.message).toBe("Failed client #2");
      expect(clients).toBe(0);
    }),
  );
});

testTaskEither("gracefully shutdown when client creation throws error", () => {
  let clients = 0;

  function create(): TE.TaskEither<Error, () => TE.TaskEither<Error, number>> {
    if (clients >= 2) {
      return TE.left(new Error("Failed to create more clients"));
    }

    clients++;
    return TE.of(() => TE.of(clients));
  }

  function destroy() {
    clients--;
    return TEVoid;
  }

  const withTestPool = withPool({
    create,
    destroy,
    min: 1,
    max: 10,
    propagateCreateError: true,
  });

  const traverseInParallel = A.wilt(T.ApplicativePar);

  return pipe(
    withTestPool((acquire) =>
      pipe(
        [10, 20, 30],
        traverseInParallel((n) =>
          pipe(
            acquire(),
            B.use((client) =>
              pipe(
                client(),
                TE.map((i) => n + i),
              ),
            ),
          ),
        ),
        T.tapIO((s) => () => {
          // we still have results from other clients because we use Task applicative
          expect(s.right).toStrictEqual([22, 32]);
        }),
        T.map(fromSeparated),
        TE.mapLeft(flattenErrors),
      ),
    ),
    expectTaskEitherLeft((error) => {
      expect(error.message).toBe("Failed to create more clients");
      expect(clients).toBe(0);
    }),
  );
});
