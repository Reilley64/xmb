import { Image, type ImageSourcePropType, Text, View } from "react-native";

interface ColumnIconProps {
	icon: ImageSourcePropType;
	isSelected?: boolean;
	title?: string;
}

export function ColumnIcon({ icon, isSelected, title }: ColumnIconProps) {
	return (
		<View className="aspect-video items-center justify-center">
			<View
				className="scale-[0.75] items-center justify-center opacity-50 data-selected:scale-[1] data-selected:opacity-100"
				{...{ dataSet: { selected: isSelected } }}
			>
				<Image source={icon} className="size-28" />
				<Text className="-mt-5 text-center text-sm text-white tracking-wide">
					{title}
				</Text>
			</View>
		</View>
	);
}
