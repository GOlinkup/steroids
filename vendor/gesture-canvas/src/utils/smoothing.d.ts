/**
 * Utility for smoothing 2D points using Exponential Moving Average (EMA).
 * This helps reduce jitter in hand tracking coordinates.
 */
export declare class PointSmoother {
    private alpha;
    private lastPoint;
    /**
     * @param alpha Smoothing factor between 0 and 1.
     *              Lower values = more smoothing (slower response).
     *              Higher values = less smoothing (faster response).
     *              Default 0.5 is a good balance.
     */
    constructor(alpha?: number);
    /**
     * Resets the internal state (useful when hand is lost/regained).
     */
    reset(): void;
    /**
     * Smooths a new raw point based on history.
     * @param point The new raw {x, y} coordinate.
     * @returns The smoothed {x, y} coordinate.
     */
    smooth(point: {
        x: number;
        y: number;
    }): {
        x: number;
        y: number;
    };
}
