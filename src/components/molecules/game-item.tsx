import { MenuItem, type MenuItemProps } from "@/components/atoms/menu-item";

export type GameItemProps = MenuItemProps;

export function GameItem(props: GameItemProps) {
	return (
		<MenuItem
			{...props}
			image={props.image ?? require("../../../assets/games/default.webp")}
		/>
	);
}
