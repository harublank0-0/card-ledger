import { Download, FileSpreadsheet } from "lucide-react";

import { Panel } from "#/components/panel";
import { SettingsSection } from "#/components/settings-section";
import { CSV_ENTITIES, type CsvEntity } from "#/features/export/export.logic";

const CSV_LABELS: Record<CsvEntity, string> = {
	transactions: "Transactions",
	statements: "Statements",
	"statement-payments": "Statement payments",
	subscriptions: "Subscriptions",
	cards: "Cards",
	categories: "Categories",
};

const downloadClass =
	"inline-flex items-center gap-2 rounded-md font-medium text-foreground underline decoration-border-strong underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Download links. Plain anchors: the browser saves the file; nothing is cached or tracked. */
export function YourData() {
	return (
		<SettingsSection
			id="your-data-title"
			title="Your data"
			description="Your records belong to you. Download them any time; the files contain only your own data and no sign-in secrets."
		>
			<Panel>
				<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
					<div>
						<p className="font-medium">Everything</p>
						<p className="text-xs text-muted-foreground">
							One JSON file with all of your records
						</p>
					</div>
					<a href="/api/export/json" download className={downloadClass}>
						<Download aria-hidden="true" className="size-4" />
						Download everything (JSON)
					</a>
				</div>
				<div className="border-t px-4 py-4 sm:px-5">
					<p className="font-medium">Spreadsheets (CSV)</p>
					<ul className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
						{(Object.keys(CSV_ENTITIES) as CsvEntity[]).map((entity) => (
							<li key={entity}>
								<a
									href={`/api/export/csv/${entity}`}
									download
									className={downloadClass}
								>
									<FileSpreadsheet
										aria-hidden="true"
										className="size-4 text-muted-foreground"
									/>
									{CSV_LABELS[entity]}
								</a>
							</li>
						))}
					</ul>
				</div>
			</Panel>
		</SettingsSection>
	);
}
