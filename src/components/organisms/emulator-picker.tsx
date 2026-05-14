import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useControllerInput } from "@/hooks/useControllerInput";
import type { LaunchIntent } from "@/services/launcher";

interface Props {
	intents: LaunchIntent[];
	onSelect: (intent: LaunchIntent) => void;
	onCancel: () => void;
}

export function EmulatorPicker({ intents, onSelect, onCancel }: Props) {
	const [focusIdx, setFocusIdx] = useState(0);
	const slideX = useSharedValue(60);

	useEffect(() => {
		slideX.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
	}, [slideX]);

	useControllerInput({
		onUp: () => setFocusIdx((i) => Math.max(0, i - 1)),
		onDown: () => setFocusIdx((i) => Math.min(intents.length - 1, i + 1)),
		onConfirm: () => onSelect(intents[focusIdx]),
		onBack: onCancel,
	});

	const animStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: slideX.value }],
	}));

	return (
		<View className="absolute inset-0" pointerEvents="box-none">
			<LinearGradient
				colors={["transparent", "rgba(0,0,0,0.55)"]}
				start={{ x: 0, y: 0 }}
				end={{ x: 1, y: 0 }}
				className="absolute top-0 bottom-0"
				style={{ left: "45%", right: 0 }}
				pointerEvents="none"
			/>
			<Animated.View
				className="absolute top-0 bottom-0 justify-center border-white/25 border-l pl-3"
				style={[animStyle, { left: "68%" }]}
			>
				{intents.map((intent, i) => (
					<TouchableOpacity key={intent.label} onPress={() => onSelect(intent)}>
						<Text
							className="py-0.5 text-sm text-white opacity-60 data-focused:font-bold data-focused:opacity-100"
							{...{ dataSet: { focused: i === focusIdx } }}
						>
							{intent.label}
						</Text>
					</TouchableOpacity>
				))}
			</Animated.View>
		</View>
	);
}
