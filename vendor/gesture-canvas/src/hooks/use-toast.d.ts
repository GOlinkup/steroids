import * as React from "react";
type ToasterToast = {
    id: string;
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
    variant?: "default" | "destructive";
};
declare const actionTypes: {
    readonly ADD_TOAST: "ADD_TOAST";
    readonly UPDATE_TOAST: "UPDATE_TOAST";
    readonly DISMISS_TOAST: "DISMISS_TOAST";
    readonly REMOVE_TOAST: "REMOVE_TOAST";
};
type ActionType = typeof actionTypes;
type Action = {
    type: ActionType["ADD_TOAST"];
    toast: ToasterToast;
} | {
    type: ActionType["UPDATE_TOAST"];
    toast: Partial<ToasterToast>;
} | {
    type: ActionType["DISMISS_TOAST"];
    toastId?: string;
} | {
    type: ActionType["REMOVE_TOAST"];
    toastId?: string;
};
interface State {
    toasts: ToasterToast[];
}
export declare const reducer: (state: State, action: Action) => State;
type Toast = Omit<ToasterToast, "id">;
declare function toast(props: Toast): {
    id: string;
    dismiss: () => void;
    update: (props: Toast) => void;
};
declare function useToast(): {
    toast: typeof toast;
    dismiss: (toastId?: string) => void;
    toasts: ToasterToast[];
};
export { useToast, toast };
