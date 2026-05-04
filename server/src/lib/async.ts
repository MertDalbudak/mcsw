import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';

// Wrap an async route handler so rejected promises reach the express
// error middleware. The optional `P` generic lets a handler narrow
// `req.params` when needed:
//
//   asyncHandler<{ id: string }>(async (req) => {
//     const { id } = req.params;  // typed as string
//   })
export function asyncHandler<P = ParamsDictionary>(
  fn: (req: Request<P>, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return ((req, res, next) => {
    Promise.resolve(fn(req as unknown as Request<P>, res, next)).catch(next);
  }) as RequestHandler;
}
