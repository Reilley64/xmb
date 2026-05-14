import { MenuItem, type MenuItemProps } from "@/components/atoms/menu-item";

export type GameItemProps = MenuItemProps;
export type SettingsItemProps = MenuItemProps;

export function GameItem(props: GameItemProps) {
	return (
		<MenuItem
			{...props}
			image={props.image ?? require("../../../assets/games/default.webp")}
		/>
	);
}

export function SettingsItem(props: SettingsItemProps) {
	return (
		<MenuItem
			{...props}
			image={props.image ?? require("../../../assets/settings.webp")}
		/>
	);
}
