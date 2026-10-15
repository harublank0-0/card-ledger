import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, Pencil, Plus, Tags } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { ActionError, EmptyState, StatusBadge } from "#/components/feedback";
import { PageHeader } from "#/components/page-header";
import { Panel } from "#/components/panel";
import {
	segmentedGroupClass,
	segmentedItemClass,
} from "#/components/segmented";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	createCategoryFn,
	listCategoriesFn,
	renameCategoryFn,
	setCategoryArchivedFn,
} from "#/features/categories/categories.functions";
import { MAX_CATEGORY_NAME_LENGTH } from "#/features/categories/categories.logic";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";
import { useAction } from "#/lib/use-action";

export const Route = createFileRoute("/_authed/categories")({
	head: pageTitle("Categories"),
	validateSearch: z.object({
		archived: z.boolean().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ archived: search.archived ?? false }),
	loader: ({ deps }) =>
		listCategoriesFn({ data: { includeArchived: deps.archived } }),
	component: Categories,
});

type CategoryRow = { id: string; name: string; archived: boolean };
type Run = ReturnType<typeof useAction>["run"];

function Categories() {
	const categories = Route.useLoaderData();
	const create = useServerFn(createCategoryFn);
	const [name, setName] = useState("");
	const { run, pending, error } = useAction();

	return (
		<div className="max-w-2xl">
			<PageHeader
				title="Categories"
				description="Group your transactions so the dashboard can show where your money goes."
				actions={
					<Button asChild variant="outline">
						<Link to="/transactions">Back to transactions</Link>
					</Button>
				}
			/>

			<Panel aria-label="Categories">
				<div className="grid gap-3 border-b bg-background/50 px-4 py-3.5 sm:px-5">
					<form
						className="flex gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							void run(async () => {
								await create({ data: { name } });
								setName("");
								notify("Category added");
							});
						}}
					>
						<Input
							aria-label="New category name"
							placeholder="New category"
							maxLength={MAX_CATEGORY_NAME_LENGTH}
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<Button type="submit" disabled={pending || name.trim() === ""}>
							<Plus aria-hidden="true" />
							Add
						</Button>
					</form>
					<ActionError error={error} />
					<nav aria-label="Which categories" className={segmentedGroupClass}>
						<Link
							to="/categories"
							search={{}}
							activeOptions={{ exact: true }}
							className={segmentedItemClass}
						>
							In use
						</Link>
						<Link
							to="/categories"
							search={{ archived: true }}
							activeOptions={{ exact: true }}
							className={segmentedItemClass}
						>
							Including archived
						</Link>
					</nav>
				</div>

				{categories.length === 0 ? (
					<EmptyState icon={Tags} title="No categories yet">
						Add one above, then pick it when you record a transaction.
					</EmptyState>
				) : (
					<ul className="divide-y">
						{categories.map((category) => (
							<CategoryItem
								key={category.id}
								category={category}
								run={run}
								pending={pending}
							/>
						))}
					</ul>
				)}
			</Panel>
		</div>
	);
}

function CategoryItem({
	category,
	run,
	pending,
}: {
	category: CategoryRow;
	run: Run;
	pending: boolean;
}) {
	const rename = useServerFn(renameCategoryFn);
	const setArchived = useServerFn(setCategoryArchivedFn);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(category.name);

	return (
		<li className="flex min-h-13 items-center justify-between gap-2 px-4 py-2 sm:px-5">
			{editing ? (
				<form
					className="flex flex-1 gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						void run(async () => {
							await rename({ data: { id: category.id, name: draft } });
							setEditing(false);
							notify("Category renamed");
						});
					}}
				>
					<Input
						aria-label="Category name"
						maxLength={MAX_CATEGORY_NAME_LENGTH}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						autoFocus
					/>
					<Button type="submit" size="sm" className="h-9" disabled={pending}>
						Save
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="h-9"
						onClick={() => {
							setDraft(category.name);
							setEditing(false);
						}}
					>
						Cancel
					</Button>
				</form>
			) : (
				<>
					<span className="flex min-w-0 items-center gap-2">
						<span
							className={
								category.archived
									? "truncate text-muted-foreground"
									: "truncate font-medium"
							}
						>
							{category.name}
						</span>
						{category.archived && <StatusBadge>Archived</StatusBadge>}
					</span>
					<span className="flex shrink-0 gap-1">
						<Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
							<Pencil aria-hidden="true" />
							Rename
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={pending}
							onClick={async () => {
								const outcome = await run(() =>
									setArchived({
										data: { id: category.id, archived: !category.archived },
									}),
								);
								if (outcome === "done")
									notify(
										category.archived
											? "Category restored"
											: "Category archived",
									);
							}}
						>
							{category.archived ? (
								<ArchiveRestore aria-hidden="true" />
							) : (
								<Archive aria-hidden="true" />
							)}
							{category.archived ? "Restore" : "Archive"}
						</Button>
					</span>
				</>
			)}
		</li>
	);
}
