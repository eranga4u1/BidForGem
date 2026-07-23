export { loadAuthConfig, type AuthConfig, type Argon2Params } from "./config.js";
export {
  createAuthService,
  type AuthService,
  type AuthServiceDeps,
  type RequestContext,
  type RegisterResult,
  type LoginResult,
  type RefreshResult,
  type UpdateProfileResult,
} from "./auth-service.js";
export {
  authenticate,
  extractBearerToken,
  type AuthenticateResult,
  type GuardDeps,
} from "./guard.js";
export {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  type AccessTokenClaims,
} from "./tokens.js";
export { hashPassword, verifyPassword } from "./password.js";
export { createInMemoryRateLimiter, type RateLimiter } from "./rate-limit.js";
export { toPublicUser } from "./mappers.js";
