export class HttpStatusError extends Error {
    constructor(status) {
        super(`HTTP ${status}`);
        this.status = status;
    }
}

// A missing individual box score is an explicit coverage gap, not an outage.
// Authentication, rate limits, server failures and malformed data still fail.
export const isUnpublishedBoxScore = error => error instanceof HttpStatusError && error.status === 404;

export function unavailableBoxScore(match, now) {
    const delay = match.status === 'live' ? 15 * 60000 : 6 * 3600000;
    return {
        status: match.status,
        httpStatus: 404,
        reason: 'The source has not published this box score',
        checkedAt: now.toISOString(),
        nextRetryAt: new Date(now.getTime() + delay).toISOString()
    };
}

export function shouldRetryBoxScore(match, unavailable, now, refresh = false) {
    return refresh || !unavailable || unavailable.status !== match.status ||
        !Number.isFinite(Date.parse(unavailable.nextRetryAt)) || Date.parse(unavailable.nextRetryAt) <= now.getTime();
}
