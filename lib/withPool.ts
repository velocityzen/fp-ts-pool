import { Bracket as B } from "fp-ts-bracket";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { Pool } from "tarn";
import { PoolOptions } from "tarn/dist/Pool";
import { toPromise } from "./TaskEither";

export interface WithPoolOptions<R>
  extends Omit<PoolOptions<R>, "create" | "destroy" | "validate"> {
  create: () => TE.TaskEither<Error, R>;
  destroy: (client: R) => TE.TaskEither<Error, void>;
  validate?: (client: R) => TE.TaskEither<Error, boolean>;
}

export function withPool<R>({
  create,
  destroy,
  validate,
  ...moreOptions
}: WithPoolOptions<R>) {
  const options: PoolOptions<R> = {
    ...moreOptions,
    create() {
      return pipe(create(), toPromise);
    },
    destroy(client) {
      return pipe(client, destroy, toPromise);
    },
  };

  if (validate) {
    // waiting for fix for types
    options.validate = (client) =>
      pipe(client, validate, toPromise) as unknown as boolean;
  }

  const aquirePool: TE.TaskEither<Error, Pool<R>> = () =>
    pipe(
      E.tryCatch(() => new Pool(options), E.toError),
      (e) => Promise.resolve(e),
    );

  const releasePool = (pool: Pool<R>) =>
    TE.tryCatch(async () => {
      await pool.destroy();
    }, E.toError);

  const withPool = B.Bracket(aquirePool, releasePool);

  return <T>(
    fn: (
      acquire: (priority?: number) => B.Bracket<Error, R>,
    ) => TE.TaskEither<Error, T>,
  ): TE.TaskEither<Error, T> =>
    pipe(
      withPool,
      B.use((pool: Pool<R>) => {
        const acquire = () =>
          B.Bracket(
            TE.tryCatch(() => pool.acquire().promise, E.toError),
            (resource: R) =>
              pipe(
                E.tryCatch(() => pool.release(resource), E.toError),
                TE.fromEither,
                TE.asUnit,
              ),
          );

        return fn(acquire);
      }),
    );
}
