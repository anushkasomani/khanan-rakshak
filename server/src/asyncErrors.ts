/**
 * Express 4 ignores errors thrown inside async route handlers: the promise rejects, nothing catches it,
 * and Node exits, taking every user (and every SOS) down with one bad request. This forwards those
 * rejections to the error handler instead. Import it once, before any routes are registered.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require('express/lib/router/layer');

const original = Layer.prototype.handle_request;
Layer.prototype.handle_request = function handleRequest(req: unknown, res: unknown, next: (err?: unknown) => void) {
  if (this.handle.length > 3) return original.call(this, req, res, next); // error-handling middleware
  try {
    const result = this.handle(req, res, next);
    if (result && typeof result.catch === 'function') result.catch(next);
  } catch (err) {
    next(err);
  }
};
