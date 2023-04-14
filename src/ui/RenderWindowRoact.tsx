import Roact from "@rbxts/roact";
import { markPureComponent, useEffect, useState, withHooks, withHooksPure } from "@rbxts/roact-hooked";
import { Players } from "@rbxts/services";

interface RootContext {
	window: RenderChildBase;
	reRender: () => void;
	beforeReRender: SynSignal;
	connections: Map<string, SynConnection>;
	externalComponentData: Map<string, unknown>;
	generatedId: () => string;
}

const components = new Map<string, RenderObject>();

export const getElementById = (id: string) => {
	return components.get(id);
};

export const RootContext = Roact.createContext({} as RootContext);

export const Button = ({
	text,
	onClick,
	id,
	size,
	visible,
}: {
	text: string;
	onClick?: Callback;
	size?: Vector2;
	visible?: boolean;
	id?: string;
}) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, generatedId }) => {
				reRender();
				if (!id) id = generatedId();
				if (!components.has(id)) {
					components.set(id, window.Button());
				}
				const button = components.get(id)! as RenderButton;

				button.Label = text;
				size !== undefined && (button.Size = size);
				visible !== undefined && (button.Visible = visible);
				if (connections.has(id)) connections.get(id)!.Disconnect();
				if (onClick) connections.set(id, button.OnUpdated.Connect(onClick));

				return <></>;
			}}
		/>
	);
};

export const CheckBox = ({
	text,
	onToggle,
	id,
	visible,
	defaultValue = false,
}: {
	text: string;
	onToggle?: (toggled: boolean) => void;
	visible?: boolean;
	id?: string;
	defaultValue?: boolean;
}) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, generatedId }) => {
				if (!id) id = generatedId();
				const value = (externalComponentData.get(id) as boolean | undefined) ?? defaultValue;
				reRender();
				if (!components.has(id)) {
					components.set(id, window.CheckBox());
				}
				const checkBox = components.get(id)! as RenderCheckBox;

				checkBox.Label = text;
				visible !== undefined && (checkBox.Visible = visible);
				checkBox.Value = value;
				if (connections.has(id)) connections.get(id)!.Disconnect();
				connections.set(
					id,
					checkBox.OnUpdated.Connect(() => {
						externalComponentData.set(id!, checkBox.Value);
						onToggle && onToggle(checkBox.Value);
					}),
				);

				return <></>;
			}}
		/>
	);
};

export const ColorPicker = ({
	text,
	onChange,
	onChangeEnd,
	alpha,
	useAlpha,
	returnInt,
	id,
	visible,
	defaultColor,
	onChangeEndDelay = 0.5,
}: {
	text: string;
	onChange?: (r: number, g: number, b: number, a?: number) => void;
	onChangeEnd?: (r: number, g: number, b: number, a?: number) => void;
	defaultColor: Color3;
	alpha?: number;
	useAlpha?: boolean;
	returnInt?: boolean;
	visible?: boolean;
	id?: string;
	defaultValue?: boolean;
	onChangeEndDelay?: number;
}) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, beforeReRender, connections, externalComponentData, generatedId }) => {
				if (!id) id = generatedId();
				const color = (externalComponentData.get(id) as Color3 | undefined) ?? defaultColor;
				reRender();
				if (!components.has(id)) {
					components.set(id, window.ColorPicker());
				}
				const colorPicker = components.get(id)! as RenderColorPicker;

				colorPicker.Label = text;
				visible !== undefined && (colorPicker.Visible = visible);
				colorPicker.Color = color;
				alpha !== undefined && (colorPicker.Alpha = alpha);
				useAlpha !== undefined && (colorPicker.UseAlpha = useAlpha);
				returnInt !== undefined && (colorPicker.ReturnInt = returnInt);
				if (connections.has(id)) connections.get(id)!.Disconnect();
				let delayThread: thread | undefined;
				connections.set(
					id,
					colorPicker.OnUpdated.Connect((r, g, b, a) => {
						externalComponentData.set(id!, colorPicker.Color);
						delayThread && task.cancel(delayThread);
						if (onChangeEnd)
							delayThread = task.delay(onChangeEndDelay, () => {
								onChangeEnd && onChangeEnd(r, g, b, a);
							});

						onChange && onChange(r, g, b, a);
					}),
				);

				return <></>;
			}}
		/>
	);
};

export const ColorButton = ({
	description,
	onClick,
	id,
	size,
	visible,
	color,
	alpha,
}: {
	description: string;
	onClick?: Callback;
	size?: Vector2;
	visible?: boolean;
	id?: string;
	color: Color3;
	alpha?: number;
}) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, generatedId }) => {
				if (!id) id = generatedId();
				reRender();
				if (!components.has(id)) {
					components.set(id, window.ColorButton());
				}
				const colorButton = components.get(id)! as RenderColorButton;

				colorButton.Description = description;
				size !== undefined && (colorButton.Size = size);
				visible !== undefined && (colorButton.Visible = visible);
				colorButton.Color = color;
				alpha !== undefined && (colorButton.Alpha = alpha);
				if (connections.has(id)) connections.get(id)!.Disconnect();
				if (onClick) connections.set(id, colorButton.OnUpdated.Connect(onClick));

				return <></>;
			}}
		/>
	);
};

export const SelectList = ({
	text,
	id,
	visible,
	items,
	onSelect,
	defaultSelected = 1,
}: {
	text: string;
	visible?: boolean;
	id?: string;
	items: string[];
	onSelect?: (index: number) => void;
	defaultSelected?: number;
}) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, generatedId }) => {
				if (!id) id = generatedId();
				const selectedItem = (externalComponentData.get(id) as number | undefined) ?? defaultSelected;
				reRender();
				if (!components.has(id)) {
					components.set(id, window.Combo());
				}
				const selectList = components.get(id)! as RenderCombo;

				selectList.Label = text;
				selectList.SelectedItem = selectedItem;
				visible !== undefined && (selectList.Visible = visible);
				selectList.Items = items;
				if (connections.has(id)) connections.get(id)!.Disconnect();
				if (onSelect)
					connections.set(
						id,
						selectList.OnUpdated.Connect((selectedItem) => {
							externalComponentData.set(id!, selectedItem);
							onSelect(selectedItem);
						}),
					);

				return <></>;
			}}
		/>
	);
};

export const TextBox = ({
	text,
	onChange,
	maxLength,
	id,
	visible,
	defaultValue,
}: {
	text: string;
	onChange?: (text: string) => void;
	visible?: boolean;
	id?: string;
	defaultValue?: string;
	maxLength?: number;
}) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, generatedId }) => {
				if (!id) id = generatedId();
				const value = (externalComponentData.get(id) as string) || defaultValue || "";
				reRender();
				if (!components.has(id)) {
					components.set(id, window.TextBox());
				}
				const textBox = components.get(id)! as RenderTextBox;

				textBox.Label = text;
				visible !== undefined && (textBox.Visible = visible);
				textBox.Value = value;
				maxLength !== undefined && (textBox.MaxTextLength = maxLength);
				if (connections.has(id)) connections.get(id)!.Disconnect();
				connections.set(
					id,
					textBox.OnUpdated.Connect(() => {
						externalComponentData.set(id!, textBox.Value);
						onChange && onChange(textBox.Value);
					}),
				);

				return <></>;
			}}
		/>
	);
};

export const Slider = ({
	text,
	id,
	visible,
	min,
	max,
	defaultValue,
	clamped,
	onChange,
}: {
	text: string;
	visible?: boolean;
	id?: string;
	min: number;
	max: number;
	defaultValue?: number;
	clamped?: boolean;
	onChange?: (value: number) => void;
}) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, generatedId }) => {
				if (!id) id = generatedId();
				const value = (externalComponentData.get(id) as number | undefined) || defaultValue;
				reRender();
				if (!components.has(id)) {
					components.set(id, window.Slider());
				}
				const slider = components.get(id)! as RenderSlider;

				slider.Label = text;
				visible !== undefined && (slider.Visible = visible);
				slider.Min = min;
				slider.Max = max;
				value && (slider.Value = value);
				clamped !== undefined && (slider.Clamped = clamped);
				if (connections.has(id)) connections.get(id)!.Disconnect();
				if (onChange)
					connections.set(
						id,
						slider.OnUpdated.Connect((value) => {
							externalComponentData.set(id!, value);
							onChange(value);
						}),
					);

				return <></>;
			}}
		/>
	);
};

export const IntSlider = ({
	text,
	id,
	visible,
	min,
	max,
	defaultValue,
	clamped,
	onChange,
}: {
	text: string;
	visible?: boolean;
	id?: string;
	min: number;
	max: number;
	defaultValue?: number;
	clamped?: boolean;
	onChange?: (value: number) => void;
}) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, generatedId }) => {
				if (!id) id = generatedId();
				const value = (externalComponentData.get(id) as number | undefined) || defaultValue;
				reRender();
				if (!components.has(id)) {
					components.set(id, window.IntSlider());
				}
				const intSlider = components.get(id)! as RenderIntSlider;

				intSlider.Label = text;
				visible !== undefined && (intSlider.Visible = visible);
				intSlider.Min = min;
				intSlider.Max = max;
				value && (intSlider.Value = value);
				clamped !== undefined && (intSlider.Clamped = clamped);
				if (connections.has(id)) connections.get(id)!.Disconnect();
				if (onChange)
					connections.set(
						id,
						intSlider.OnUpdated.Connect((value) => {
							externalComponentData.set(id!, value);
							onChange(value);
						}),
					);

				return <></>;
			}}
		/>
	);
};

export const Selectable = ({
	text,
	id,
	visible,
	size,
	onToggle,
	toggles,
	defaultValue = false,
}: {
	text: string;
	visible?: boolean;
	id?: string;
	size?: Vector2;
	onToggle?: (value: boolean) => void;
	toggles?: boolean;
	defaultValue?: boolean;
}) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, generatedId }) => {
				if (!id) id = generatedId();
				const value = (externalComponentData.get(id) as boolean | undefined) ?? defaultValue;
				reRender();
				if (!components.has(id)) {
					components.set(id, window.Selectable());
				}
				const selectable = components.get(id)! as RenderSelectable;

				selectable.Label = text;
				selectable.Value = value;
				visible !== undefined && (selectable.Visible = visible);
				size && (selectable.Size = size);
				toggles !== undefined && (selectable.Toggles = toggles);
				if (connections.has(id)) connections.get(id)!.Disconnect();
				if (onToggle)
					connections.set(
						id,
						selectable.OnUpdated.Connect((newValue) => {
							externalComponentData.set(id!, newValue);
							onToggle(newValue);
						}),
					);

				return <></>;
			}}
		/>
	);
};

export const Separator = ({ id, visible }: { visible?: boolean; id?: string }) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, generatedId }) => {
				if (!id) id = generatedId();
				reRender();
				if (!components.has(id)) {
					components.set(id, window.Separator());
				}
				const separator = components.get(id)! as RenderLabel;

				visible !== undefined && (separator.Visible = visible);

				return <></>;
			}}
		/>
	);
};

interface TabMenuChildProps {
	tabName: string;
	id?: string;
}

export const TabMenuChild: Roact.FunctionComponent<TabMenuChildProps> = (props) => {
	return <>{props[Roact.Children]}</>;
};

interface TabMenuProps {
	visible?: boolean;
	id?: string;
	tabStyle?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	tabColor?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
	style?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	color?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
	defaultSelected?: number;
}

export const TabMenu: Roact.FunctionComponent<TabMenuProps> = (props) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, generatedId, connections, externalComponentData, beforeReRender }) => {
				if (!props.id) props.id = generatedId();
				const selectedItem =
					(externalComponentData.get(props.id) as number | undefined) ?? props.defaultSelected;
				reRender();
				if (!components.has(props.id)) {
					components.set(props.id, window.TabMenu());
				}
				const tabMenu = components.get(props.id)! as RenderTabMenu;

				props.visible !== undefined && (tabMenu.Visible = props.visible);
				props.tabStyle &&
					props.tabStyle.forEach(([renderStyle, value]) => tabMenu.SetTabStyle(renderStyle, value));
				props.tabColor &&
					props.tabColor.forEach(([colorStyle, color, alpha]) =>
						tabMenu.SetTabColor(colorStyle, color, alpha),
					);
				props.style && props.style.forEach(([renderStyle, value]) => tabMenu.SetStyle(renderStyle, value));
				props.color &&
					props.color.forEach(([colorStyle, color, alpha]) => tabMenu.SetColor(colorStyle, color, alpha));
				selectedItem && (tabMenu.SelectedItem = selectedItem);

				interface TabChild {
					props: TabMenuChildProps & {
						[Roact.Children]?: Roact.Element[];
					};
					component: Roact.ComponentConstructor<TabMenuChildProps>;
				}

				props[Roact.Children]?.forEach((child) => {
					if ((child as TabChild).props.tabName) {
						if (!(child as TabChild).props.id) (child as TabChild).props.id = generatedId();
						const tab = tabMenu.Add((child as TabChild).props.tabName);
						const newValues = {
							window: tab,
							reRender: reRender,
							beforeReRender: beforeReRender,
							connections: connections,
							externalComponentData: externalComponentData,
							generatedId: generatedId,
						};

						Roact.mount(
							<RootContext.Provider value={newValues}>
								{(child as TabChild).props[Roact.Children]}
							</RootContext.Provider>,
						);

						components.set((child as TabChild).props.id!, tab);
					}
				});

				//print("ReRender");

				// TODO: add OnUpdated, When I tested it freaked out and crashed

				return <></>;
			}}
		/>
	);
};

interface InLineProps {
	visible?: boolean;
	id?: string;
	style?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	color?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
}

export const InLine: Roact.FunctionComponent<InLineProps> = (props) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, generatedId, connections, externalComponentData, beforeReRender }) => {
				if (!props.id) props.id = generatedId();
				reRender();
				if (!components.has(props.id)) {
					components.set(props.id, window.SameLine());
				}
				const sameLine = components.get(props.id)! as RenderSameLine;

				props.visible !== undefined && (sameLine.Visible = props.visible);
				props.style && props.style.forEach(([renderStyle, value]) => sameLine.SetStyle(renderStyle, value));
				props.color &&
					props.color.forEach(([colorStyle, color, alpha]) => sameLine.SetColor(colorStyle, color, alpha));

				const newValues = {
					window: sameLine,
					reRender: reRender,
					beforeReRender: beforeReRender,
					connections: connections,
					externalComponentData: externalComponentData,
					generatedId: generatedId,
				};

				//print(Roact.Children);

				Roact.mount(<RootContext.Provider value={newValues}>{props[Roact.Children]}</RootContext.Provider>);

				return <></>;
			}}
		/>
	);
};

interface LabelFontProps {
	font: DrawFont;
	visible?: boolean;
	id?: string;
	style?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	color?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
}

export const LabelFont: Roact.FunctionComponent<LabelFontProps> = (props) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, generatedId, connections, externalComponentData, beforeReRender }) => {
				if (!props.id) props.id = generatedId();
				reRender();
				if (!components.has(props.id)) {
					components.set(props.id, window.WithFont(props.font));
				}
				const fontC = components.get(props.id)! as RenderFont;

				props.visible !== undefined && (fontC.Visible = props.visible);
				props.style && props.style.forEach(([renderStyle, value]) => fontC.SetStyle(renderStyle, value));
				props.color &&
					props.color.forEach(([colorStyle, color, alpha]) => fontC.SetColor(colorStyle, color, alpha));
				fontC.Font = props.font;

				const newValues = {
					window: fontC,
					reRender: reRender,
					beforeReRender: beforeReRender,
					connections: connections,
					externalComponentData: externalComponentData,
					generatedId: generatedId,
				};

				Roact.mount(<RootContext.Provider value={newValues}>{props[Roact.Children]}</RootContext.Provider>);

				return <></>;
			}}
		/>
	);
};

interface MarginLeftProps {
	pixels: number;
	visible?: boolean;
	id?: string;
	style?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	color?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
}

export const MarginLeftAbsolute: Roact.FunctionComponent<MarginLeftProps> = (props) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, generatedId, connections, externalComponentData, beforeReRender }) => {
				if (!props.id) props.id = generatedId();
				reRender();
				if (!components.has(props.id)) {
					components.set(props.id, window.Indent(props.pixels));
				}
				const margin = components.get(props.id)! as RenderIndent;

				props.visible !== undefined && (margin.Visible = props.visible);
				props.style && props.style.forEach(([renderStyle, value]) => margin.SetStyle(renderStyle, value));
				props.color &&
					props.color.forEach(([colorStyle, color, alpha]) => margin.SetColor(colorStyle, color, alpha));
				margin.Pixels = props.pixels;

				const newValues = {
					window: margin,
					reRender: reRender,
					beforeReRender: beforeReRender,
					connections: connections,
					externalComponentData: externalComponentData,
					generatedId: generatedId,
				};

				Roact.mount(<RootContext.Provider value={newValues}>{props[Roact.Children]}</RootContext.Provider>);

				return <></>;
			}}
		/>
	);
};

interface CollapsableProps {
	visible?: boolean;
	id?: string;
	text: string;
	style?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	color?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
	onToggle?: (open: boolean) => void;
	defaultOpen?: boolean;
}

export const Collapsable: Roact.FunctionComponent<CollapsableProps> = (props) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, generatedId, connections, externalComponentData, beforeReRender }) => {
				if (!props.id) props.id = generatedId();
				const collapsed =
					(externalComponentData.get(props.id) as boolean | undefined) ?? props.defaultOpen ?? false;
				externalComponentData.set(props.id, collapsed);
				reRender();
				if (!components.has(props.id)) {
					components.set(props.id, window.Collapsable(props.text, collapsed));
				}
				const collapsable = components.get(props.id)! as RenderCollapsable;

				props.visible !== undefined && (collapsable.Visible = props.visible);
				props.style && props.style.forEach(([renderStyle, value]) => collapsable.SetStyle(renderStyle, value));
				props.color &&
					props.color.forEach(([colorStyle, color, alpha]) => collapsable.SetColor(colorStyle, color, alpha));
				collapsable.HeaderLabel = props.text;

				const newValues = {
					window: collapsable,
					reRender: reRender,
					beforeReRender: beforeReRender,
					connections: connections,
					externalComponentData: externalComponentData,
					generatedId: generatedId,
				};

				Roact.mount(<RootContext.Provider value={newValues}>{props[Roact.Children]}</RootContext.Provider>);

				if (connections.has(props.id)) connections.get(props.id)!.Disconnect();
				connections.set(
					props.id,
					collapsable.OnUpdated.Connect(() => {
						externalComponentData.set(props.id!, !externalComponentData.get(props.id!));
						props.onToggle && props.onToggle(externalComponentData.get(props.id!) as boolean);
					}),
				);

				return <></>;
			}}
		/>
	);
};

interface ChildWindowProps {
	visible?: boolean;
	id?: string;
	size?: Vector2;
	style?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	color?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
}

export const ChildWindow: Roact.FunctionComponent<ChildWindowProps> = (props) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, beforeReRender, generatedId }) => {
				if (!props.id) props.id = generatedId();
				reRender();
				if (!components.has(props.id)) {
					components.set(props.id, window.Child());
				}
				const childWindow = components.get(props.id)! as RenderChildWindow;

				props.visible !== undefined && (childWindow.Visible = props.visible);
				props.style && props.style.forEach(([renderStyle, value]) => childWindow.SetStyle(renderStyle, value));
				props.color &&
					props.color.forEach(([colorStyle, color, alpha]) => childWindow.SetColor(colorStyle, color, alpha));
				props.size && (childWindow.Size = props.size);

				const newValues = {
					window: childWindow,
					reRender: reRender,
					beforeReRender: beforeReRender,
					connections: connections,
					externalComponentData: externalComponentData,
					generatedId: generatedId,
				};

				Roact.mount(<RootContext.Provider value={newValues}>{props[Roact.Children]}</RootContext.Provider>);

				return <></>;
			}}
		/>
	);
};

interface DummyWindowProps {
	visible?: boolean;
	id?: string;
	style?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	color?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
}

export const DummyWindow: Roact.FunctionComponent<DummyWindowProps> = (props) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, beforeReRender, generatedId }) => {
				if (!props.id) props.id = generatedId();
				reRender();
				if (!components.has(props.id)) {
					components.set(props.id, window.Dummy());
				}
				const dummyWindow = components.get(props.id)! as RenderDummyWindow;

				props.visible !== undefined && (dummyWindow.Visible = props.visible);
				props.style && props.style.forEach(([renderStyle, value]) => dummyWindow.SetStyle(renderStyle, value));
				props.color &&
					props.color.forEach(([colorStyle, color, alpha]) => dummyWindow.SetColor(colorStyle, color, alpha));

				const newValues = {
					window: dummyWindow,
					reRender: reRender,
					beforeReRender: beforeReRender,
					connections: connections,
					externalComponentData: externalComponentData,
					generatedId: generatedId,
				};

				Roact.mount(<RootContext.Provider value={newValues}>{props[Roact.Children]}</RootContext.Provider>);

				return <></>;
			}}
		/>
	);
};

interface RenderPopupProps {
	visible?: boolean;
	id?: string;
	show: boolean;
	style?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	color?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
}

export const RenderPopup: Roact.FunctionComponent<RenderPopupProps> = (props) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, beforeReRender, generatedId }) => {
				if (!props.id) props.id = generatedId();
				reRender();
				if (!components.has(props.id)) {
					components.set(props.id, window.Popup());
				}
				const popupWindow = components.get(props.id)! as RenderPopup;

				props.visible !== undefined && (popupWindow.Visible = props.visible);
				props.style && props.style.forEach(([renderStyle, value]) => popupWindow.SetStyle(renderStyle, value));
				props.color &&
					props.color.forEach(([colorStyle, color, alpha]) => popupWindow.SetColor(colorStyle, color, alpha));
				props.show && popupWindow.Show();

				const newValues = {
					window: popupWindow,
					reRender: reRender,
					beforeReRender: beforeReRender,
					connections: connections,
					externalComponentData: externalComponentData,
					generatedId: generatedId,
				};

				Roact.mount(<RootContext.Provider value={newValues}>{props[Roact.Children]}</RootContext.Provider>);

				return <></>;
			}}
		/>
	);
};

interface LabelProps {
	text: string;
	visible?: boolean;
	id?: string;
}

export const Label = (props: LabelProps) => {
	return (
		<RootContext.Consumer
			render={({ window, reRender, connections, externalComponentData, generatedId }) => {
				if (!props.id) props.id = generatedId();
				reRender();
				if (!components.has(props.id)) {
					components.set(props.id, window.Label(props.text));
				}
				const label = components.get(props.id)! as RenderLabel;

				label.Label = props.text;
				props.visible !== undefined && (label.Visible = props.visible);

				return <></>;
			}}
		/>
	);
};

export class RenderWindowRoact extends Roact.Component<{
	onTop?: boolean;
	minSize?: Vector2;
	maxSize?: Vector2;
	defaultSize?: Vector2;
	canResize?: boolean;
	visible?: boolean;
	name: string;
	color?: [colorStyle: RenderColorOption, color: Color3, alpha: number][];
	style?: [renderStyle: RenderStyleOption, value: number | Vector2][];
	id: string;
	fullRerender?: boolean;

	//window: RenderWindow;
}> {
	private isRendering = false;
	private beforeReRender = new SynSignal();
	private connections = new Map<string, SynConnection>();
	private externalComponentData = new Map<string, unknown>(); // States that don't re-render the component
	private window: RenderWindow | undefined;
	private componentId = 0;

	public render() {
		this.isRendering = true;

		if (!components.get(this.props.id)) {
			components.set(this.props.id, new RenderWindow(this.props.name));
		}
		this.window = components.get(this.props.id)! as RenderWindow;

		this.props.onTop !== undefined && (this.window!.VisibilityOverride = this.props.onTop);
		this.props.minSize !== undefined && (this.window!.MinSize = this.props.minSize);
		this.props.maxSize !== undefined && (this.window!.MaxSize = this.props.maxSize);
		this.props.defaultSize !== undefined && (this.window!.DefaultSize = this.props.defaultSize);
		this.props.canResize !== undefined && (this.window!.CanResize = this.props.canResize);
		this.props.visible !== undefined && (this.window!.Visible = this.props.visible);
		this.props.color !== undefined &&
			this.props.color.forEach(([colorStyle, color, alpha]) => this.window!.SetColor(colorStyle, color, alpha));

		this.props.style !== undefined &&
			this.props.style.forEach(([renderStyle, value]) => this.window!.SetStyle(renderStyle, value));

		return (
			<RootContext.Provider
				value={{
					window: this.window,
					reRender: () => this.reRender(),
					beforeReRender: this.beforeReRender,
					connections: this.connections,
					externalComponentData: this.externalComponentData,
					generatedId: () => this.generateComponentId(),
				}}
			>
				{this.props[Roact.Children]}
			</RootContext.Provider>
		);
	}

	public generateComponentId(): string {
		this.componentId++;
		return `Generated_(${this.props.id})_${this.componentId}`;
	}

	public didMount(): void {
		//print("DEBUG: didMount");
		this.isRendering = false;
	}

	public willUnmount(): void {
		print("DEBUG: willUnmount");
		this.connections.forEach((connection) => connection.Disconnect());
		this.externalComponentData.clear();
		this.window!.Remove();
	}

	public didUpdate(): void {
		//print("DEBUG: didUpdate");
		this.isRendering = false;
	}

	public willUpdate(): void {
		//print("DEBUG: willUpdate" + this.props.id);
		this.componentId = 0;
		this.beforeReRender.Fire();
		if (this.props.fullRerender) {
			this.window?.Clear();
			components.clear();
			components.set(this.props.id, this.window!);
		}
		this.isRendering = true;
	}

	public reRender(override?: boolean): void {
		// Removed
	}
}

// Helper Components
export const MarginUp = (props: { amount: number }) => {
	return (
		<DummyWindow
			color={[
				[RenderColorOption.Button, Color3.fromRGB(0, 0, 0), 1],
				[RenderColorOption.ButtonActive, Color3.fromRGB(0, 0, 0), 1],
				[RenderColorOption.ButtonHovered, Color3.fromRGB(0, 0, 0), 1],
			]}
		>
			<Button size={new Vector2(10, props.amount)} text=""></Button>
		</DummyWindow>
	);
};

export const MarginLeft = (props: { amount: number }) => {
	return (
		<DummyWindow
			color={[
				[RenderColorOption.Button, Color3.fromRGB(0, 0, 0), 0],
				[RenderColorOption.ButtonActive, Color3.fromRGB(0, 0, 0), 0],
				[RenderColorOption.ButtonHovered, Color3.fromRGB(0, 0, 0), 0],
			]}
		>
			<Button size={new Vector2(props.amount, 1)} text=""></Button>
		</DummyWindow>
	);
};
