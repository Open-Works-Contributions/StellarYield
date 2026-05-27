/**
 * Shared cursor-based pagination contract for StellarYield list endpoints.
 *
 * ## Query parameters
 * - `cursor`  — opaque string token returned in a previous response's `nextCursor`.
 *              Pass `cursor=<value>` to fetch the next page.
 *              Omit (or pass an empty string) for the first page.
 * - `limit`   — number of items to return per page (default: 20, max: 100).
 *
 * ## Response shape
 * Every paginated endpoint returns `PaginatedResponse<T>`:
 *   {
 *     "data": [...],
 *     "pagination": {
 *       "nextCursor": "some-opaque-string" | null,
 *       "hasMore": true | false,
 *       "limit": 20
 *     }
 *   }
 *
 * A `nextCursor` of `null` means there are no more pages.
 * Clients should stop paginating when `hasMore === false`.
 */

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    /** Cursor to pass as `?cursor=` on the next request. `null` when no more pages. */
    nextCursor: string | null;
    /** `true` if another page exists after this one. */
    hasMore: boolean;
    /** Effective limit used for this page. */
    limit: number;
  };
}

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

/**
 * Parse and clamp `limit` from a query string value.
 * Returns `PAGINATION_DEFAULT_LIMIT` when the value is absent or invalid.
 */
export function parsePaginationLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return PAGINATION_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), PAGINATION_MAX_LIMIT);
}
