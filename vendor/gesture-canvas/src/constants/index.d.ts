export declare const DEFAULT_CAMERA_SETTINGS: {
    width: number;
    height: number;
    facingMode: "user";
    frameRate: number;
};
export declare const DRAWING_TOOLS: {
    PEN: {
        name: string;
        icon: string;
        color: string;
        size: number;
    };
    BRUSH: {
        name: string;
        icon: string;
        color: string;
        size: number;
    };
    ERASER: {
        name: string;
        icon: string;
        color: string;
        size: number;
    };
};
export declare const GESTURES: {
    DRAW: {
        name: string;
        description: string;
        action: () => void;
    };
    ERASE: {
        name: string;
        description: string;
        action: () => void;
    };
    CLEAR: {
        name: string;
        description: string;
        action: () => void;
    };
};
