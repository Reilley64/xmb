import { useEffect, useRef } from "react";
import { BackHandler, DeviceEventEmitter, Platform } from "react-native";

// Android KeyEvent keyCodes
export const KC = {
	DPAD_UP: 19,
	DPAD_DOWN: 20,
	DPAD_LEFT: 21,
	DPAD_RIGHT: 22,
	DPAD_CENTER: 23,
	ENTER: 66,
	BACK: 4,
	BUTTON_A: 96,
	BUTTON_B: 97,
	BUTTON_X: 99,
	BUTTON_Y: 100,
	BUTTON_L1: 102,
	BUTTON_R1: 103,
	BUTTON_START: 108,
	BUTTON_SELECT: 109,
} as const;

interface ControllerCallbacks {
	onLeft?: () => void;
	onRight?: () => void;
	onUp?: () => void;
	onDown?: () => void;
	onConfirm?: () => void;
	onBack?: () => void;
	onRawKey?: (keyCode: number) => void;
}

export function useControllerInput(callbacks: ControllerCallbacks) {
	const cb = useRef(callbacks);
	cb.current = callbacks;

	// Some Android controllers fire the same keyCode twice in rapid succession
	// before the OS key-repeat delay kicks in.
	const lastFired = useRef<Record<number, number>>({});

	useEffect(() => {
		if (Platform.OS !== "android") return;
		// React 18 Strict Mode double-invokes effects (mount→cleanup→remount).
		// If sub.remove() doesn't fully unsubscribe before the second listener
		// registers, both fire. The `active` flag makes stale listeners no-ops.
		let active = true;
		const sub = DeviceEventEmitter.addListener(
			"GamepadKeyDown",
			({ keyCode }: { keyCode: number }) => {
				if (!active) return;
				const now = Date.now();
				if (now - (lastFired.current[keyCode] ?? 0) < 60) return;
				lastFired.current[keyCode] = now;

				cb.current.onRawKey?.(keyCode);
				switch (keyCode) {
					case KC.DPAD_LEFT:
						cb.current.onLeft?.();
						return;
					case KC.DPAD_RIGHT:
						cb.current.onRight?.();
						return;
					case KC.DPAD_UP:
						cb.current.onUp?.();
						return;
					case KC.DPAD_DOWN:
						cb.current.onDown?.();
						return;
					case KC.DPAD_CENTER:
					case KC.BUTTON_A:
					case KC.ENTER:
						cb.current.onConfirm?.();
						return;
					case KC.BUTTON_B:
					case KC.BACK:
						cb.current.onBack?.();
						return;
				}
			},
		);
		return () => {
			active = false;
			sub.remove();
		};
	}, []);

	useEffect(() => {
		if (Platform.OS !== "android") return;
		const sub = BackHandler.addEventListener("hardwareBackPress", () => {
			if (cb.current.onBack) {
				cb.current.onBack();
				return true;
			}
			return false;
		});
		return () => sub.remove();
	}, []);
}
