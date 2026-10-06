/**
 * Utility for smoothing 2D points using Exponential Moving Average (EMA).
 * This helps reduce jitter in hand tracking coordinates.
 */
export class PointSmoother {
    private alpha: number;
    private lastPoint: { x: number, y: number } | null = null;

    /**
     * @param alpha Smoothing factor between 0 and 1.
     *              Lower values = more smoothing (slower response).
     *              Higher values = less smoothing (faster response).
     *              Default 0.5 is a good balance.
     */
    constructor(alpha: number = 0.5) {
        this.alpha = alpha;
    }

    /**
     * Resets the internal state (useful when hand is lost/regained).
     */
    reset() {
        this.lastPoint = null;
    }

    /**
     * Smooths a new raw point based on history.
     * @param point The new raw {x, y} coordinate.
     * @returns The smoothed {x, y} coordinate.
     */
    smooth(point: { x: number, y: number }): { x: number, y: number } {
        if (!this.lastPoint) {
            this.lastPoint = point;
            return point;
        }

        const smoothedX = this.alpha * point.x + (1 - this.alpha) * this.lastPoint.x;
        const smoothedY = this.alpha * point.y + (1 - this.alpha) * this.lastPoint.y;

        this.lastPoint = { x: smoothedX, y: smoothedY };
        return this.lastPoint;
    }
}
