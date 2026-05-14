import {
	Children,
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
	useRef,
	useState,
} from "react";
import {
	Dimensions,
	type ImageSourcePropType,
	View,
} from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { ITEM_H } from "@/components/atoms/menu-item";
import { ColumnIcon } from "@/components/molecules/column-icon";
import { useControllerInput } from "@/hooks/useControllerInput";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");
export const COL_W = 120;
const ABOVE_H = Math.round(SCREEN_H * 0.2);
const SLIDE = { duration: 200, easing: Easing.out(Easing.cubic) };
const ICON_GAP = 20;
const ICON_H = Math.round(COL_W * (9 / 16)); // aspect-video height at COL_W width

export interface MenuListProps {
	children: ReactNode;
	icon: ImageSourcePropType;
	isSelected?: boolean;
	isNavigable?: boolean;
	title?: string;
}

export function MenuList(props: MenuListProps) {
	const [row, setRow] = useState(0);
	const rowRef = useRef(0);
	const rowAnim = useSharedValue(0);
	const count = Children.count(props.children);
	const children = Children.toArray(props.children);
	const selectedChild = children[row];
	const selectedConfirm = isValidElement(selectedChild)
		? (selectedChild.props as { onConfirm?: () => void }).onConfirm
		: undefined;

	function navigate(delta: -1 | 1) {
		const next = Math.max(0, Math.min(count - 1, rowRef.current + delta));
		if (next === rowRef.current) return;
		rowRef.current = next;
		setRow(next);
		rowAnim.value = withTiming(next, SLIDE);
	}

	const navigable = props.isSelected && props.isNavigable !== false;
	useControllerInput({
		onUp: navigable ? () => navigate(-1) : undefined,
		onDown: navigable ? () => navigate(1) : undefined,
		onConfirm: navigable ? selectedConfirm : undefined,
	});

	function withSelected(child: ReactNode, isSelected: boolean) {
		return isValidElement(child)
			? cloneElement(child as ReactElement<{ isSelected?: boolean }>, { isSelected })
			: child;
	}

	// Translate so the item[row-1] sits at the bottom of the above area.
	// At row=0 all items are pushed below the clip boundary — nothing shows.
	const aboveStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: ABOVE_H - rowAnim.value * ITEM_H }],
	}));

	// Translate so the item[row] sits at y=0 (top of the below clip window).
	// Items before selected land at negative y and are clipped.
	const belowStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: -rowAnim.value * ITEM_H }],
	}));

	return (
		<View style={{ width: COL_W }}>
			{/* Spacer holds the icon in position — above items render absolutely */}
			<View style={{ height: ABOVE_H }} />

			{/* Items that have scrolled past the icon — absolute so text isn't clipped to COL_W */}
			{props.isSelected && (
				<View
					className="absolute top-0 left-0 overflow-hidden"
					style={{
						height: ABOVE_H,
						width: SCREEN_W,
					}}
				>
					<Animated.View style={aboveStyle}>
						{Children.map(props.children, (child) =>
							withSelected(child, false),
						)}
					</Animated.View>
				</View>
			)}

			{/* Column icon — sits between the two scroll regions */}
			<ColumnIcon icon={props.icon} isSelected={props.isSelected} title={props.title} />

			{/* Selected item and everything below — absolute so it doesn't affect column width */}
			{props.isSelected && (
				<View
					className="absolute left-0 overflow-hidden"
					style={{
						top: ABOVE_H + ICON_H + ICON_GAP,
						height: SCREEN_H,
						width: SCREEN_W,
					}}
				>
					<Animated.View style={belowStyle}>
						{Children.map(props.children, (child, i) =>
							withSelected(child, i === row),
						)}
					</Animated.View>
				</View>
			)}
		</View>
	);
}
