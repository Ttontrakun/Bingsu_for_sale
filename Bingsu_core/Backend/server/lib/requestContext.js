/**
 * Extract request context (IP, etc.) for logging and rate limiting.
 */
export function getRequestContext(req) {
  // Prefer Express-derived req.ip to avoid trusting spoofed raw forwarding headers.
  const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress;
  return { ip };
}
