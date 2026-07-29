import { HttpException } from "@nestjs/common";

/** Consistent error response shape returned by the API. */
export interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

export function envelope(code: string, message: string, details?: unknown): ErrorEnvelope {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ErrorEnvelope).error === "object"
  );
}

/** Human-friendly, non-leaky messages for typed domain rejection reasons. */
const MESSAGES: Record<string, string> = {
  INVALID_INPUT: "Validation failed.",
  INVALID_CREDENTIALS: "Incorrect email or password.",
  REGISTRATION_FAILED: "Registration failed.",
  RATE_LIMITED: "Too many requests. Please slow down.",
  AUCTION_NOT_FOUND: "Auction not found.",
  NOT_FOUND: "Not found.",
  GEM_NOT_FOUND: "Gem not found.",
  FORBIDDEN: "You are not allowed to do that.",
  NOT_GEM_OWNER: "You are not allowed to do that.",
  BID_TOO_LOW: "Your bid is too low.",
  AUCTION_NOT_STARTED: "This auction has not started yet.",
  AUCTION_ENDED: "This auction has ended.",
  AUCTION_NOT_ACTIVE: "This auction is not active.",
  SELF_BID_FORBIDDEN: "You cannot bid on your own gem.",
  ALREADY_HIGHEST_BIDDER: "You are already the highest bidder.",
  AUCTION_ALREADY_EXISTS: "This gem already has an active auction.",
  AUCTION_HAS_BIDS: "This auction already has bids.",
  AUCTION_NOT_CANCELABLE: "This auction can no longer be canceled.",
  GEM_NOT_ACTIVE: "The gem must be published first.",
  GEM_NOT_EDITABLE: "This gem can no longer be changed.",
  GEM_NOT_DRAFT: "This gem is not a draft.",
  POSTING_FEE_REQUIRED: "A posting fee is required to publish this listing.",
  START_IN_PAST: "The auction start time must be in the future.",
  RESERVE_BELOW_START: "Reserve price cannot be below the start price.",
  RESET_LINK_INVALID: "This password reset link is invalid or has expired.",
  UNSUPPORTED_MEDIA_TYPE: "That file type is not allowed.",
  FILE_TOO_LARGE: "That file is too large.",
  MEDIA_LIMIT_REACHED: "You have reached the media limit for this gem.",
  UNAUTHORIZED: "Authentication required.",
  MISSING_TOKEN: "Authentication required.",
  INVALID_TOKEN: "Your session is invalid.",
  TOKEN_EXPIRED: "Your session has expired.",
  TOKEN_REUSE_DETECTED: "Your session is invalid.",
  USER_NOT_FOUND: "Your session is invalid.",
};

/** HTTP status for each typed rejection reason. Defaults to 400. */
const STATUS: Record<string, number> = {
  INVALID_INPUT: 400,
  REGISTRATION_FAILED: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  MISSING_TOKEN: 401,
  INVALID_TOKEN: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_REUSE_DETECTED: 401,
  USER_NOT_FOUND: 401,
  FORBIDDEN: 403,
  NOT_GEM_OWNER: 403,
  SELF_BID_FORBIDDEN: 403,
  ALREADY_HIGHEST_BIDDER: 403,
  NOT_FOUND: 404,
  AUCTION_NOT_FOUND: 404,
  GEM_NOT_FOUND: 404,
  BID_TOO_LOW: 409,
  AUCTION_NOT_STARTED: 409,
  AUCTION_ENDED: 409,
  AUCTION_NOT_ACTIVE: 409,
  AUCTION_ALREADY_EXISTS: 409,
  AUCTION_HAS_BIDS: 409,
  AUCTION_NOT_CANCELABLE: 409,
  GEM_NOT_ACTIVE: 409,
  GEM_NOT_EDITABLE: 409,
  GEM_NOT_DRAFT: 409,
  START_IN_PAST: 409,
  RESERVE_BELOW_START: 409,
  RESET_LINK_INVALID: 400,
  UNSUPPORTED_MEDIA_TYPE: 415,
  FILE_TOO_LARGE: 413,
  MEDIA_LIMIT_REACHED: 409,
  POSTING_FEE_REQUIRED: 402,
  RATE_LIMITED: 429,
};

/** Build an HttpException with the enveloped body for a typed rejection reason. */
export function httpForReason(reason: string, details?: unknown): HttpException {
  const status = STATUS[reason] ?? 400;
  const message = MESSAGES[reason] ?? "Request failed.";
  return new HttpException(envelope(reason, message, details), status);
}
