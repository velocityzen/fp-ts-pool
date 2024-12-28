import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";

export async function toPromise<A>(task: TE.TaskEither<Error, A>): Promise<A> {
  const e = await task();

  if (E.isLeft(e)) {
    throw e.left;
  }

  return e.right;
}
