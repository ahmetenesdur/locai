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

/** Confirmation dialog shown before a project is deleted. */
export const DeleteDialog = () => {
	const t = (key: string) => key;
	const title = t("delete.title");
	// eslint-disable-next-line no-console
	const handleError = () => console.error(t("delete.failed"));

	return (
		<Dialog title={title} onError={handleError}>
			{/* context: destructive action, keep it short */}
			<Button variant="danger" size="sm">
				{t("delete.confirm")}
			</Button>
		</Dialog>
	);
};

export function MembersTable() {
	const t = (key: string) => key;
	const columns = [
		{ header: t("members.name"), accessor: "name", sortable: true, width: 240 },
		{ header: t("members.email"), accessor: "email", sortable: true, width: 240 },
		{ header: t("members.role"), accessor: "role", sortable: false, width: 120 },
	];

	return <Table columns={columns} />;
}
