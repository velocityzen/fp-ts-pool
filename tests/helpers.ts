import * as S from "fp-ts/lib/Separated";
import * as E from "fp-ts/Either";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { test } from "vitest";

const isEither = (a: unknown): a is E.Either<Error, unknown> =>
  Boolean(
    a &&
      typeof a === "object" &&
      "_tag" in a &&
      (a._tag === "Left" || a._tag === "Right"),
  );

export function fromSeparated<E, A>(
  separated: S.Separated<E[], A[]>,
): E.Either<E[], A[]> {
  if (separated.left.length) {
    return E.left(separated.left);
  }

  return E.right(separated.right);
}

export function flattenErrors(errors: Error[]): Error {
  const message = errors.map((error) => error.message).join("\n");
  return Error(message);
}

export function testTaskEither<E, A>(
  description: string,
  createTest: () => T.Task<A> | TE.TaskEither<E, A>,
) {
  test(description, async () => {
    const test = createTest();
    const result = await test();

    if (isEither(result) && E.isLeft(result)) {
      throw result.left;
    }
  });
}

export const expectTaskEitherRight =
  <A, E>(rightHandler: (value: A) => void) =>
  (ma: TE.TaskEither<E, A>): T.Task<void> =>
    TE.match((error) => {
      throw error;
    }, rightHandler)(ma);

export const expectTaskEitherLeft =
  <A, E>(leftHandler: (error: E) => void) =>
  (ma: TE.TaskEither<E, A>): T.Task<void> =>
    TE.match(leftHandler, () => {
      throw new Error("It should not succeed");
    })(ma);
