import React from "react";

export function DeepContextTestComponent() {
	const t = (key: string) => key;

	return (
		<div
			// context: tooltip for save button
			title={t("action.save.tooltip")}
			variant="primary"
		>
			{/* context: main button label */}
			{t("action.save.label")}
		</div>
	);
}

// context: Global helper
const helper = () => {
	t("global.error");
};
