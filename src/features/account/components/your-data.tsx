import { CSV_ENTITIES, type CsvEntity } from "#/features/export/export.logic";

const CSV_LABELS: Record<CsvEntity, string> = {
	transactions: "Transactions",
	statements: "Statements",
	"statement-payments": "Statement payments",
	subscriptions: "Subscriptions",
	cards: "Cards",
	categories: "Categories",
};

/** Download links. Plain anchors: the browser saves the file; nothing is cached or tracked. */
export function YourData() {
	return (
		<section
			aria-labelledby="your-data-title"
			className="grid gap-3 rounded-xl border bg-card p-5 shadow-sm"
		>
			<div>
				<h2 id="your-data-title" className="text-lg font-medium">
					Your data
				</h2>
				<p className="text-sm text-muted-foreground">
					Your records belong to you. Download them any time; the files contain
					only your own data and no sign-in secrets.
				</p>
			</div>
			<p>
				<a
					href="/api/export/json"
					download
					className="text-sm font-medium underline"
				>
					Download everything (JSON)
				</a>
			</p>
			<div>
				<p className="text-sm font-medium">Spreadsheets (CSV)</p>
				<ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
					{(Object.keys(CSV_ENTITIES) as CsvEntity[]).map((entity) => (
						<li key={entity}>
							<a
								href={`/api/export/csv/${entity}`}
								download
								className="underline"
							>
								{CSV_LABELS[entity]}
							</a>
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
