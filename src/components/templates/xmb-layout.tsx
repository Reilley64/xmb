import { useVideoPlayer, VideoView } from "expo-video";
import { type ReactNode, useEffect, useRef } from "react";
import { AppState, StyleSheet, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { COL_W } from "@/components/organisms/menu-list";

const SLIDE = { duration: 200, easing: Easing.out(Easing.cubic) };

interface XmbLayoutProps {
	colIdx: number;
	children: ReactNode;
	overlay?: ReactNode;
}

export function XmbLayout({ colIdx, children, overlay }: XmbLayoutProps) {
	const player = useVideoPlayer(
		require("../../../assets/background.webm"),
		(p) => {
			p.loop = true;
			p.muted = true;
			p.play();
		},
	);

	const appState = useRef(AppState.currentState);
	useEffect(() => {
		const sub = AppState.addEventListener("change", (next) => {
			if (appState.current !== "active" && next === "active") player.play();
			appState.current = next;
		});
		return () => sub.remove();
	}, [player]);

	const focusAnim = useSharedValue(colIdx);
	useEffect(() => {
		focusAnim.value = withTiming(colIdx, SLIDE);
	}, [colIdx, focusAnim]);

	const rowScrollStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: -focusAnim.value * COL_W }],
	}));

	return (
		<View className="flex-1">
			<VideoView
				player={player}
				style={StyleSheet.absoluteFill}
				contentFit="cover"
				nativeControls={false}
			/>
			<Animated.View
				className="flex-1 flex-row pl-[20vw]"
				style={rowScrollStyle}
			>
				{children}
			</Animated.View>
			{overlay}
		</View>
	);
}
