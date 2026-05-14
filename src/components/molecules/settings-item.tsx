import { MenuItem, type MenuItemProps } from "@/components/atoms/menu-item";

export type SettingsItemProps = MenuItemProps;

export function SettingsItem(props: SettingsItemProps) {
	return (
		<MenuItem
			{...props}
			image={props.image ?? require("../../../assets/settings.webp")}
		/>
	);
}
