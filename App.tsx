import "./global.css";

import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Xmb } from "@/components/pages/xmb";

export default function App() {
	return (
		<SafeAreaProvider>
			<Xmb />
			<StatusBar style="light" />
		</SafeAreaProvider>
	);
}
