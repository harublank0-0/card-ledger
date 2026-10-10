import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	createCategoryFn,
	listCategoriesFn,
	renameCategoryFn,
	setCategoryArchivedFn,
} from "#/features/categories/categories.functions";
import { MAX_CATEGORY_NAME_LENGTH } from "#/features/categories/categories.logic";
import { useAction } from "#/lib/use-action";

export const Route = createFileRoute("/_authed/categories")({
	validateSearch: z.object({
		archived: z.boolean().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ archived: search.archived ?? false }),
	loader: ({ deps }) =>
		listCategoriesFn({ data: { includeArchived: deps.archived } }),
	component: Categories,
});

type CategoryRow = { id: string; name: string; archived: boolean };

function Categories() {
	const categories = Route.useLoaderData();
	const { archived = false } = Route.useSearch();
	const create = useServerFn(createCategoryFn);
	const [name, setName] = useState("");
	const { run, pending, error } = useAction();

	return (
		<section className="grid max-w-xl gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">Categories</h1>
				<div className="flex items-center gap-2">
					<Button asChild variant="ghost" size="sm">
						<Link
							to="/categories"
							search={{ archived: archived ? undefined : true }}
						>
							{archived ? "Hide archived" : "Show archived"}
						</Link>
					</Button>
					<Button asChild variant="outline" size="sm">
						<Link to="/transactions">Back to transactions</Link>
					</Button>
				</div>
			</div>

			<form
				className="flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					void run(async () => {
						await create({ data: { name } });
						setName("");
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
					Add
				</Button>
			</form>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}

			<ul className="grid gap-2">
				{categories.map((category) => (
					<CategoryItem
						key={category.id}
						category={category}
						run={run}
						pending={pending}
					/>
				))}
			</ul>
		</section>
	);
}

function CategoryItem({
	category,
	run,
	pending,
}: {
	category: CategoryRow;
	run: (action: () => Promise<unknown>) => Promise<unknown>;
	pending: boolean;
}) {
	const rename = useServerFn(renameCategoryFn);
	const setArchived = useServerFn(setCategoryArchivedFn);
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(category.name);

	return (
		<li className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-sm">
			{editing ? (
				<form
					className="flex flex-1 gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						void run(async () => {
							await rename({ data: { id: category.id, name: draft } });
							setEditing(false);
						});
					}}
				>
					<Input
						aria-label="Category name"
						maxLength={MAX_CATEGORY_NAME_LENGTH}
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
					/>
					<Button type="submit" size="sm" disabled={pending}>
						Save
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
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
					<span className={category.archived ? "text-muted-foreground" : ""}>
						{category.name}
						{category.archived && (
							<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs">
								Archived
							</span>
						)}
					</span>
					<span className="flex gap-1">
						<Button
							size="sm"
							variant="outline"
							onClick={() => setEditing(true)}
						>
							Rename
						</Button>
						<Button
							size="sm"
							variant="ghost"
							disabled={pending}
							onClick={() =>
								run(() =>
									setArchived({
										data: { id: category.id, archived: !category.archived },
									}),
								)
							}
						>
							{category.archived ? "Restore" : "Archive"}
						</Button>
					</span>
				</>
			)}
		</li>
	);
}
