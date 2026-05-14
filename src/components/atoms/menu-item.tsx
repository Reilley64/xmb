import { useEffect } from "react";
import { Image, type ImageSourcePropType, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export const ITEM_H = 36;
const ICON_W_MIN = 52;
const ICON_W_MAX = 110;
const PADDING_V = 8;
const SELECTED_H = PADDING_V * 2 + Math.round(ICON_W_MAX * (9 / 16));
const DUR = { duration: 150 };

export type MenuItemProps = {
  image?: ImageSourcePropType;
  isSelected?: boolean;
  onConfirm?: () => void;
  title?: string;
};

export function MenuItem(props: MenuItemProps) {
  const progress = useSharedValue(props.isSelected ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(props.isSelected ? 1 : 0, DUR);
  }, [props.isSelected, progress]);

  const iconStyle = useAnimatedStyle(() => {
    const w = ICON_W_MIN + progress.value * (ICON_W_MAX - ICON_W_MIN);
    return {
      opacity: 0.35 + progress.value * 0.65,
      width: w,
      height: w * (9 / 16),
    };
  });

  const textStyle = useAnimatedStyle(() => ({
    fontSize: 11 + progress.value * 3,
    opacity: 0.45 + progress.value * 0.55,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    height: ITEM_H + progress.value * (SELECTED_H - ITEM_H),
    paddingVertical: progress.value * PADDING_V,
    overflow: "hidden",
  }));

  return (
    <Animated.View className="flex-row items-center" style={containerStyle}>
      {/* Width matches COL_W (120) so icon centers align with the console icon above */}
      <View style={{ width: 120 }} className="items-center justify-center">
        <Animated.View className="items-center justify-center" style={iconStyle}>
          <Image source={props.image} className="size-full" resizeMode="contain" />
        </Animated.View>
      </View>

      <Animated.Text className="text-white" style={textStyle} numberOfLines={1}>
        {props.title}
      </Animated.Text>
    </Animated.View>
  );
}
