import Roact from "@rbxts/roact";
import { Dispatch, SetStateAction, useEffect, useState, withHookDetection, useMemo } from "@rbxts/roact-hooked";
import {
	Button,
	CheckBox,
	ChildWindow,
	Collapsable,
	ColorPicker,
	DummyWindow,
	InLine,
	IntSlider,
	Label,
	LabelFont,
	MarginLeftAbsolute,
	MarginUp,
	RenderPopup,
	RenderWindowRoact,
	RootContext,
	SelectList,
	Selectable,
	Separator,
	TabMenu,
	TabMenuChild,
	TextBox,
	getElementById,
} from "./RenderWindowRoact";
import { UserInputService } from "@rbxts/services";
import Object from "@rbxts/object-utils";
import Sift from "@rbxts/sift";
import luaparse from "luaparse";
import { renderAst } from "renderer/astRenderer";

const cache = new Map<string, string>();
const requestWithCache = (url: string) => {
	if (cache.has(url)) {
		return cache.get(url)!;
	}

	const response = syn.request({ Url: url }).Body;
	cache.set(url, response);
	return response;
};

let roactInstance: Roact.Tree;

type ColorsTheme = {
	[color: string]: {
		Colour: Color3;
		Alpha: number;
	};
};

type StyleTheme = {
	[color: string]: Vector2 | number;
};

const getTheme = (themeName: string) => {
	const [colors, theme] = loadstring(
		requestWithCache(
			`https://raw.githubusercontent.com/aladdin7127/RenderStyles/main/ThemeManager/Themes/${themeName}.lua`,
		),
	)() as LuaTuple<[ColorsTheme, StyleTheme]>;

	const themeColors: [colorStyle: RenderColorOption, color: Color3, alpha: number][] = [];
	const themeStyle: [renderStyle: RenderStyleOption, value: number | Vector2][] = [];

	for (const [key, value] of pairs(colors)) {
		themeColors.push([
			(
				RenderColorOption as unknown as {
					[key: string]: number;
				}
			)[key as string],
			value.Colour,
			value.Alpha,
		]);
	}

	for (const [key, value] of pairs(theme)) {
		themeStyle.push([
			(
				RenderStyleOption as unknown as {
					[key: string]: number;
				}
			)[key as string],
			value,
		]);
	}
	return [themeColors, themeStyle] as const;
};

const ThemeList = loadstring(
	syn.request({ Url: "https://raw.githubusercontent.com/aladdin7127/RenderStyles/main/ThemeManager/ThemeList.lua" })
		.Body,
)() as string[];

const getFullPath = (instance: Instance, head?: string): string => {
	if (instance.Parent === undefined) {
		return head ?? instance.Name;
	}

	if (head === undefined) head = instance.Name;

	return getFullPath(instance.Parent, `${instance.Parent.Name}.${head}`);
};

const App = () => {
	const [theme, setTheme] = useState(ThemeList[0]);
	const [windowColors, windowStyle] = useMemo(() => getTheme(theme), [theme]);
	const [count, setCount] = useState(500000);

	return (
		<RenderWindowRoact
			name={`Testme2`}
			onTop={true}
			style={windowStyle}
			color={windowColors}
			id="4RemoteSpy"
			//fullRerender={true}
		>
			<Label text="Demo text" />
			<Button
				text="Close"
				onClick={() => {
					Roact.unmount(roactInstance);
				}}
			/>
			<SelectList
				items={ThemeList}
				onSelect={(index) => {
					setTheme(ThemeList[index - 1]);
				}}
				text="Select Theme"
			/>

			<DummyWindow style={[[RenderStyleOption.ItemSpacing, new Vector2(0, 0)]]}>
				{new Array(math.ceil(count / 800), "").map((_, i) => (
					<InLine>
						{new Array((i + 1) * 800 > count ? count % 800 : 800, "").map(() => (
							<ChildWindow
								size={new Vector2(1, 1)}
								color={[
									[
										RenderColorOption.ChildBg,
										new Color3(math.random(), math.random(), math.random()),
										1,
									],
								]}
							/>
						))}
					</InLine>
				))}
			</DummyWindow>
		</RenderWindowRoact>
	);
};

export function Ui() {
	withHookDetection(Roact);
	roactInstance = Roact.mount(<App />);
}
